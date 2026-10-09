import { commitDirectPaymentAndOutbox, consumeVerifiedSellerChallenge, consumeVerifiedWalletLoginChallenge } from "../../server/d1-atomic";
import { claimD1Webhook, finishD1Webhook } from "../../server/d1-webhook-lease";

// Local Wrangler proof only. This Worker has no public route or remote DB.
type Prepared = {
  bind(...values: Array<string | number | null>): Prepared;
  run(): Promise<unknown>;
  first<T>(): Promise<T | null>;
};
type Database = {
  prepare(query: string): Prepared;
  batch(statements: Prepared[]): Promise<unknown[]>;
};

export default {
  async fetch(request: Request, env: { DB: Database }): Promise<Response> {
    if (new URL(request.url).pathname !== "/probe") return new Response("Not found", { status: 404 });
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const intentId = `pi_${suffix}`;
    const accountId = `ma_${suffix}`;
    const endpointId = `wh_${suffix}`;
    const hash = `0x${suffix.padEnd(64, "0")}`;
    const eventId = `evt_${suffix.padEnd(32, "0")}`;
    const seller = "0x1111111111111111111111111111111111111111";
    const buyer = "0x2222222222222222222222222222222222222222";

    await env.DB.prepare("INSERT INTO merchantAccounts (id,marketplaceId,externalSellerId,ownerUserId,displayName,receivingAddress) VALUES (?, 'probe', ?, 1, 'Probe seller', ?)")
      .bind(accountId, suffix, seller).run();
    await env.DB.prepare("INSERT INTO paymentIntents (id,externalOrderId,marketplaceId,sellerId,merchantAccountId,itemName,amountAtomic,merchantAddress,expiresAt) VALUES (?, ?, 'probe', ?, ?, 'Probe item', '1000000', ?, ?)")
      .bind(intentId, suffix, suffix, accountId, seller, Date.now() + 300_000).run();
    await env.DB.prepare("INSERT INTO webhookEndpoints (id,marketplaceId,merchantAccountId,ownerUserId,url,urlHash,secretCiphertext) VALUES (?, 'probe', ?, 1, 'https://example.test/hook', ?, 'ciphertext')")
      .bind(endpointId, accountId, suffix,).run();

    const payment = {
      paymentIntentId: intentId,
      transactionHash: hash,
      fromAddress: buyer,
      toAddress: seller,
      tokenAddress: "0x3600000000000000000000000000000000000000",
      amountAtomic: "1000000",
      chainId: 5042002 as const,
      finalizedAt: new Date(),
      eventId,
      eventPayload: JSON.stringify({ id: eventId, type: "payment.verified", data: {
        paymentIntentId: intentId, transactionHash: hash, amountAtomic: "1000000",
        buyerAddress: buyer, merchantAddress: seller,
      } }),
    };
    await commitDirectPaymentAndOutbox(env.DB, payment);
    const intent = await env.DB.prepare("SELECT status, transactionHash FROM paymentIntents WHERE id = ?")
      .bind(intentId).first<{ status: string; transactionHash: string }>();
    const recorded = await env.DB.prepare("SELECT COUNT(*) AS count FROM paymentTransactions WHERE paymentIntentId = ?")
      .bind(intentId).first<{ count: number }>();
    const queued = await env.DB.prepare("SELECT COUNT(*) AS count FROM webhookDeliveries WHERE paymentIntentId = ?")
      .bind(intentId).first<{ count: number }>();
    let replayRejected = false;
    try { await commitDirectPaymentAndOutbox(env.DB, payment); }
    catch { replayRejected = true; }

    const rollbackIntentId = `pi_r${suffix}`;
    const rollbackHash = `0x${suffix.padEnd(63, "1")}1`;
    const rollbackEventId = `evt_${suffix.padEnd(32, "1")}`;
    await env.DB.prepare("INSERT INTO paymentIntents (id,externalOrderId,marketplaceId,sellerId,merchantAccountId,itemName,amountAtomic,merchantAddress,expiresAt) VALUES (?, ?, 'probe', ?, ?, 'Probe rollback', '1000000', ?, ?)")
      .bind(rollbackIntentId, `rollback-${suffix}`, suffix, accountId, seller, Date.now() + 300_000).run();
    await env.DB.prepare("INSERT INTO webhookDeliveries (id,endpointId,eventId,eventType,paymentIntentId,payload,signature) VALUES (?, ?, ?, 'payment.verified', ?, '{}', '')")
      .bind(`wd_${suffix}`, endpointId, rollbackEventId, rollbackIntentId).run();
    let outboxConflictRejected = false;
    try {
      await commitDirectPaymentAndOutbox(env.DB, {
        ...payment, paymentIntentId: rollbackIntentId,
        transactionHash: rollbackHash, eventId: rollbackEventId,
        eventPayload: JSON.stringify({ id: rollbackEventId, type: "payment.verified", data: {
          paymentIntentId: rollbackIntentId, transactionHash: rollbackHash,
          amountAtomic: "1000000", buyerAddress: buyer, merchantAddress: seller,
        } }),
      });
    } catch { outboxConflictRejected = true; }
    const rollbackIntent = await env.DB.prepare("SELECT status FROM paymentIntents WHERE id = ?")
      .bind(rollbackIntentId).first<{ status: string }>();
    const rollbackRecorded = await env.DB.prepare("SELECT COUNT(*) AS count FROM paymentTransactions WHERE paymentIntentId = ?")
      .bind(rollbackIntentId).first<{ count: number }>();

    const challengeId = `own_${suffix}`;
    await env.DB.prepare("INSERT INTO ownershipChallenges (id,merchantAccountId,marketplaceId,sellerId,walletAddress,message,nonceHash,expiresAt) VALUES (?, ?, 'probe', ?, ?, 'signed message', ?, ?)")
      .bind(challengeId, accountId, suffix, seller, suffix, Date.now() + 300_000).run();
    const challengeInput = { challengeId, merchantAccountId: accountId,
      marketplaceId: "probe", sellerId: suffix, walletAddress: seller,
      ownerUserId: 1, usedAt: new Date() };
    const wrongOwnerRejected = !await consumeVerifiedSellerChallenge(env.DB, {
      ...challengeInput, ownerUserId: 2,
    });
    const sellerActivated = await consumeVerifiedSellerChallenge(env.DB, challengeInput);
    const challengeReplayRejected = !await consumeVerifiedSellerChallenge(env.DB, challengeInput);
    const sellerState = await env.DB.prepare("SELECT status FROM merchantAccounts WHERE id = ?")
      .bind(accountId).first<{ status: string }>();

    const loginChallengeId = `wch_${suffix}`;
    const loginMessage = `Sign in to Druto Platform: ${suffix}`;
    await env.DB.prepare("INSERT INTO walletLoginChallenges (id,walletAddress,message,nonceHash,expiresAt) VALUES (?, ?, ?, ?, ?)")
      .bind(loginChallengeId, seller, loginMessage, `login-${suffix}`, Date.now() + 300_000).run();
    const loginInput = { challengeId: loginChallengeId, walletAddress: seller,
      message: loginMessage, usedAt: new Date() };
    const wrongWalletRejected = !await consumeVerifiedWalletLoginChallenge(env.DB, {
      ...loginInput, walletAddress: buyer,
    });
    const walletLoginConsumed = await consumeVerifiedWalletLoginChallenge(env.DB, loginInput);
    const walletLoginReplayRejected = !await consumeVerifiedWalletLoginChallenge(env.DB, loginInput);

    const queuedRow = await env.DB.prepare("SELECT id FROM webhookDeliveries WHERE paymentIntentId = ?")
      .bind(intentId).first<{ id: string }>();
    const claim = queuedRow ? await claimD1Webhook(env.DB, queuedRow.id) : null;
    const parallelClaimBlocked = queuedRow ? await claimD1Webhook(env.DB, queuedRow.id) === null : false;
    const leaseFinished = claim ? await finishD1Webhook(env.DB, claim, { ok: true }) : false;
    const staleFinishBlocked = claim ? !await finishD1Webhook(env.DB, claim, { ok: true }) : false;
    const deliveryState = queuedRow ? await env.DB.prepare("SELECT status, attempts FROM webhookDeliveries WHERE id = ?")
      .bind(queuedRow.id).first<{ status: string; attempts: number }>() : null;

    const passed = intent?.status === "succeeded" && intent.transactionHash === hash &&
      recorded?.count === 1 && queued?.count === 1 && replayRejected &&
      outboxConflictRejected && rollbackIntent?.status === "requires_payment" &&
      rollbackRecorded?.count === 0 && wrongOwnerRejected && sellerActivated &&
      challengeReplayRejected && sellerState?.status === "active" &&
      wrongWalletRejected && walletLoginConsumed && walletLoginReplayRejected &&
      parallelClaimBlocked && leaseFinished && staleFinishBlocked &&
      deliveryState?.status === "succeeded" && deliveryState.attempts === 1;
    return Response.json({ passed, settled: intent?.status, recorded: recorded?.count,
      queued: queued?.count, replayRejected, outboxConflictRejected,
      rollbackStatus: rollbackIntent?.status, rollbackRecorded: rollbackRecorded?.count,
      wrongOwnerRejected, sellerActivated, challengeReplayRejected,
      wrongWalletRejected, walletLoginConsumed, walletLoginReplayRejected,
      parallelClaimBlocked, leaseFinished, staleFinishBlocked },
      { status: passed ? 200 : 500 });
  },
};
