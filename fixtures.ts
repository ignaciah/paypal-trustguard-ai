import type { NextRequest } from "next/server";
import type { AnalysisInput, ModelAssessment } from "./schema";

/** A clean, established-merchant purchase. Spread and override per test. */
export const cleanInput: AnalysisInput = {
  merchantName: "Acme Outfitters",
  merchantUrl: "",
  amount: 50,
  currency: "USD",
  category: "fashion",
  merchantAge: "over_2_years",
  firstTimeMerchant: false,
  priceFarBelowMarket: false,
  urgencyPressure: false,
  offPlatformPayment: false,
  hasContactInfo: true,
  hasReturnPolicy: true,
  hasSubscriptionOrTrial: false,
  notes: "",
};

export function modelOutput(overrides: Partial<ModelAssessment> = {}): ModelAssessment {
  return {
    riskScore: 10,
    confidenceScore: 60,
    recommendedAction: "Proceed",
    dimensions: {
      merchantCredibility: 10,
      transactionAmount: 10,
      purchaseCategory: 10,
      scamIndicators: 10,
      subscriptionRisk: 10,
      chargebackProbability: 10,
      fraudSignals: 10,
    },
    riskFactors: ["Model-identified factor."],
    trustIndicators: ["Merchant lists contact details."],
    uncertainties: ["Could not verify the merchant."],
    summary: "Looks fine.",
    saferAlternatives: [],
    userGuidance: ["Keep your receipt."],
    ...overrides,
  };
}

/** Builds a POST request for calling a route handler directly. A string body is sent as-is. */
export function postJson(path: string, body: unknown, ip = "203.0.113.1"): NextRequest {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}
