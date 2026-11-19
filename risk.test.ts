import { describe, expect, it } from "vitest";
import { actionForScore, clamp, levelForScore, strictestAction } from "./risk";

describe("score bands", () => {
  it.each([
    [0, "low", "Proceed"],
    [24, "low", "Proceed"],
    [25, "moderate", "Verify Merchant"],
    [59, "moderate", "Verify Merchant"],
    [60, "elevated", "Delay Purchase"],
    [79, "elevated", "Delay Purchase"],
    [80, "high", "Block Transaction"],
    [100, "high", "Block Transaction"],
  ])("score %i maps to %s / %s", (score, level, action) => {
    expect(levelForScore(score)).toBe(level);
    expect(actionForScore(score)).toBe(action);
  });
});

describe("strictestAction", () => {
  it("returns the more protective action regardless of argument order", () => {
    expect(strictestAction("Proceed", "Delay Purchase")).toBe("Delay Purchase");
    expect(strictestAction("Block Transaction", "Verify Merchant")).toBe("Block Transaction");
    expect(strictestAction("Verify Merchant", "Verify Merchant")).toBe("Verify Merchant");
  });
});

describe("clamp", () => {
  it("rounds and bounds to 0-100", () => {
    expect(clamp(-5)).toBe(0);
    expect(clamp(104.2)).toBe(100);
    expect(clamp(41.6)).toBe(42);
  });
});
