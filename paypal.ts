import { randomUUID } from "node:crypto";
import { paypalBaseUrl, requireEnv } from "./env";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const credentials = Buffer.from(
    `${requireEnv("PAYPAL_CLIENT_ID")}:${requireEnv("PAYPAL_CLIENT_SECRET")}`,
  ).toString("base64");

  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PayPal auth failed (${res.status}) debug=${res.headers.get("paypal-debug-id")}`);

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function paypalFetch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${paypalBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": randomUUID(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`PayPal ${path} failed (${res.status}) debug=${res.headers.get("paypal-debug-id")} ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export async function createOrder(params: { amount: number; currency: string; description: string }) {
  return paypalFetch<{ id: string; status: string }>("/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [
      {
        description: params.description.slice(0, 127),
        amount: { currency_code: params.currency, value: params.amount.toFixed(2) },
      },
    ],
  });
}

interface CaptureResponse {
  id: string;
  status: string;
  purchase_units?: { payments?: { captures?: { id: string; status: string; amount: { value: string; currency_code: string } }[] } }[];
}

export async function captureOrder(orderId: string) {
  const data = await paypalFetch<CaptureResponse>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`);
  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    id: data.id,
    status: data.status,
    captureId: capture?.id ?? null,
    amount: capture?.amount.value ?? null,
    currency: capture?.amount.currency_code ?? null,
  };
}
