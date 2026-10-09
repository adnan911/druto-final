import type { D1StatementWithFirst } from "./d1-atomic";

const MAX_ATTEMPTS = 10;
const LEASE_MS = 60_000;

type Database<TStatement extends D1StatementWithFirst<TStatement>> = {
  prepare(sql: string): TStatement;
};

export type ClaimedD1Webhook = {
  id: string;
  endpointId: string;
  eventId: string;
  payload: string;
  attempts: number;
  leaseUntil: number;
};

/** One conditional write is the lease's fencing token. */
export async function claimD1Webhook<TStatement extends D1StatementWithFirst<TStatement>>(
  db: Database<TStatement>, deliveryId: string, now = new Date(), manual = false,
): Promise<ClaimedD1Webhook | null> {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs) || !deliveryId) throw new Error("Invalid webhook claim");
  const leaseUntil = nowMs + LEASE_MS;
  const row = await db.prepare(`
    UPDATE webhookDeliveries
    SET attempts = attempts + 1, status = 'pending',
        nextAttemptAt = ?, updatedAt = ?
    WHERE id = ? AND status != 'succeeded'
      AND (nextAttemptAt IS NULL OR nextAttemptAt <= ?)
      AND (? = 1 OR attempts < ?)
    RETURNING id, endpointId, eventId, payload, attempts
  `).bind(leaseUntil, nowMs, deliveryId, nowMs, manual ? 1 : 0, MAX_ATTEMPTS)
    .first<Omit<ClaimedD1Webhook, "leaseUntil">>();
  return row ? { ...row, leaseUntil } : null;
}

/** A stale worker cannot finish a claim after another worker has reclaimed it. */
export async function finishD1Webhook<TStatement extends D1StatementWithFirst<TStatement>>(
  db: Database<TStatement>, claim: ClaimedD1Webhook,
  result: { ok: boolean; error?: string }, now = new Date(),
): Promise<boolean> {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs) || !Number.isSafeInteger(claim.attempts) ||
      claim.attempts < 1 || !Number.isFinite(claim.leaseUntil)) {
    throw new Error("Invalid webhook completion");
  }
  const nextRetry = result.ok || claim.attempts >= MAX_ATTEMPTS
    ? null : nowMs + Math.min(60 * 60_000, 2 ** Math.min(claim.attempts, 8) * 1000);
  const row = await db.prepare(`
    UPDATE webhookDeliveries
    SET status = ?, lastError = ?, deliveredAt = ?, nextAttemptAt = ?,
        updatedAt = ?
    WHERE id = ? AND status = 'pending' AND attempts = ?
      AND nextAttemptAt = ?
    RETURNING id
  `).bind(
    result.ok ? "succeeded" : "failed", result.error?.slice(0, 2000) ?? null,
    result.ok ? nowMs : null, nextRetry, nowMs,
    claim.id, claim.attempts, claim.leaseUntil,
  ).first<{ id: string }>();
  return row?.id === claim.id;
}
