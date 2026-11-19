import { z } from "zod";

export const CATEGORIES = [
  "electronics",
  "fashion",
  "travel",
  "digital_goods",
  "subscription",
  "gift_cards",
  "services",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  electronics: "Electronics",
  fashion: "Clothing and accessories",
  travel: "Travel and tickets",
  digital_goods: "Software and digital goods",
  subscription: "Subscription or membership",
  gift_cards: "Gift cards",
  services: "Services or freelance work",
  other: "Something else",
};

export const MERCHANT_AGES = ["unknown", "under_6_months", "6_to_24_months", "over_2_years"] as const;
export type MerchantAge = (typeof MERCHANT_AGES)[number];

export const MERCHANT_AGE_LABELS: Record<MerchantAge, string> = {
  unknown: "I don't know",
  under_6_months: "Less than 6 months",
  "6_to_24_months": "6 months to 2 years",
  over_2_years: "More than 2 years",
};

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const ACTIONS = ["Proceed", "Verify Merchant", "Delay Purchase", "Block Transaction"] as const;
export type RecommendedAction = (typeof ACTIONS)[number];

export const RISK_LEVELS = ["low", "moderate", "elevated", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** What the user submits from the form. */
export const analysisInputSchema = z.object({
  merchantName: z.string().trim().min(2, "Enter the merchant's name.").max(100),
  merchantUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || isHttpUrl(v), "Enter a full web address, like https://example.com")
    .default(""),
  amount: z
    .number({ invalid_type_error: "Enter the amount you are about to pay." })
    .positive("The amount must be more than zero.")
    .max(50000, "Amounts above 50,000 are not supported."),
  currency: z.enum(CURRENCIES),
  category: z.enum(CATEGORIES),
  merchantAge: z.enum(MERCHANT_AGES),
  firstTimeMerchant: z.boolean(),
  priceFarBelowMarket: z.boolean(),
  urgencyPressure: z.boolean(),
  offPlatformPayment: z.boolean(),
  hasContactInfo: z.boolean(),
  hasReturnPolicy: z.boolean(),
  hasSubscriptionOrTrial: z.boolean(),
  notes: z.string().trim().max(500).optional().default(""),
});
export type AnalysisInput = z.infer<typeof analysisInputSchema>;

const score = z
  .number()
  .min(0)
  .max(100)
  .transform((n) => Math.round(n));

const shortList = z.array(z.string().trim().min(1).max(300)).max(8);

export const dimensionsSchema = z.object({
  merchantCredibility: score,
  transactionAmount: score,
  purchaseCategory: score,
  scamIndicators: score,
  subscriptionRisk: score,
  chargebackProbability: score,
  fraudSignals: score,
});
export type DimensionScores = z.infer<typeof dimensionsSchema>;

/** The JSON shape Claude must return. riskLevel is derived server-side. */
export const modelAssessmentSchema = z.object({
  riskScore: score,
  confidenceScore: score,
  recommendedAction: z.enum(ACTIONS),
  dimensions: dimensionsSchema,
  riskFactors: shortList,
  trustIndicators: shortList,
  uncertainties: shortList,
  summary: z.string().trim().min(1).max(900),
  saferAlternatives: shortList,
  userGuidance: shortList,
});
export type ModelAssessment = z.infer<typeof modelAssessmentSchema>;

export interface Assessment extends ModelAssessment {
  riskLevel: RiskLevel;
}

export interface AnalysisResult extends Assessment {
  source: "claude" | "rules";
  model?: string;
  generatedAt: string;
}

export const DIMENSION_LABELS: Record<keyof DimensionScores, { label: string; hint: string }> = {
  merchantCredibility: { label: "Merchant credibility", hint: "How well we can trust who you're paying" },
  transactionAmount: { label: "Amount at stake", hint: "How much a bad outcome would cost you" },
  purchaseCategory: { label: "Purchase type", hint: "How often this kind of purchase goes wrong" },
  scamIndicators: { label: "Scam warning signs", hint: "Pressure, odd payment requests, too-good prices" },
  subscriptionRisk: { label: "Hidden recurring charges", hint: "Trials and memberships that renew" },
  chargebackProbability: { label: "Chance of a dispute", hint: "How likely you'd need to ask for money back" },
  fraudSignals: { label: "Fraud signals", hint: "Overall pattern of red flags" },
};
