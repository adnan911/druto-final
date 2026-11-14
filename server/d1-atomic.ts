/**
 * D1 Testnet persistence prototype. This is deliberately not wired into the
 * running Worker until hosted D1 and data-migration gates pass.
 *
 * D1 batches are atomic; the SQLite triggers in the initial migration reject
 * stale intents and update settlement state as part of transaction insertion.
 * Arc receipt verification and signed-event payload creation happen before
 * this function is called.
 */
export interface D1StatementLike<TStatement> {
  bind(...values: Array<string | number | null>): TStatement;
}

export interface D1BatchLike<TStatement extends D1StatementLike<TStatement>> {
  prepare(sql: string): TStatement;
  batch(statements: TStatement[]): Promise<unknown[]>;
}

export interface D1StatementWithFirst<TStatement> extends D1StatementLike<TStatement> {
  first<T>(): Promise<T | null>;
}

export type VerifiedDirectPayment = {
  paymentIntentId: string;
  transactionHash: string;
  fromAddress: string;
  toAddress: string;
  tokenAddress: string;
  amountAtomic: string;
  chainId: 5042002;
  finalizedAt: Date;
  eventId: string;
  eventPayload: string;
};

export async function commitDirectPaymentAndOutbox<TStatement extends D1StatementLike<TStatement>>(
  db: D1BatchLike<TStatement>,
  payment: VerifiedDirectPayment,
): Promise<void> {
  let event: {
    id?: string;
    type?: string;
    data?: { paymentIntentId?: string; transactionHash?: string; amountAtomic?: string;
      buyerAddress?: string; merchantAddress?: string };
  };
  try { event = JSON.parse(payment.eventPayload) as typeof event; }
  catch { throw new Error("Invalid payment event payload"); }
  if (!/^pi_[A-Za-z0-9_-]{1,29}$/.test(payment.paymentIntentId) ||
      !/^0x[a-fA-F0-9]{64}$/.test(payment.transactionHash) ||
      !/^0x[a-fA-F0-9]{40}$/.test(payment.fromAddress) ||
      !/^0x[a-fA-F0-9]{40}$/.test(payment.toAddress) ||
      !/^evt_[a-f0-9]{32}$/.test(payment.eventId) ||
      !/^[0-9]+$/.test(payment.amountAtomic) ||
      BigInt(payment.amountAtomic) <= BigInt(0) ||
      payment.chainId !== 5042002 ||
      payment.tokenAddress.toLowerCase() !== "0x3600000000000000000000000000000000000000" ||
      !Number.isFinite(payment.finalizedAt.getTime()) ||
      payment.eventPayload.length > 100_000 ||
      event?.id !== payment.eventId || event?.type !== "payment.verified" ||
      event?.data?.paymentIntentId !== payment.paymentIntentId ||
      String(event?.data?.transactionHash).toLowerCase() !== payment.transactionHash.toLowerCase() ||
      event?.data?.amountAtomic !== payment.amountAtomic ||
      String(event?.data?.buyerAddress).toLowerCase() !== payment.fromAddress.toLowerCase() ||
      String(event?.data?.merchantAddress).toLowerCase() !== payment.toAddress.toLowerCase()) {
    throw new Error("Invalid verified direct-payment record");
  }

  const record = db.prepare(`
    INSERT INTO paymentTransactions
      (paymentIntentId, transactionHash, fromAddress, toAddress,
       treasuryAddress, tokenAddress, amountAtomic, platformFeeAmount,
       merchantPayoutAmount, chainId, finalizedAt)
    VALUES (?, ?, ?, ?, NULL, ?, ?, '0', ?, ?, ?)
  `).bind(
    payment.paymentIntentId, payment.transactionHash.toLowerCase(),
    payment.fromAddress, payment.toAddress, payment.tokenAddress,
    payment.amountAtomic, payment.amountAtomic, payment.chainId,
    payment.finalizedAt.getTime(),
  );

  // This SELECT runs after the insert trigger marks the intent succeeded.
  // It sees the endpoint set at commit time, avoiding a pre-read race.
  const outbox = db.prepare(`
    INSERT INTO webhookDeliveries
      (id, endpointId, eventId, eventType, paymentIntentId, payload,
       signature, status, attempts, nextAttemptAt)
    SELECT 'wd_' || lower(hex(randomblob(12))), e.id, ?,
           'payment.verified', p.id, ?, '', 'pending', 0, NULL
    FROM paymentIntents p
    JOIN webhookEndpoints e ON e.merchantAccountId = p.merchantAccountId
    WHERE p.id = ? AND p.status = 'succeeded' AND e.active = 1
  `).bind(payment.eventId, payment.eventPayload, payment.paymentIntentId);

  // Cloudflare D1 rolls back the entire batch when either statement fails.
  // A duplicate hash/intent is handled by the caller after reading durable
  // state; it must never be treated as success without that comparison.
  await db.batch([record, outbox]);
}

/** Call only after the wallet signature over the stored challenge is verified. */
export async function consumeVerifiedSellerChallenge<
  TStatement extends D1StatementWithFirst<TStatement>,
>(db: { prepare(sql: string): TStatement }, input: {
  challengeId: string;
  merchantAccountId: string;
  marketplaceId: string;
  sellerId: string;
  walletAddress: string;
  ownerUserId: number;
  usedAt: Date;
}): Promise<boolean> {
  if (!Number.isSafeInteger(input.ownerUserId) || input.ownerUserId < 1 ||
      !/^0x[a-fA-F0-9]{40}$/.test(input.walletAddress) ||
      !Number.isFinite(input.usedAt.getTime())) {
    throw new Error("Invalid verified seller challenge");
  }
  const updated = await db.prepare(`
    UPDATE ownershipChallenges SET usedAt = ?
    WHERE id = ? AND merchantAccountId = ? AND marketplaceId = ?
      AND sellerId = ? AND lower(walletAddress) = lower(?)
      AND usedAt IS NULL AND expiresAt > ?
      AND EXISTS (
        SELECT 1 FROM merchantAccounts
        WHERE id = ? AND ownerUserId = ?
          AND marketplaceId = ? AND externalSellerId = ?
          AND lower(receivingAddress) = lower(?)
          AND status IN ('pending', 'active')
      )
    RETURNING id
  `).bind(
    input.usedAt.getTime(), input.challengeId, input.merchantAccountId,
    input.marketplaceId, input.sellerId, input.walletAddress,
    input.usedAt.getTime(), input.merchantAccountId, input.ownerUserId,
    input.marketplaceId, input.sellerId, input.walletAddress,
  ).first<{ id: string }>();
  return updated?.id === input.challengeId;
}

/** Call only after verifying a wallet signature over this exact stored message. */
export async function consumeVerifiedWalletLoginChallenge<
  TStatement extends D1StatementWithFirst<TStatement>,
>(db: { prepare(sql: string): TStatement }, input: {
  challengeId: string;
  walletAddress: string;
  message: string;
  usedAt: Date;
}): Promise<boolean> {
  if (!/^wch_[A-Za-z0-9_-]{1,28}$/.test(input.challengeId) ||
      !/^0x[a-fA-F0-9]{40}$/.test(input.walletAddress) ||
      !input.message || input.message.length > 2048 ||
      !Number.isFinite(input.usedAt.getTime())) {
    throw new Error("Invalid verified wallet login challenge");
  }
  const usedAtMs = input.usedAt.getTime();
  const updated = await db.prepare(`
    UPDATE walletLoginChallenges SET usedAt = ?
    WHERE id = ? AND lower(walletAddress) = lower(?) AND message = ?
      AND usedAt IS NULL AND expiresAt > ?
    RETURNING id
  `).bind(usedAtMs, input.challengeId, input.walletAddress,
    input.message, usedAtMs).first<{ id: string }>();
  return updated?.id === input.challengeId;
}
