import { describe, expect, it } from "vitest";
import { cleanInput } from "./fixtures";
import { heuristicAssessment } from "./heuristics";
import { actionForScore, levelForScore } from "./risk";
import { modelAssessmentSchema } from "./schema";

describe("heuristicAssessment", () => {
  it("rates an established, well-documented small purchase as low risk", () => {
    const result = heuristicAssessment(cleanInput);
    expect(result.riskScore).toBeLessThan(25);
    expect(result.recommendedAction).toBe("Proceed");
    expect(result.riskLevel).toBe("low");
  });

  it("rates a scam-like profile far higher than a clean one", () => {
    const scammy = heuristicAssessment({
      ...cleanInput,
      merchantAge: "under_6_months",
      firstTimeMerchant: true,
      priceFarBelowMarket: true,
      urgencyPressure: true,
      offPlatformPayment: true,
      hasContactInfo: false,
      hasReturnPolicy: false,
      category: "electronics",
      amount: 499,
    });
    expect(scammy.riskScore).toBeGreaterThanOrEqual(60);
    expect(scammy.riskScore).toBeGreaterThan(heuristicAssessment(cleanInput).riskScore + 40);
  });

  it("keeps level and action consistent with the score", () => {
    const result = heuristicAssessment({ ...cleanInput, firstTimeMerchant: true, merchantAge: "unknown" });
    expect(result.riskLevel).toBe(levelForScore(result.riskScore));
    expect(result.recommendedAction).toBe(actionForScore(result.riskScore));
  });

  it("scores a newer merchant as less credible than an established one", () => {
    const newer = heuristicAssessment({ ...cleanInput, merchantAge: "under_6_months" });
    const established = heuristicAssessment(cleanInput);
    expect(newer.dimensions.merchantCredibility).toBeGreaterThan(established.dimensions.merchantCredibility);
  });

  it("raises the amount-at-stake dimension as the payment grows", () => {
    const small = heuristicAssessment({ ...cleanInput, amount: 10 });
    const large = heuristicAssessment({ ...cleanInput, amount: 3000 });
    expect(large.dimensions.transactionAmount).toBeGreaterThan(small.dimensions.transactionAmount);
  });

  it("flags a hidden recurring charge", () => {
    const base = heuristicAssessment(cleanInput);
    const trial = heuristicAssessment({ ...cleanInput, hasSubscriptionOrTrial: true });
    expect(trial.dimensions.subscriptionRisk).toBeGreaterThan(base.dimensions.subscriptionRisk);
    expect(trial.riskFactors.some((f) => f.toLowerCase().includes("recurring"))).toBe(true);
  });

  it("is honest about limits: confidence is capped and uncertainties are listed", () => {
    const result = heuristicAssessment({
      ...cleanInput,
      merchantUrl: "https://example.com",
      notes: "Found via an ad.",
    });
    expect(result.confidenceScore).toBeLessThanOrEqual(65);
    expect(result.uncertainties.length).toBeGreaterThan(0);
  });

  it("always produces output that satisfies the model schema", () => {
    expect(modelAssessmentSchema.safeParse(heuristicAssessment(cleanInput)).success).toBe(true);
  });
});
