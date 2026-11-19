import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessWithClaude } from "@/lib/claude";
import { cleanInput, modelOutput, postJson } from "@/lib/fixtures";
import { verifyToken } from "@/lib/token";
import { POST } from "./route";

vi.mock("@/lib/claude", () => ({
  assessWithClaude: vi.fn(),
  claudeModel: () => "test-model",
}));

const mockedClaude = vi.mocked(assessWithClaude);

// Each test uses its own IP so the in-memory rate limiter does not leak between tests.
let ipCounter = 0;
const nextIp = () => `198.51.100.${++ipCounter}`;
const analyze = (body: unknown, ip = nextIp()) => POST(postJson("/api/analyze", body, ip));

describe("POST /api/analyze", () => {
  const saved = { key: process.env.ANTHROPIC_API_KEY, secret: process.env.TOKEN_SECRET };

  beforeEach(() => {
    process.env.TOKEN_SECRET = "route-test-secret";
    delete process.env.ANTHROPIC_API_KEY;
    mockedClaude.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved.key;
    if (saved.secret === undefined) delete process.env.TOKEN_SECRET;
    else process.env.TOKEN_SECRET = saved.secret;
  });

  describe("validation", () => {
    it("returns 400 with field errors for invalid input", async () => {
      const res = await analyze({ ...cleanInput, amount: -5 });
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(Array.isArray(data.fieldErrors.amount)).toBe(true);
      expect(mockedClaude.mock.calls.length).toBe(0);
    });

    it("returns 400 when the body is not JSON", async () => {
      const res = await analyze("this is not json");
      expect(res.status).toBe(400);
    });

    it("returns 400 when the body is empty", async () => {
      const res = await analyze(undefined);
      expect(res.status).toBe(400);
    });
  });

  describe("assessment source", () => {
    it("uses the rule-based assessment when no API key is configured", async () => {
      const res = await analyze(cleanInput);
      const { result } = await res.json();
      expect(res.status).toBe(200);
      expect(result.source).toBe("rules");
      expect(result.model).toBeUndefined();
      expect(mockedClaude.mock.calls.length).toBe(0);
    });

    it("uses Claude when an API key is configured", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-test";
      mockedClaude.mockResolvedValue(
        modelOutput({ riskScore: 42, recommendedAction: "Verify Merchant", summary: "Claude's summary." }),
      );

      const { result } = await (await analyze(cleanInput)).json();
      expect(result.source).toBe("claude");
      expect(result.model).toBe("test-model");
      expect(result.riskScore).toBe(42);
      expect(result.riskLevel).toBe("moderate");
      expect(result.summary).toBe("Claude's summary.");
    });

    it("sends the validated input and a rule-based baseline to Claude", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-test";
      mockedClaude.mockResolvedValue(modelOutput());

      await analyze({ ...cleanInput, merchantName: "  Padded Name  " });
      const [input, baseline] = mockedClaude.mock.calls[0];
      expect(input.merchantName).toBe("Padded Name");
      expect(typeof baseline.riskScore).toBe("number");
    });

    it("falls back to rules, without failing, when Claude errors", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-test";
      mockedClaude.mockRejectedValue(new Error("upstream exploded: secret-detail"));

      const res = await analyze(cleanInput);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.result.source).toBe("rules");
      expect(JSON.stringify(data)).not.toContain("secret-detail");
    });
  });

  describe("safety guardrails", () => {
    it("blocks a request to pay outside normal checkout even if Claude said Proceed", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-test";
      mockedClaude.mockResolvedValue(modelOutput({ riskScore: 5, recommendedAction: "Proceed" }));

      const { result } = await (await analyze({ ...cleanInput, offPlatformPayment: true })).json();
      expect(result.source).toBe("claude");
      expect(result.recommendedAction).toBe("Block Transaction");
      expect(result.riskScore).toBeGreaterThanOrEqual(85);
      expect(result.riskLevel).toBe("high");
    });

    it("applies guardrails to the rule-based fallback too", async () => {
      const { result } = await (await analyze({ ...cleanInput, offPlatformPayment: true })).json();
      expect(result.recommendedAction).toBe("Block Transaction");
    });
  });

  describe("checkout token", () => {
    it("binds the amount, currency, merchant and verdict to a signed token", async () => {
      const input = { ...cleanInput, amount: 499.5, currency: "EUR", offPlatformPayment: true };
      const data = await (await analyze(input)).json();
      const claims = verifyToken(data.token);
      expect(claims).toMatchObject({
        amount: 499.5,
        currency: "EUR",
        merchantName: cleanInput.merchantName,
        action: "Block Transaction",
        score: data.result.riskScore,
      });
    });

    it("returns 503 without leaking details when TOKEN_SECRET is missing", async () => {
      delete process.env.TOKEN_SECRET;
      const res = await analyze(cleanInput);
      const data = await res.json();
      expect(res.status).toBe(503);
      expect(JSON.stringify(data)).not.toContain("TOKEN_SECRET");
    });
  });

  describe("rate limiting", () => {
    it("allows 10 requests per minute per IP, then returns 429", async () => {
      const ip = nextIp();
      for (let i = 0; i < 10; i++) expect((await analyze(cleanInput, ip)).status).toBe(200);
      expect((await analyze(cleanInput, ip)).status).toBe(429);
      expect((await analyze(cleanInput, nextIp())).status).toBe(200);
    });
  });
});
