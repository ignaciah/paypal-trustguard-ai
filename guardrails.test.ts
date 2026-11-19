import { describe, expect, it } from "vitest";
import { cleanInput, modelOutput } from "./fixtures";
import { applyGuardrails } from "./guardrails";

describe("applyGuardrails", () => {
  it("blocks any request to pay outside normal checkout, even if the model said Proceed", () => {
    const result = applyGuardrails(modelOutput(), { ...cleanInput, offPlatformPayment: true });
    expect(result.riskScore).toBeGreaterThanOrEqual(85);
    expect(result.recommendedAction).toBe("Block Transaction");
    expect(result.riskLevel).toBe("high");
    expect(result.riskFactors[0]).toMatch(/outside normal checkout/i);
  });

  it("blocks gift cards combined with pressure", () => {
    const result = applyGuardrails(modelOutput(), { ...cleanInput, category: "gift_cards", urgencyPressure: true });
    expect(result.recommendedAction).toBe("Block Transaction");
  });

  it("delays a far-too-low price plus pressure to pay fast", () => {
    const result = applyGuardrails(modelOutput(), { ...cleanInput, priceFarBelowMarket: true, urgencyPressure: true });
    expect(result.riskScore).toBeGreaterThanOrEqual(75);
    expect(result.recommendedAction).toBe("Delay Purchase");
  });

  it("delays a far-too-low price from a merchant the user has never used", () => {
    const result = applyGuardrails(modelOutput(), { ...cleanInput, priceFarBelowMarket: true, firstTimeMerchant: true });
    expect(result.riskScore).toBeGreaterThanOrEqual(65);
    expect(result.recommendedAction).toBe("Delay Purchase");
  });

  it("does not trigger the low-price rule for an established merchant the user knows", () => {
    const result = applyGuardrails(modelOutput({ riskScore: 20 }), { ...cleanInput, priceFarBelowMarket: true });
    expect(result.riskScore).toBe(20);
  });

  it("never lowers a model's higher score or stricter action", () => {
    const result = applyGuardrails(
      modelOutput({ riskScore: 90, recommendedAction: "Block Transaction" }),
      cleanInput,
    );
    expect(result.riskScore).toBe(90);
    expect(result.recommendedAction).toBe("Block Transaction");
  });

  it("keeps a stricter model action even when the score band is lower", () => {
    const result = applyGuardrails(modelOutput({ riskScore: 10, recommendedAction: "Block Transaction" }), cleanInput);
    expect(result.recommendedAction).toBe("Block Transaction");
  });

  it("corrects a model action that is too lenient for its own score", () => {
    const result = applyGuardrails(modelOutput({ riskScore: 40, recommendedAction: "Proceed" }), cleanInput);
    expect(result.recommendedAction).toBe("Verify Merchant");
  });

  it("leaves the model's reasons untouched when no rule fires", () => {
    const result = applyGuardrails(modelOutput(), cleanInput);
    expect(result.riskFactors).toEqual(["Model-identified factor."]);
    expect(result.riskScore).toBe(10);
  });

  it("puts the rule's reason first and keeps the model's factors when a rule fires", () => {
    const result = applyGuardrails(modelOutput(), { ...cleanInput, offPlatformPayment: true });
    expect(result.riskFactors).toContain("Model-identified factor.");
    expect(result.riskFactors.length).toBeLessThanOrEqual(8);
  });
});
