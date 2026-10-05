import { and, asc, eq, isNull, lt, lte, ne, or } from "drizzle-orm";
import { createHash } from "node:crypto";
import { webhookDeliveries, webhookEndpoints, type PaymentIntent, type PaymentTransaction } from "../drizzle/schema";
import { buildPaymentVerifiedEvent, decryptWebhookSecret, hashEventPayload, nextRetryAt, serializeWebhookEvent, type WebhookDeliveryResult } from "./webhooks";
import { postPinnedWebhook } from "./webhook-transport";

export const MAX_WEBHOOK_ATTEMPTS = 10;
export const WEBHOOK_LEASE_MS = 60_000;
function deterministicEventId(id: string) { return `evt_${createHash("sha256").update(`${id}:payment.verified`).digest("hex").slice(0, 32)}`; }

// Call only inside the settlement transaction. No network or decryption here.
export async function enqueuePaymentVerified(tx: any, intent: PaymentIntent, transaction: PaymentTransaction) {
  if (!intent.merchantAccountId) return [] as string[];
  const endpoints = await tx.select().from(webhookEndpoints).where(and(
    eq(webhookEndpoints.merchantAccountId, intent.merchantAccountId), eq(webhookEndpoints.active, 1),
  ));
  const eventId = deterministicEventId(intent.id);
  const payload = serializeWebhookEvent(buildPaymentVerifiedEvent(intent, transaction, eventId));
  const ids: string[] = [];
  for (const endpoint of endpoints) {
    const id = `wd_${createHash("sha256").update(`${endpoint.id}:${eventId}`).digest("hex").slice(0, 24)}`;
    // Insertion errors must roll back settlement, never be swallowed.
    await tx.insert(webhookDeliveries).values({ id, endpointId: endpoint.id, eventId,
      eventType: "payment.verified", paymentIntentId: intent.id, payload, signature: "",
      status: "pending", attempts: 0, nextAttemptAt: null });
    ids.push(id);
  }
  return ids;
}

export async function postWebhook(url: string, secret: string, eventId: string, payload: string): Promise<WebhookDeliveryResult> {
  return postPinnedWebhook(url, secret, eventId, payload);
}

// attempts is a monotonically increasing fencing token. nextAttemptAt is both
// the retry deadline and (while pending with attempts>0) the claim lease.
export async function retryWebhookDelivery(db: any, deliveryId: string, now = new Date(), manual = false) {
  const claim = await db.transaction(async (tx: any) => {
    const [delivery] = await tx.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId)).limit(1).for("update");
    if (!delivery) return { result: { ok: false, status: 404, error: "Webhook delivery not found", skipped: true } };
    if (delivery.status === "succeeded") return { result: { ok: true, status: 200, skipped: true } };
    if (delivery.nextAttemptAt && delivery.nextAttemptAt.getTime() > now.getTime()) return { result: { ok: false, status: 425, error: "Retry is not due or delivery is leased", skipped: true } };
    if (!manual && delivery.attempts >= MAX_WEBHOOK_ATTEMPTS) return { result: { ok: false, status: 409, error: "Automatic retries exhausted; operator review required", skipped: true } };
    const attempts = Number(delivery.attempts) + 1;
    await tx.update(webhookDeliveries).set({ status: "pending", attempts, nextAttemptAt: new Date(now.getTime() + WEBHOOK_LEASE_MS) }).where(eq(webhookDeliveries.id, deliveryId));
    return { delivery, attempts };
  });
  if (claim.result) return claim.result;
  const { delivery, attempts } = claim;
  let result: WebhookDeliveryResult;
  try {
    const [endpoint] = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, delivery.endpointId)).limit(1);
    result = !endpoint || endpoint.active !== 1
      ? { ok: false, status: 410, error: "Webhook endpoint is inactive" }
      : await postWebhook(endpoint.url, decryptWebhookSecret(endpoint.secretCiphertext), delivery.eventId, delivery.payload);
  } catch { result = { ok: false, status: 0, error: "Webhook endpoint or signing configuration unavailable" }; }
  const finishedAt = new Date(Math.max(Date.now(), now.getTime()));
  const [saved] = await db.update(webhookDeliveries).set({ status: result.ok ? "succeeded" : "failed",
    lastError: result.error ?? null, deliveredAt: result.ok ? finishedAt : null,
    nextAttemptAt: result.ok || attempts >= MAX_WEBHOOK_ATTEMPTS ? null : nextRetryAt(attempts, finishedAt),
  }).where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.attempts, attempts), eq(webhookDeliveries.status, "pending")));
  if (saved.affectedRows !== 1) return { ok: false, status: 409, error: "Delivery lease was superseded", skipped: true };
  return { ...result, skipped: false };
}

export async function drainWebhookOutbox(db: any, limit = 3) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 3) throw new Error("Worker batch limit must be between 1 and 3");
  const rows = await db.select({ id: webhookDeliveries.id }).from(webhookDeliveries).where(and(
    ne(webhookDeliveries.status, "succeeded"), lt(webhookDeliveries.attempts, MAX_WEBHOOK_ATTEMPTS),
    or(isNull(webhookDeliveries.nextAttemptAt), lte(webhookDeliveries.nextAttemptAt, new Date())),
  )).orderBy(asc(webhookDeliveries.createdAt), asc(webhookDeliveries.id)).limit(limit);
  const results = [];
  for (const row of rows) results.push(await retryWebhookDelivery(db, row.id));
  return { selected: rows.length, delivered: results.filter(r => r.ok && !r.skipped).length, results };
}

export function webhookPayloadHash(payload: string) { return hashEventPayload(payload); }
