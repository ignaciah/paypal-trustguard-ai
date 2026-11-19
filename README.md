# TrustGuard AI

A pre-purchase payment risk advisor built for the PayPal AI Hackathon. A shopper describes a purchase, **Claude** produces a plain-language risk assessment, and the shopper can complete the payment with **PayPal Checkout** only when the result allows it.

## Features

1. **Landing page** explaining the product.
2. **Transaction analysis form** (merchant, amount, category, red flags noticed).
3. **AI risk assessment** from Claude: risk score, confidence score, explanation, recommended action, safer alternatives.
4. **Risk score dashboard**: gauge, confidence meter, seven risk dimensions.
5. **PayPal Checkout button** (sandbox or live), gated by the assessment.
6. **Results page** with warning signs, trust signals, uncertainties, next steps and PayPal protection explainer.

## How it works

```
Browser                         Next.js server                         External
-------                         --------------                         --------
Form  ── POST /api/analyze ───▶ validate (zod) + rate limit
                                rule-based baseline ───────────────┐
                                Claude assessment  ───────────────▶ Anthropic API
                                safety guardrails (can only raise risk)
                                sign token {amount, currency, verdict}
Results ◀─ { result, token } ──
PayPal button ─ POST /api/paypal/create-order {token} ─▶ verify token, refuse if Block
                                                          create order ──▶ PayPal Orders v2
        approve in PayPal popup
        ─ POST /api/paypal/capture-order {orderId} ────▶ capture ───────▶ PayPal Orders v2
```

Design decisions worth knowing:

- **Claude never gets the last word on safety.** `src/lib/guardrails.ts` applies hard rules (e.g. asked to pay outside normal checkout, far-too-low price plus pressure). They can raise the score or make the action stricter, never lower it.
- **Graceful fallback.** If the Anthropic key is missing or the call fails, a deterministic rule-based assessment is used and the UI says so.
- **Tamper-resistant checkout.** The amount and currency used to create the PayPal order come from an HMAC-signed token issued by `/api/analyze`, not from the browser. A `Block Transaction` verdict cannot create an order.
- **Honest limits.** Claude cannot browse. The prompt forbids claiming it verified a merchant, caps confidence, and requires an "uncertainties" list.
- **Prompt-injection hygiene.** User-entered fields are passed as JSON data and the system prompt tells the model to ignore instructions inside them.
- **No PayPal Checkout Server SDK.** `@paypal/checkout-server-sdk` is deprecated, so the server calls the PayPal Orders v2 REST API directly. The browser uses `@paypal/react-paypal-js`.

## Project structure

```
paypal-trustguard-ai/
├── .env.example                 Environment variable template
├── .gitignore
├── next.config.mjs              Next.js config + security headers
├── package.json
├── postcss.config.mjs
├── render.yaml                  Render Blueprint
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts             Unit test config
└── src/
    ├── app/
    │   ├── globals.css
    │   ├── layout.tsx
    │   ├── page.tsx                         Landing page
    │   ├── analyze/page.tsx                 Transaction analysis form page
    │   ├── results/page.tsx                 Results page
    │   └── api/
    │       ├── analyze/route.ts             POST: risk assessment
    │       ├── health/route.ts              GET: Render health check
    │       └── paypal/
    │           ├── create-order/route.ts    POST: create PayPal order
    │           └── capture-order/route.ts   POST: capture approved order
    ├── components/
    │   ├── AnalysisForm.tsx
    │   ├── Footer.tsx
    │   ├── Header.tsx
    │   ├── PayPalCheckout.tsx
    │   ├── ResultsView.tsx
    │   ├── RiskDashboard.tsx
    │   └── RiskGauge.tsx
    └── lib/
        ├── claude.ts                Anthropic client, system prompt, JSON parsing
        ├── env.ts                   Env helpers
        ├── fixtures.ts              Shared test data
        ├── guardrails.ts            Hard safety rules
        ├── heuristics.ts            Rule-based baseline and fallback
        ├── paypal.ts                PayPal Orders v2 REST client
        ├── rate-limit.ts            In-memory rate limiter
        ├── risk.ts                  Score bands, actions, styles
        ├── schema.ts                zod schemas and shared types
        ├── storage.ts               sessionStorage helpers
        ├── token.ts                 HMAC-signed checkout token
        └── *.test.ts                Unit tests for the modules above
```

## Run locally

Requires Node.js 20+.

```bash
git clone <your-repo-url> paypal-trustguard-ai
cd paypal-trustguard-ai
npm install
cp .env.example .env.local
# fill in the values (see below)
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | server | Claude API key. Optional: without it the rule-based fallback is used. |
| `ANTHROPIC_MODEL` | server | Model name. Defaults to `claude-sonnet-5-5`. |
| `PAYPAL_ENV` | server | `sandbox` (default) or `live`. |
| `PAYPAL_CLIENT_ID` | server | PayPal REST app client ID. |
| `PAYPAL_CLIENT_SECRET` | server | PayPal REST app secret. Never expose it. |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | browser | Same value as `PAYPAL_CLIENT_ID`. **Inlined at build time.** |
| `TOKEN_SECRET` | server | Random secret for signing checkout tokens. `openssl rand -base64 48` |

### PayPal sandbox setup

1. Go to the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/) and open **Apps & Credentials** in **Sandbox** mode.
2. Create an app (or use the default one) and copy the **Client ID** and **Secret**.
3. Under **Testing tools → Sandbox accounts**, use a **Personal** sandbox account to log in during checkout.

### Try it

- Low-ish risk: an established merchant (over 2 years), contact info and returns ticked, small amount.
- Block: tick "asked to pay outside normal checkout". Checkout is disabled.
- Delay: electronics, $499, new merchant, price far below other stores. You must acknowledge the warnings before the PayPal button activates.

## Tests

```bash
npm test            # run once
npm run test:watch  # re-run on change
npm run typecheck   # TypeScript only
```

Vitest unit tests cover the logic that decides whether someone gets to pay:

| File | What it protects |
| --- | --- |
| `risk.test.ts` | Score bands map to the right level and action; boundaries at 25, 60 and 80. |
| `heuristics.test.ts` | Clean profiles score low, scam-like profiles score high, confidence stays capped, output matches the schema. |
| `guardrails.test.ts` | Hard rules (off-platform payment, gift cards plus pressure, too-low price) override a lenient model, and nothing ever lowers a score. |
| `token.test.ts` | Signed checkout tokens reject tampered amounts, bad signatures, wrong secrets, expiry and malformed input. |
| `rate-limit.test.ts` | Limit, per-key isolation, window reset, client IP parsing. |
| `schema.test.ts` | Form validation, model-output validation and JSON extraction from Claude's reply. |
| `paypal.test.ts` | PayPal client against a mocked `fetch`: Basic auth, Bearer token, `CAPTURE` intent, two-decimal amounts, 127-character description cap, sandbox vs live host, token caching and refresh, error handling, URL-encoded order ids. |
| `api/analyze/route.test.ts` | Route with Claude mocked: validation, rules fallback with no key or on Claude failure, Claude path, guardrails overriding Claude, signed token contents, 503 and 429 behaviour. |
| `api/paypal/create-order/route.test.ts` | Amount comes from the signed token (not the body), Block verdicts cannot create orders, forged or expired tokens get 401, errors are generic and leak nothing. |
| `api/paypal/capture-order/route.test.ts` | Order id validation (rejects path tricks and non-strings), normalized result, generic 502 and 503 errors, rate limiting. |

No test calls Anthropic or PayPal for real: Claude and the PayPal client are mocked, and the PayPal client test replaces `fetch`.

Not covered yet: the React components and a real end-to-end run. Before going live, add a Playwright flow against the PayPal sandbox.

## Deploy to Render

### Option A: Blueprint (recommended)

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, select the repo. Render reads `render.yaml`.
3. When prompted, fill in the secrets marked `sync: false`: `ANTHROPIC_API_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`. `TOKEN_SECRET` is generated for you.
4. Deploy. Render uses `/api/health` as the health check.

### Option B: Manual web service

1. **New → Web Service**, connect the repo.
2. Runtime **Node**, build command `npm install --include=dev && npm run build`, start command `npm start`.
3. Add the environment variables from the table above. Set `NODE_VERSION=20`.
4. Set **Health Check Path** to `/api/health`.

### Render notes

- `NEXT_PUBLIC_PAYPAL_CLIENT_ID` is baked into the bundle at build time. If you change it, trigger a **new deploy** (Clear build cache & deploy).
- After you generate and commit `package-lock.json`, switch the build command to `npm ci && npm run build` for reproducible builds.
- Free instances sleep when idle; the first request after a pause is slow. Open the site before demoing.
- The rate limiter is in memory and per instance. Use Redis/Upstash if you scale beyond one instance.
- To go live: set `PAYPAL_ENV=live`, use live credentials, and rebuild.

## API reference

### `POST /api/analyze`

Body: the form fields (see `analysisInputSchema` in `src/lib/schema.ts`). Returns `{ result, token }` or `400 { error, fieldErrors }`, `429`, `503`.

### `POST /api/paypal/create-order`

Body: `{ "token": "<token from /api/analyze>" }`. Returns `{ id }`. `401` if the token is invalid or expired (30 minutes), `403` if the verdict was Block Transaction.

### `POST /api/paypal/capture-order`

Body: `{ "orderId": "<PayPal order id>" }`. Returns `{ id, status, captureId, amount, currency }`.

### `GET /api/health`

Returns `{ status: "ok" }`.

## Known limitations (read before production)

- **Demo payee.** The PayPal order pays the app's own PayPal account. A real product would use PayPal Commerce Platform / partner flows so the evaluated merchant is the payee.
- **Self-reported inputs.** The assessment depends on what the user enters. There is no domain-age lookup, review lookup or merchant database. Adding those (WHOIS, Google Safe Browsing, Trustpilot, PayPal merchant data) would raise confidence honestly.
- **Currencies are treated at par** when bucketing the amount. Add FX conversion for accuracy.
- **No persistence.** Results live in `sessionStorage`; there is no database or user accounts.
- **No webhooks.** Add a PayPal webhook endpoint (`PAYMENT.CAPTURE.COMPLETED`) before relying on payment state for fulfilment.
- **No CSP header.** A strict Content-Security-Policy needs to allow PayPal's script, frame and connect domains. Add one after testing.
- **No end-to-end or component tests.** Unit and mocked route tests cover the logic and API layer; the React UI and the real PayPal popup flow are untested.

## Disclaimer

TrustGuard AI provides guidance only. It is not financial or legal advice and is not affiliated with PayPal. A low score does not guarantee safety.
