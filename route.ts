import { NextRequest, NextResponse } from "next/server";
import { assessWithClaude, claudeModel } from "@/lib/claude";
import { ConfigError } from "@/lib/env";
import { applyGuardrails } from "@/lib/guardrails";
import { heuristicAssessment } from "@/lib/heuristics";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { analysisInputSchema, type AnalysisResult } from "@/lib/schema";
import { issueToken } from "@/lib/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!rateLimit(`analyze:${clientIp(req.headers)}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = analysisInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Some details need fixing.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const baseline = heuristicAssessment(input);
  let source: AnalysisResult["source"] = "rules";
  let assessment = baseline;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const modelOutput = await assessWithClaude(input, baseline);
      assessment = applyGuardrails(modelOutput, input);
      source = "claude";
    } catch (error) {
      console.error("[analyze] Claude assessment failed, using rule-based fallback:", error);
      assessment = applyGuardrails(baseline, input);
    }
  } else {
    assessment = applyGuardrails(baseline, input);
  }

  const result: AnalysisResult = {
    ...assessment,
    source,
    model: source === "claude" ? claudeModel() : undefined,
    generatedAt: new Date().toISOString(),
  };

  try {
    const token = issueToken({
      amount: input.amount,
      currency: input.currency,
      merchantName: input.merchantName,
      action: result.recommendedAction,
      score: result.riskScore,
    });
    return NextResponse.json({ result, token });
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error("[analyze]", error.message);
      return NextResponse.json({ error: "The server is not configured yet." }, { status: 503 });
    }
    throw error;
  }
}
