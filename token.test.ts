import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigError } from "./env";
import { issueToken, verifyToken } from "./token";

const claims = {
  amount: 499,
  currency: "USD",
  merchantName: "Bright Gadgets",
  action: "Delay Purchase" as const,
  score: 62,
};

describe("checkout token", () => {
  const originalSecret = process.env.TOKEN_SECRET;

  beforeEach(() => {
    process.env.TOKEN_SECRET = "test-secret-one";
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalSecret === undefined) delete process.env.TOKEN_SECRET;
    else process.env.TOKEN_SECRET = originalSecret;
  });

  it("round-trips the signed claims", () => {
    const verified = verifyToken(issueToken(claims));
    expect(verified).toMatchObject(claims);
    expect(typeof verified?.exp).toBe("number");
  });

  it("rejects a token whose amount was edited", () => {
    const [body, signature] = issueToken(claims).split(".");
    const edited = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    edited.amount = 1;
    const forgedBody = Buffer.from(JSON.stringify(edited)).toString("base64url");
    expect(verifyToken(`${forgedBody}.${signature}`)).toBeNull();
  });

  it("rejects a token whose signature was edited", () => {
    const [body] = issueToken(claims).split(".");
    expect(verifyToken(`${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = issueToken(claims);
    process.env.TOKEN_SECRET = "a-different-secret";
    expect(verifyToken(token)).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = issueToken(claims);

    vi.setSystemTime(new Date("2026-01-01T00:29:00Z"));
    expect(verifyToken(token)).not.toBeNull();

    vi.setSystemTime(new Date("2026-01-01T00:31:00Z"));
    expect(verifyToken(token)).toBeNull();
  });

  it.each(["", "abc", "a.b.c", ".", "onlybody."])("rejects malformed token %j", (bad) => {
    expect(verifyToken(bad)).toBeNull();
  });

  it("throws a ConfigError when TOKEN_SECRET is not set", () => {
    delete process.env.TOKEN_SECRET;
    expect(() => issueToken(claims)).toThrow(ConfigError);
  });
});
