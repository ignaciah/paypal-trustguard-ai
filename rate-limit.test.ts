import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp, rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  afterEach(() => vi.useRealTimers());

  it("allows requests up to the limit, then blocks", () => {
    const key = "test:block";
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(false);
  });

  it("tracks each key separately", () => {
    expect(rateLimit("test:a", 1, 60_000)).toBe(true);
    expect(rateLimit("test:a", 1, 60_000)).toBe(false);
    expect(rateLimit("test:b", 1, 60_000)).toBe(true);
  });

  it("allows requests again once the window has passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(rateLimit("test:window", 1, 1_000)).toBe(true);
    expect(rateLimit("test:window", 1, 1_000)).toBe(false);
    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));
    expect(rateLimit("test:window", 1, 1_000)).toBe(true);
  });
});

describe("clientIp", () => {
  it("uses the first x-forwarded-for address", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
  });
  it("falls back to x-real-ip, then 'unknown'", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
