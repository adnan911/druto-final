import { and, eq, lte } from "drizzle-orm";
import { createHash } from "node:crypto";
import { webhookDeliveries, webhookEndpoints, type PaymentIntent, type PaymentTransaction } from "../drizzle/schema";
import { buildPaymentVerifiedEvent, buildWebhookHeaders, decryptWebhookSecret, hashEventPayload, nextRetryAt, serializeWebhookEvent, signWebhookPayload, type WebhookDeliveryResult } from "./webhooks";

function deterministicEventId(paymentIntentId: string) { return `evt_${createHash("sha256").update(`${paymentIntentId}:payment.verified`).digest("hex").slice(0, 32)}`; }

export async function postWebhook(url: string, secret: string, eventId: string, payload: string): Promise<WebhookDeliveryResult> {
  const signed = signWebhookPayload(secret, payload);
  try {
    const response = await fetch(url, { method: "POST", headers: buildWebhookHeaders(eventId, signed), body: payload, signal: AbortSignal.timeout(10_000) });
    return response.ok ? { ok: true, status: response.status } : { ok: false, status: response.status, error: `Receiver returned HTTP ${response.status}` };
  } catch (error) { return { ok: false, status: 0, error: error instanceof Error ? error.message : "Webhook request failed" }; }
}

export async function dispatchPaymentVerified(db: any, intent: PaymentIntent, transaction: PaymentTransaction) {
  if (!intent.merchantAccountId) return [] as WebhookDeliveryResult[];
  const endpoints = await db.select().from(webhookEndpoints).where(and(eq(webhookEndpoints.merchantAccountId, intent.merchantAccountId), eq(webhookEndpoints.active, 1)));
  const eventId = deterministicEventId(intent.id); const payload = serializeWebhookEvent(buildPaymentVerifiedEvent(intent, transaction, eventId)); const results: WebhookDeliveryResult[] = [];
  for (const endpoint of endpoints) {
    const secret = decryptWebhookSecret(endpoint.secretCiphertext); const signed = signWebhookPayload(secret, payload); const deliveryId = `wd_${createHash("sha256").update(`${endpoint.id}:${eventId}`).digest("hex").slice(0, 24)}`;
    try { await db.insert(webhookDeliveries).values({ id: deliveryId, endpointId: endpoint.id, eventId, eventType: "payment.verified", paymentIntentId: intent.id, payload, signature: signed.header, status: "pending", attempts: 0 }); }
    catch {
      const [existing] = await db.select().from(webhookDeliveries).where(and(eq(webhookDeliveries.endpointId, endpoint.id), eq(webhookDeliveries.eventId, eventId))).limit(1);
      if (existing?.status === "succeeded") { results.push({ ok: true, status: 200 }); continue; }
    }
    const result = await postWebhook(endpoint.url, secret, eventId, payload); results.push(result);
    await db.update(webhookDeliveries).set({ status: result.ok ? "succeeded" : "failed", attempts: 1, lastError: result.error ?? null, deliveredAt: result.ok ? new Date() : null, nextAttemptAt: result.ok ? null : nextRetryAt(1) }).where(eq(webhookDeliveries.id, deliveryId));
  }
  return results;
}

export async function retryWebhookDelivery(db: any, deliveryId: string, now = new Date()) {
  const [delivery] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId)).limit(1);
  if (!delivery || delivery.status === "succeeded") return { ok: true, status: 200, skipped: true } as const;
  if (delivery.nextAttemptAt && delivery.nextAttemptAt.getTime() > now.getTime()) return { ok: false, status: 425, error: "Retry is not due yet" } as const;
  const [endpoint] = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, delivery.endpointId)).limit(1);
  if (!endpoint || endpoint.active !== 1) return { ok: false, status: 410, error: "Webhook endpoint is inactive" } as const;
  const result = await postWebhook(endpoint.url, decryptWebhookSecret(endpoint.secretCiphertext), delivery.eventId, delivery.payload);
  const attempts = Number(delivery.attempts ?? 0) + 1;
  await db.update(webhookDeliveries).set({ status: result.ok ? "succeeded" : "failed", attempts, lastError: result.error ?? null, deliveredAt: result.ok ? now : null, nextAttemptAt: result.ok ? null : nextRetryAt(attempts, now) }).where(eq(webhookDeliveries.id, delivery.id));
  return { ...result, skipped: false };
}

export function webhookPayloadHash(payload: string) { return hashEventPayload(payload); }
