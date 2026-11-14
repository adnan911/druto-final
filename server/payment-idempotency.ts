import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { paymentIntents, type PaymentIntent } from '../drizzle/schema';
import type { getDb } from './db';

const PREFIX = 'druto_v2_';
export type IntentScope = { marketplaceId: string | null; sellerId: string | null; merchantAccountId: string | null };
export function scopedIntentKey(key: string, scope: IntentScope) {
  // Fixed server-side environment/operation. API-key rotation does not change scope.
  return PREFIX + createHash('sha256').update(JSON.stringify([
    'arc-testnet', 5042002, 'USDC', 'payments.createIntent',
    scope.marketplaceId, scope.sellerId, scope.merchantAccountId, key,
  ])).digest('hex');
}
function sameScope(a: IntentScope, b: IntentScope) {
  return (a.marketplaceId ?? null) === b.marketplaceId && (a.sellerId ?? null) === b.sellerId && (a.merchantAccountId ?? null) === b.merchantAccountId;
}
function canonical(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
function context(value: string | null) {
  if (value == null) return null;
  try { return canonical(JSON.parse(value)); } catch { throw new TRPCError({ code: 'CONFLICT', message: 'Stored order context requires reconciliation' }); }
}
export function assertIntentRetry(existing: PaymentIntent, requested: PaymentIntent) {
  if (existing.platformFeeBps !== requested.platformFeeBps || existing.platformFeeAmount !== requested.platformFeeAmount ||
    existing.merchantPayoutAmount !== requested.merchantPayoutAmount || existing.splitContractAddress !== requested.splitContractAddress) {
    throw new TRPCError({ code: 'CONFLICT', message: 'Payment fee terms changed; create a new order with a new idempotency key' });
  }
  if (!sameScope(existing, requested) || existing.externalOrderId !== requested.externalOrderId ||
    existing.itemName !== requested.itemName || existing.amountAtomic !== requested.amountAtomic ||
    (existing.buyerLabel ?? null) !== requested.buyerLabel || (existing.returnUrl ?? '/') !== requested.returnUrl ||
    context(existing.orderContext) !== context(requested.orderContext) || existing.asset !== requested.asset || existing.network !== requested.network ||
    existing.merchantAddress.toLowerCase() !== requested.merchantAddress.toLowerCase()) {
    throw new TRPCError({ code: 'CONFLICT', message: 'Idempotency key was already used with different payment details' });
  }
}
export async function insertIdempotentIntent(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, rawKey: string, requested: PaymentIntent): Promise<PaymentIntent> {
  if (rawKey.startsWith(PREFIX)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Idempotency key uses a reserved prefix' });
  const key = scopedIntentKey(rawKey, requested);
  const lookup = async (lookupKey: string) => {
    const [row] = await db.select().from(paymentIntents).where(eq(paymentIntents.idempotencyKey, lookupKey)).limit(1);
    // Also fail closed with the development memory adapter, whose filtering is incomplete.
    return row?.idempotencyKey === lookupKey ? row : undefined;
  };
  let existing = await lookup(key);
  if (!existing) {
    const legacy = await lookup(rawKey);
    // Read-only compatibility: never reveal/reassign another tenant's legacy row.
    if (legacy && sameScope(legacy, requested)) existing = legacy;
  }
  if (existing) { assertIntentRetry(existing, requested); return existing; }
  const record = { ...requested, idempotencyKey: key };
  try { await db.insert(paymentIntents).values(record); }
  catch (error: any) {
    if (error?.code !== 'ER_DUP_ENTRY' && error?.cause?.code !== 'ER_DUP_ENTRY') throw error;
    // The unique index decides the winner. Read it after the failed autocommit insert.
    const winner = await lookup(key);
    if (!winner) throw new TRPCError({ code: 'CONFLICT', message: 'Payment creation conflicted; retry the same request' });
    assertIntentRetry(winner, requested); return winner;
  }
  // Return the database snapshot, including timestamp precision/defaults, so
  // first creation and subsequent retries expose the same persisted expiry.
  const persisted = await lookup(key);
  if (!persisted) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Payment creation could not be confirmed; retry the same request' });
  assertIntentRetry(persisted, requested);
  return persisted;
}
