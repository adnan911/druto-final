import { getD1Binding } from "./d1-db";
import { claimD1Webhook, finishD1Webhook } from "./d1-webhook-lease";
import { decryptWebhookSecret } from "./webhooks";
import { postWorkerWebhook } from "./webhook-transport";

export async function drainD1WebhookOutbox(limit = 2) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 3) throw new Error("Invalid D1 drain limit");
  const binding = getD1Binding();
  const due = await binding.prepare(`
    SELECT id FROM webhookDeliveries WHERE status != 'succeeded' AND attempts < 10
      AND (nextAttemptAt IS NULL OR nextAttemptAt <= ?)
    ORDER BY createdAt, id LIMIT ?
  `).bind(Date.now(), limit).all<{ id: string }>();
  let delivered = 0;
  for (const row of due.results ?? []) {
    const result = await sendD1Webhook(row.id);
    if (result.ok && !result.skipped) delivered++;
  }
  return { selected: due.results?.length ?? 0, delivered };
}

export async function sendD1Webhook(deliveryId: string, manual = false) {
  const binding = getD1Binding();
  const claim = await claimD1Webhook(binding, deliveryId, new Date(), manual);
  if (!claim) return { ok: false, status: 409, skipped: true,
    error: "Delivery is not due, already delivered, or currently leased" };
  let outcome: { ok: boolean; status: number; error?: string };
  try {
    const endpoint = await binding.prepare("SELECT url, secretCiphertext, active FROM webhookEndpoints WHERE id = ?")
      .bind(claim.endpointId).first<{ url: string; secretCiphertext: string; active: number }>();
    outcome = !endpoint || endpoint.active !== 1
      ? { ok: false, status: 410, error: "Webhook endpoint is inactive" }
      : await postWorkerWebhook(endpoint.url, decryptWebhookSecret(endpoint.secretCiphertext),
        claim.eventId, claim.payload);
  } catch { outcome = { ok: false, status: 0, error: "Webhook configuration or request failed" }; }
  const finished = await finishD1Webhook(binding, claim, outcome);
  if (!finished) return { ok: false, status: 409, skipped: true, error: "Delivery lease was superseded" };
  return { ...outcome, skipped: false };
}
