import type { RecommendedAction, RiskLevel } from "./schema";

export function levelForScore(score: number): RiskLevel {
  if (score < 25) return "low";
  if (score < 60) return "moderate";
  if (score < 80) return "elevated";
  return "high";
}

export function actionForScore(score: number): RecommendedAction {
  if (score < 25) return "Proceed";
  if (score < 60) return "Verify Merchant";
  if (score < 80) return "Delay Purchase";
  return "Block Transaction";
}

const STRICTNESS: RecommendedAction[] = ["Proceed", "Verify Merchant", "Delay Purchase", "Block Transaction"];

/** Returns whichever action is more protective. */
export function strictestAction(a: RecommendedAction, b: RecommendedAction): RecommendedAction {
  return STRICTNESS.indexOf(a) >= STRICTNESS.indexOf(b) ? a : b;
}

export const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(n)));

export const LEVEL_STYLES: Record<
  RiskLevel,
  { label: string; text: string; bg: string; border: string; stroke: string; bar: string }
> = {
  low: {
    label: "Low risk",
    text: "text-safe",
    bg: "bg-safe-tint",
    border: "border-safe",
    stroke: "#0B7A55",
    bar: "bg-safe",
  },
  moderate: {
    label: "Moderate risk",
    text: "text-caution",
    bg: "bg-caution-tint",
    border: "border-caution",
    stroke: "#9A5B00",
    bar: "bg-caution",
  },
  elevated: {
    label: "Elevated risk",
    text: "text-danger",
    bg: "bg-danger-tint",
    border: "border-danger",
    stroke: "#B3261E",
    bar: "bg-danger",
  },
  high: {
    label: "High risk",
    text: "text-danger",
    bg: "bg-danger-tint",
    border: "border-danger",
    stroke: "#B3261E",
    bar: "bg-danger",
  },
};

export const ACTION_COPY: Record<RecommendedAction, string> = {
  Proceed: "Looks fine to go ahead.",
  "Verify Merchant": "Check the merchant before you pay.",
  "Delay Purchase": "Hold off. Do not pay yet.",
  "Block Transaction": "Do not pay this merchant.",
};
