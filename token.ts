import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "./env";
import type { RecommendedAction } from "./schema";

export interface CheckoutClaims {
  amount: number;
  currency: string;
  merchantName: string;
  action: RecommendedAction;
  score: number;
  exp: number; // epoch ms
}

const TTL_MS = 30 * 60 * 1000;

function sign(body: string): string {
  return createHmac("sha256", requireEnv("TOKEN_SECRET")).update(body).digest("base64url");
}

/** Binds the amount and the verdict to a signature so the client cannot edit either. */
export function issueToken(claims: Omit<CheckoutClaims, "exp">): string {
  const body = Buffer.from(JSON.stringify({ ...claims, exp: Date.now() + TTL_MS })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string): CheckoutClaims | null {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;

  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CheckoutClaims;
    if (typeof claims.exp !== "number" || claims.exp < Date.now()) return null;
    if (typeof claims.amount !== "number" || claims.amount <= 0) return null;
    return claims;
  } catch {
    return null;
  }
}
