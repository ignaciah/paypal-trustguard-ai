import type { AnalysisInput, Assessment, DimensionScores } from "./schema";
import { actionForScore, clamp, levelForScore } from "./risk";

/**
 * Deterministic rule-based assessment. It is used (a) as a calibration baseline
 * sent to Claude, and (b) as the fallback when Claude is unavailable.
 */
export function heuristicAssessment(input: AnalysisInput): Assessment {
  const riskFactors: string[] = [];
  const trustIndicators: string[] = [];
  const uncertainties: string[] = [
    "This check uses only what you told us. We have not visited the merchant's site or looked up independent reviews.",
  ];

  // ---- Merchant credibility (higher = riskier)
  let merchant = 25;
  if (input.merchantAge === "under_6_months") {
    merchant += 35;
    riskFactors.push("The merchant appears to be very new (under 6 months).");
  } else if (input.merchantAge === "6_to_24_months") {
    merchant += 12;
  } else if (input.merchantAge === "over_2_years") {
    merchant -= 12;
    trustIndicators.push("The merchant has been around for more than 2 years.");
  } else {
    merchant += 12;
    uncertainties.push("You don't know how long the merchant has existed.");
  }
  if (input.firstTimeMerchant) {
    merchant += 12;
    riskFactors.push("You have never bought from this merchant before.");
  }
  if (input.hasContactInfo) {
    merchant -= 12;
    trustIndicators.push("The merchant lists real contact details.");
  } else {
    merchant += 18;
    riskFactors.push("No clear address, phone number or support email was found.");
  }
  if (input.hasReturnPolicy) {
    merchant -= 8;
    trustIndicators.push("There is a clear return policy.");
  } else {
    merchant += 10;
    riskFactors.push("There is no clear return policy.");
  }
  if (!input.merchantUrl) {
    merchant += 5;
    uncertainties.push("No website address was provided, so the merchant's site could not be considered.");
  }

  // ---- Amount at stake
  const usdLike = input.amount; // coarse: currencies treated at par for a rough size bucket
  let amount = 10;
  if (usdLike >= 2000) amount = 85;
  else if (usdLike >= 1000) amount = 70;
  else if (usdLike >= 500) amount = 55;
  else if (usdLike >= 200) amount = 40;
  else if (usdLike >= 50) amount = 25;
  if (usdLike >= 200) riskFactors.push("This is a sizeable payment, so a mistake would cost more.");

  // ---- Purchase category
  const categoryBase: Record<AnalysisInput["category"], number> = {
    electronics: 50,
    gift_cards: 75,
    travel: 45,
    digital_goods: 40,
    subscription: 45,
    services: 40,
    fashion: 35,
    other: 35,
  };
  const category = categoryBase[input.category];
  if (category >= 50) riskFactors.push("This type of purchase is a common target for scams.");

  // ---- Scam indicators
  let scam = 10;
  if (input.priceFarBelowMarket) {
    scam += 40;
    riskFactors.push("The price is far below what other stores charge.");
  }
  if (input.urgencyPressure) {
    scam += 25;
    riskFactors.push("You are being pressured to pay quickly.");
  }
  if (input.offPlatformPayment) {
    scam += 45;
    riskFactors.push(
      "You were asked to pay outside normal checkout (for example Friends and Family, gift cards or a bank transfer). Payments made that way usually are not covered by buyer protection.",
    );
  }

  // ---- Subscription risk
  let subscription = input.category === "subscription" ? 45 : 10;
  if (input.hasSubscriptionOrTrial) {
    subscription += 35;
    riskFactors.push("The checkout mentions a trial or recurring charge that could renew without notice.");
  }

  // ---- Chargeback / dispute probability
  let dispute = 15 + (merchant - 25) * 0.4 + (category - 35) * 0.3 + scam * 0.3;
  if (input.hasReturnPolicy) dispute -= 5;

  // ---- Overall fraud signals
  const fraud = scam * 0.6 + merchant * 0.4;

  const dimensions: DimensionScores = {
    merchantCredibility: clamp(merchant),
    transactionAmount: clamp(amount),
    purchaseCategory: clamp(category),
    scamIndicators: clamp(scam),
    subscriptionRisk: clamp(subscription),
    chargebackProbability: clamp(dispute),
    fraudSignals: clamp(fraud),
  };

  // Weighted blend. Scam signals and merchant credibility matter most.
  const riskScore = clamp(
    dimensions.merchantCredibility * 0.26 +
      dimensions.scamIndicators * 0.26 +
      dimensions.fraudSignals * 0.1 +
      dimensions.purchaseCategory * 0.1 +
      dimensions.transactionAmount * 0.1 +
      dimensions.chargebackProbability * 0.1 +
      dimensions.subscriptionRisk * 0.08,
  );

  let confidence = 35;
  if (input.merchantUrl) confidence += 10;
  if (input.merchantAge !== "unknown") confidence += 10;
  if (input.notes) confidence += 5;
  confidence = Math.min(confidence, 65);

  const riskLevel = levelForScore(riskScore);
  const recommendedAction = actionForScore(riskScore);

  if (trustIndicators.length === 0) {
    trustIndicators.push("Nothing confirmed as negative yet. A new merchant is not automatically a bad one.");
  }

  const summary =
    riskLevel === "low"
      ? "This looks like a low-risk payment based on what you shared. A quick final look at the order details is still a good habit."
      : riskLevel === "moderate"
        ? "Nothing here proves a problem, but a few things are worth checking before you pay."
        : "Several warning signs add up here. Please pause before paying and verify who you are dealing with.";

  return {
    riskScore,
    confidenceScore: confidence,
    riskLevel,
    recommendedAction,
    dimensions,
    riskFactors: riskFactors.slice(0, 8),
    trustIndicators: trustIndicators.slice(0, 8),
    uncertainties: uncertainties.slice(0, 8),
    summary,
    saferAlternatives: [
      "Buy the same item from the manufacturer or a well-known retailer, even if it costs a little more.",
      "If this merchant is your only option, ask whether a smaller test order is possible.",
    ],
    userGuidance: [
      "Compare the price with at least two major retailers.",
      "Search the merchant's name with the words 'reviews' and 'scam' and read independent sources.",
      "Pay only through the normal PayPal checkout, never Friends and Family, gift cards or bank transfers.",
      "Keep the order confirmation, listing screenshots and all messages.",
    ],
  };
}
