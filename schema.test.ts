import { describe, expect, it } from "vitest";
import { extractJson } from "./claude";
import { cleanInput, modelOutput } from "./fixtures";
import { analysisInputSchema, modelAssessmentSchema } from "./schema";

describe("analysisInputSchema", () => {
  it("accepts a valid submission", () => {
    expect(analysisInputSchema.safeParse(cleanInput).success).toBe(true);
  });

  it("accepts an empty website address but rejects a malformed one", () => {
    expect(analysisInputSchema.safeParse({ ...cleanInput, merchantUrl: "" }).success).toBe(true);
    expect(analysisInputSchema.safeParse({ ...cleanInput, merchantUrl: "not a url" }).success).toBe(false);
    expect(analysisInputSchema.safeParse({ ...cleanInput, merchantUrl: "javascript:alert(1)" }).success).toBe(false);
  });

  it("rejects zero, negative, missing and oversized amounts", () => {
    expect(analysisInputSchema.safeParse({ ...cleanInput, amount: 0 }).success).toBe(false);
    expect(analysisInputSchema.safeParse({ ...cleanInput, amount: -20 }).success).toBe(false);
    expect(analysisInputSchema.safeParse({ ...cleanInput, amount: undefined }).success).toBe(false);
    expect(analysisInputSchema.safeParse({ ...cleanInput, amount: 50001 }).success).toBe(false);
  });

  it("rejects unsupported currencies and categories", () => {
    expect(analysisInputSchema.safeParse({ ...cleanInput, currency: "BTC" }).success).toBe(false);
    expect(analysisInputSchema.safeParse({ ...cleanInput, category: "weapons" }).success).toBe(false);
  });

  it("limits the length of free-text fields", () => {
    expect(analysisInputSchema.safeParse({ ...cleanInput, notes: "x".repeat(501) }).success).toBe(false);
    expect(analysisInputSchema.safeParse({ ...cleanInput, merchantName: "A" }).success).toBe(false);
  });
});

describe("modelAssessmentSchema", () => {
  it("accepts a well-formed model response and rounds scores", () => {
    const parsed = modelAssessmentSchema.parse({ ...modelOutput(), riskScore: 61.6, confidenceScore: 40.2 });
    expect(parsed.riskScore).toBe(62);
    expect(parsed.confidenceScore).toBe(40);
  });

  it("rejects out-of-range scores and unknown actions", () => {
    expect(modelAssessmentSchema.safeParse({ ...modelOutput(), riskScore: 140 }).success).toBe(false);
    expect(modelAssessmentSchema.safeParse({ ...modelOutput(), recommendedAction: "Maybe" }).success).toBe(false);
  });

  it("rejects responses with missing fields", () => {
    const { summary: _summary, ...incomplete } = modelOutput();
    expect(modelAssessmentSchema.safeParse(incomplete).success).toBe(false);
  });
});

describe("extractJson", () => {
  it("parses plain JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses JSON wrapped in markdown fences or commentary", () => {
    expect(extractJson('Here you go:\n```json\n{"a":{"b":2}}\n```\nHope that helps!')).toEqual({ a: { b: 2 } });
  });

  it("throws when there is no JSON object", () => {
    expect(() => extractJson("I cannot help with that.")).toThrow();
  });
});
