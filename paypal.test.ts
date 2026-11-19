import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const ENV_KEYS = ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_ENV"] as const;
const savedEnv: Record<string, string | undefined> = {};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const CAPTURED = {
  id: "ORDER1",
  status: "COMPLETED",
  purchase_units: [
    { payments: { captures: [{ id: "CAP1", status: "COMPLETED", amount: { value: "499.00", currency_code: "USD" } }] } },
  ],
};

/** Installs a fake fetch that answers the three PayPal endpoints. Override any route per test. */
function installFetch(overrides: Partial<Record<"token" | "orders" | "capture", () => Response>> = {}) {
  const fn = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.includes("/v1/oauth2/token")) return (overrides.token ?? (() => json({ access_token: "tok-1", expires_in: 3600 })))();
    if (url.endsWith("/capture")) return (overrides.capture ?? (() => json(CAPTURED)))();
    if (url.includes("/v2/checkout/orders")) return (overrides.orders ?? (() => json({ id: "ORDER1", status: "CREATED" })))();
    throw new Error(`Unexpected URL in test: ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const urlsOf = (fn: ReturnType<typeof installFetch>) => fn.mock.calls.map(([url]) => String(url));
const headersOf = (init: RequestInit | undefined) => (init?.headers ?? {}) as Record<string, string>;

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("Expected the promise to reject");
}

async function loadPaypal() {
  vi.resetModules(); // fresh module = empty access-token cache
  return import("./paypal");
}

describe("paypal client", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    process.env.PAYPAL_CLIENT_ID = "client-id";
    process.env.PAYPAL_CLIENT_SECRET = "client-secret";
    delete process.env.PAYPAL_ENV;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  describe("createOrder", () => {
    it("authenticates with Basic credentials, then creates a CAPTURE order with a Bearer token", async () => {
      const fetchMock = installFetch();
      const { createOrder } = await loadPaypal();

      const order = await createOrder({ amount: 499, currency: "USD", description: "Test purchase" });
      expect(order).toEqual({ id: "ORDER1", status: "CREATED" });

      const [authUrl, authInit] = fetchMock.mock.calls[0];
      expect(authUrl).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
      expect(headersOf(authInit).Authorization).toBe(`Basic ${Buffer.from("client-id:client-secret").toString("base64")}`);
      expect(authInit?.body).toBe("grant_type=client_credentials");

      const [orderUrl, orderInit] = fetchMock.mock.calls[1];
      expect(orderUrl).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
      expect(orderInit?.method).toBe("POST");
      expect(headersOf(orderInit).Authorization).toBe("Bearer tok-1");
      expect(headersOf(orderInit)["PayPal-Request-Id"].length).toBeGreaterThan(10);

      const body = JSON.parse(String(orderInit?.body));
      expect(body.intent).toBe("CAPTURE");
      expect(body.purchase_units[0].amount).toEqual({ currency_code: "USD", value: "499.00" });
      expect(body.purchase_units[0].description).toBe("Test purchase");
    });

    it.each([
      [19.5, "19.50"],
      [10, "10.00"],
      [0.1 + 0.2, "0.30"],
      [1234.567, "1234.57"],
    ])("formats amount %s as %s", async (amount, expected) => {
      const fetchMock = installFetch();
      const { createOrder } = await loadPaypal();
      await createOrder({ amount, currency: "EUR", description: "x" });
      const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
      expect(body.purchase_units[0].amount.value).toBe(expected);
      expect(body.purchase_units[0].amount.currency_code).toBe("EUR");
    });

    it("truncates the description to PayPal's 127-character limit", async () => {
      const fetchMock = installFetch();
      const { createOrder } = await loadPaypal();
      await createOrder({ amount: 5, currency: "USD", description: "d".repeat(300) });
      const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
      expect(body.purchase_units[0].description.length).toBe(127);
    });

    it("uses the live API host when PAYPAL_ENV=live", async () => {
      process.env.PAYPAL_ENV = "live";
      const fetchMock = installFetch();
      const { createOrder } = await loadPaypal();
      await createOrder({ amount: 5, currency: "USD", description: "x" });
      expect(urlsOf(fetchMock).every((u) => u.startsWith("https://api-m.paypal.com/"))).toBe(true);
    });

    it("falls back to the sandbox host for any other PAYPAL_ENV value", async () => {
      process.env.PAYPAL_ENV = "production";
      const fetchMock = installFetch();
      const { createOrder } = await loadPaypal();
      await createOrder({ amount: 5, currency: "USD", description: "x" });
      expect(urlsOf(fetchMock)[0]).toContain("api-m.sandbox.paypal.com");
    });

    it("reuses the access token across calls", async () => {
      const fetchMock = installFetch();
      const { createOrder } = await loadPaypal();
      await createOrder({ amount: 5, currency: "USD", description: "x" });
      await createOrder({ amount: 6, currency: "USD", description: "y" });
      expect(urlsOf(fetchMock).filter((u) => u.includes("/oauth2/token")).length).toBe(1);
    });

    it("fetches a new token shortly before the old one expires", async () => {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const fetchMock = installFetch();
      const { createOrder } = await loadPaypal();
      await createOrder({ amount: 5, currency: "USD", description: "x" });

      vi.setSystemTime(new Date("2026-01-01T00:59:01Z")); // 59 s before expiry, inside the 60 s safety margin
      await createOrder({ amount: 5, currency: "USD", description: "x" });
      expect(urlsOf(fetchMock).filter((u) => u.includes("/oauth2/token")).length).toBe(2);
    });

    it("throws with the status and PayPal debug id when authentication fails", async () => {
      installFetch({ token: () => json({ error: "invalid_client" }, 401, { "paypal-debug-id": "dbg-777" }) });
      const { createOrder } = await loadPaypal();
      const error = await rejection(createOrder({ amount: 5, currency: "USD", description: "x" }));
      expect(error.message).toMatch(/auth failed \(401\)/);
      expect(error.message).toContain("dbg-777");
    });

    it("throws with the status when order creation fails, and caps the logged response body", async () => {
      installFetch({ orders: () => new Response("x".repeat(2000), { status: 422, headers: { "paypal-debug-id": "dbg-1" } }) });
      const { createOrder } = await loadPaypal();
      const error = await rejection(createOrder({ amount: 5, currency: "USD", description: "x" }));
      expect(error.message).toMatch(/failed \(422\)/);
      expect(error.message.length).toBeLessThan(500);
    });

    it("throws a ConfigError before any network call when credentials are missing", async () => {
      delete process.env.PAYPAL_CLIENT_SECRET;
      const fetchMock = installFetch();
      const { createOrder } = await loadPaypal();
      const error = await rejection(createOrder({ amount: 5, currency: "USD", description: "x" }));
      // Compare by name: vi.resetModules() re-evaluates ./env, so the class identity differs.
      expect(error.name).toBe("ConfigError");
      expect(fetchMock.mock.calls.length).toBe(0);
    });
  });

  describe("captureOrder", () => {
    it("POSTs to the capture endpoint and returns a normalized result", async () => {
      const fetchMock = installFetch();
      const { captureOrder } = await loadPaypal();

      const result = await captureOrder("ORDER1");
      expect(result).toEqual({ id: "ORDER1", status: "COMPLETED", captureId: "CAP1", amount: "499.00", currency: "USD" });

      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER1/capture");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeUndefined();
      expect(headersOf(init).Authorization).toBe("Bearer tok-1");
    });

    it("URL-encodes the order id", async () => {
      const fetchMock = installFetch();
      const { captureOrder } = await loadPaypal();
      await captureOrder("AB/CD?x=1");
      expect(urlsOf(fetchMock)[1]).toContain("/orders/AB%2FCD%3Fx%3D1/capture");
    });

    it("returns null capture details when PayPal reports none", async () => {
      installFetch({ capture: () => json({ id: "ORDER1", status: "PAYER_ACTION_REQUIRED" }) });
      const { captureOrder } = await loadPaypal();
      expect(await captureOrder("ORDER1")).toEqual({
        id: "ORDER1",
        status: "PAYER_ACTION_REQUIRED",
        captureId: null,
        amount: null,
        currency: null,
      });
    });

    it("throws with the status when the capture fails", async () => {
      installFetch({ capture: () => json({ name: "INSTRUMENT_DECLINED" }, 422, { "paypal-debug-id": "dbg-9" }) });
      const { captureOrder } = await loadPaypal();
      const error = await rejection(captureOrder("ORDER1"));
      expect(error.message).toMatch(/failed \(422\)/);
      expect(error.message).toContain("dbg-9");
    });
  });
});
