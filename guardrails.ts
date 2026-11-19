import type { AnalysisInput, Assessment, ModelAssessment } from "./schema";
import { actionForScore, levelForScore, strictestAction } from "./risk";

/**
 * Hard safety rules applied to EVERY assessment (including Claude's).
 * They can only make the result more protective, never less.
 */
export function applyGuardrails(model: ModelAssessment, input: AnalysisInput): Assessment {
  let floor = 0;
  const reasons: string[] = [];
  const newish = input.merchantAge === "under_6_months" || input.merchantAge === "unknown" || input.firstTimeMerchant;

  if (input.offPlatformPayment) {
    floor = Math.max(floor, 85);
    reasons.push("Being asked to pay outside normal checkout is one of the strongest scam signals.");
  }
  if (input.category === "gift_cards" && (input.urgencyPressure || input.offPlatformPayment)) {
    floor = Math.max(floor, 85);
    reasons.push("Gift cards plus pressure is a classic scam pattern.");
  }
  if (input.priceFarBelowMarket && input.urgencyPressure) {
    floor = Math.max(floor, 75);
    reasons.push("A far-too-low price combined with pressure to pay fast is a common scam pattern.");
  }
  if (input.priceFarBelowMarket && newish) {
    floor = Math.max(floor, 65);
    reasons.push("A far-too-low price from a merchant you can't vouch for is a common scam pattern.");
  }

  const riskScore = Math.max(model.riskScore, floor);
  const recommendedAction = strictestAction(model.recommendedAction, actionForScore(riskScore));
  const raised = riskScore > model.riskScore;

  return {
    ...model,
    riskScore,
    riskLevel: levelForScore(riskScore),
    recommendedAction,
    riskFactors: raised
      ? [...reasons, ...model.riskFactors.filter((f) => !reasons.includes(f))].slice(0, 8)
      : model.riskFactors,
  };
}
