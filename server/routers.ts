import { COOKIE_NAME } from "@shared/const";
import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { merchantAccounts, ownershipChallenges, paymentIntents, paymentTransactions, webhookDeliveries, webhookEndpoints } from "../drizzle/schema";
import { getDb } from "./db";
import { amountToAtomicUsdc, buildUsdcTransferRequest, verifyArcUsdcTransfer } from "./arc";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { assertIdempotentMatch, assertTransactionOwnership, normalizeMarketplaceReturnUrl } from "./payment-policy";
import { summarizeVerifiedRows } from "./payment-summary";
import { createWebhookSecret, encryptWebhookSecret, isValidWebhookUrl } from "./webhooks";
import { dispatchPaymentVerified, retryWebhookDelivery } from "./webhook-delivery";
import { canApproveSeller, createOwnershipChallenge, hashOwnershipNonce, isOwnershipChallengeUsable, verifyOwnershipSignature } from "./ownership";

export const sellerRoutingInput = z.object({
  marketplaceId: z.string().min(1).max(128),
  sellerId: z.string().min(1).max(128),
  merchantAccountId: z.string().min(1).max(32).optional(),
});

export const paymentInput = z.object({
  externalOrderId: z.string().min(1).max(128),
  idempotencyKey: z.string().min(1).max(128).optional(),
  itemName: z.string().min(1).max(255),
  buyerLabel: z.string().max(255).optional(),
  returnUrl: z.string().max(2048).optional(),
  amount: z.string().regex(/^\d+(\.\d{1,6})?$/, "Amount must be a positive USDC decimal amount"),
  orderContext: z.object({ items: z.array(z.object({ productId: z.string(), name: z.string(), seller: z.string(), unitPrice: z.number().nonnegative(), quantity: z.number().int().positive() })), delivery: z.string(), shippingAddress: z.object({ name: z.string(), line1: z.string(), city: z.string(), postalCode: z.string(), country: z.string() }), buyerEmail: z.string().email() }).optional(),
  seller: sellerRoutingInput.optional(),
});

const LEGACY_DEMO_MERCHANT_ACCOUNT_ID = "legacy-demo-northstar";

function resolveLegacyDemoMerchantAccount(seller: z.infer<typeof sellerRoutingInput>) {
  if (seller.marketplaceId !== "northstar-marketplace" || seller.sellerId !== "northstar-labs") return null;
  // Compatibility only: this preserves the original hackathon demo until an admin registers the seller in merchantAccounts.
  return { id: LEGACY_DEMO_MERCHANT_ACCOUNT_ID, marketplaceId: seller.marketplaceId, externalSellerId: seller.sellerId, displayName: "Northstar Labs", receivingAddress: process.env.ARC_MERCHANT_WALLET_ADDRESS!, ownerUserId: undefined, status: "active" as const };
}

async function resolveMerchantAccount(db: Awaited<ReturnType<typeof getDb>>, seller: z.infer<typeof sellerRoutingInput>, options: { allowPending?: boolean } = {}) {
  if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
  const legacyDemoAccount = resolveLegacyDemoMerchantAccount(seller);
  if (legacyDemoAccount) return legacyDemoAccount;
  const [account] = seller.merchantAccountId
    ? await db.select().from(merchantAccounts).where(eq(merchantAccounts.id, seller.merchantAccountId)).limit(1)
    : await db.select().from(merchantAccounts).where(and(eq(merchantAccounts.marketplaceId, seller.marketplaceId), eq(merchantAccounts.externalSellerId, seller.sellerId))).limit(1);
  if (!account || (!options.allowPending && account.status !== "active")) throw new TRPCError({ code: "NOT_FOUND", message: "Seller is not onboarded or active in Druto" });
  if (account.marketplaceId !== seller.marketplaceId || account.externalSellerId !== seller.sellerId) throw new TRPCError({ code: "CONFLICT", message: "Seller routing identifiers do not match the merchant account" });
  return account;
}

async function resolveMerchantAccountForOperator(db: Awaited<ReturnType<typeof getDb>>, seller: z.infer<typeof sellerRoutingInput>, user: { id: number; role: "admin" | "user" }, options: { allowPending?: boolean } = {}) {
  const account = await resolveMerchantAccount(db, seller, options);
  if (account.id === LEGACY_DEMO_MERCHANT_ACCOUNT_ID) return account;
  if (user.role !== "admin" && account.ownerUserId !== user.id) throw new TRPCError({ code: "FORBIDDEN", message: "You are not authorized to view this seller account" });
  return account;
}

function filterMerchantRows<T extends { merchantAccountId?: string | null }>(rows: T[], merchantAccountId: string) {
  return rows.filter(row => row.merchantAccountId === merchantAccountId);
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  merchantAccounts: router({
    register: adminProcedure.input(z.object({ marketplaceId: z.string().min(1).max(128), sellerId: z.string().min(1).max(128), displayName: z.string().min(1).max(255), receivingAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const id = `ma_${nanoid(12)}`;
      try {
        await db.insert(merchantAccounts).values({ id, marketplaceId: input.marketplaceId, externalSellerId: input.sellerId, ownerUserId: ctx.user.id, displayName: input.displayName, receivingAddress: input.receivingAddress, status: "pending" });
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Seller account already exists" });
      }
      const [account] = await db.select().from(merchantAccounts).where(eq(merchantAccounts.id, id)).limit(1);
      return account;
    }),
    registerWebhook: protectedProcedure.input(z.object({ seller: sellerRoutingInput, url: z.string().min(1).max(2048) })).mutation(async ({ input, ctx }) => {
      if (!isValidWebhookUrl(input.url)) throw new TRPCError({ code: "BAD_REQUEST", message: "Webhook URL must use HTTPS (or localhost HTTP for development)" });
      const db = await getDb();
      const account = await resolveMerchantAccountForOperator(db, input.seller, ctx.user);
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const secret = createWebhookSecret();
      const id = `wh_${nanoid(12)}`;
      await db.insert(webhookEndpoints).values({ id, marketplaceId: account.marketplaceId, merchantAccountId: account.id, ownerUserId: ctx.user.id, url: input.url, secretCiphertext: encryptWebhookSecret(secret), active: 1 });
      return { id, url: input.url, sellerId: account.externalSellerId, secret };
    }),
    listWebhooks: protectedProcedure.input(sellerRoutingInput).query(async ({ input, ctx }) => {
      const db = await getDb();
      const account = await resolveMerchantAccountForOperator(db, input, ctx.user);
      return db!.select({ id: webhookEndpoints.id, url: webhookEndpoints.url, active: webhookEndpoints.active, createdAt: webhookEndpoints.createdAt, updatedAt: webhookEndpoints.updatedAt }).from(webhookEndpoints).where(eq(webhookEndpoints.merchantAccountId, account.id));
    }),
    retryWebhook: protectedProcedure.input(z.object({ deliveryId: z.string().min(1).max(32) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [delivery] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, input.deliveryId)).limit(1);
      if (!delivery) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook delivery not found" });
      const [endpoint] = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, delivery.endpointId)).limit(1);
      if (!endpoint) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook endpoint not found" });
      const [account] = await db.select().from(merchantAccounts).where(eq(merchantAccounts.id, endpoint.merchantAccountId!)).limit(1);
      if (!account || (ctx.user.role !== "admin" && account.ownerUserId !== ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN", message: "You are not authorized to retry this delivery" });
      return retryWebhookDelivery(db, input.deliveryId);
    }),
    createOwnershipChallenge: protectedProcedure.input(z.object({ seller: sellerRoutingInput, origin: z.string().url().max(2048) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const account = await resolveMerchantAccountForOperator(db, input.seller, ctx.user, { allowPending: true });
      const challenge = createOwnershipChallenge({ marketplaceId: account.marketplaceId, sellerId: account.externalSellerId, walletAddress: account.receivingAddress, origin: input.origin });
      const challengeId = `oc_${nanoid(12)}`;
      await db.insert(ownershipChallenges).values({ id: challengeId, merchantAccountId: account.id, marketplaceId: account.marketplaceId, sellerId: account.externalSellerId, walletAddress: account.receivingAddress, message: challenge.message, nonceHash: challenge.nonceHash, expiresAt: challenge.expiresAt });
      return { challengeId, nonce: challenge.nonce, message: challenge.message, expiresAt: challenge.expiresAt, walletAddress: account.receivingAddress };
    }),
    verifyOwnership: publicProcedure.input(z.object({ challengeId: z.string().min(1).max(32), nonce: z.string().min(1).max(128), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [challenge] = await db.select().from(ownershipChallenges).where(eq(ownershipChallenges.id, input.challengeId)).limit(1);
      if (!challenge) throw new TRPCError({ code: "NOT_FOUND", message: "Ownership challenge not found" });
      if (!isOwnershipChallengeUsable({ usedAt: challenge.usedAt, expiresAt: challenge.expiresAt })) throw new TRPCError({ code: "BAD_REQUEST", message: "Ownership challenge is expired or already used" });
      if (hashOwnershipNonce(input.nonce) !== challenge.nonceHash) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid ownership nonce" });
      const valid = await verifyOwnershipSignature({ walletAddress: challenge.walletAddress, message: challenge.message, signature: input.signature as `0x${string}` });
      if (!valid) throw new TRPCError({ code: "BAD_REQUEST", message: "Wallet signature does not match the approved receiving address" });
      await db.update(ownershipChallenges).set({ usedAt: new Date() }).where(and(eq(ownershipChallenges.id, challenge.id), isNull(ownershipChallenges.usedAt)));
      await db.update(merchantAccounts).set({ walletVerifiedAt: new Date() }).where(eq(merchantAccounts.id, challenge.merchantAccountId));
      return { verified: true, merchantAccountId: challenge.merchantAccountId, walletAddress: challenge.walletAddress };
    }),
    approve: adminProcedure.input(z.object({ merchantAccountId: z.string().min(1).max(32) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [accountBeforeApproval] = await db.select().from(merchantAccounts).where(eq(merchantAccounts.id, input.merchantAccountId)).limit(1);
      if (!accountBeforeApproval || !canApproveSeller({ walletVerifiedAt: accountBeforeApproval.walletVerifiedAt })) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Seller wallet ownership must be verified before approval" });
      await db.update(merchantAccounts).set({ status: "active" }).where(eq(merchantAccounts.id, input.merchantAccountId));
      const [account] = await db.select().from(merchantAccounts).where(eq(merchantAccounts.id, input.merchantAccountId)).limit(1);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Merchant account not found" });
      return account;
    }),
  }),

  payments: router({
    createIntent: publicProcedure.input(paymentInput).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const idempotencyKey = input.idempotencyKey ?? input.externalOrderId;
      const amountAtomic = amountToAtomicUsdc(input.amount);
      const orderContext = input.orderContext ? JSON.stringify(input.orderContext) : null;
      const returnUrl = normalizeMarketplaceReturnUrl(input.returnUrl);
      const merchantAccount = input.seller ? await resolveMerchantAccount(db, input.seller) : null;
      const merchantAddress = merchantAccount?.receivingAddress ?? process.env.ARC_MERCHANT_WALLET_ADDRESS!;
      const [existing] = await db.select().from(paymentIntents).where(eq(paymentIntents.idempotencyKey, idempotencyKey)).limit(1);
      if (existing) {
        try {
          assertIdempotentMatch(existing, { externalOrderId: input.externalOrderId, itemName: input.itemName, amountAtomic });
          if (input.seller && (existing.marketplaceId !== input.seller.marketplaceId || existing.sellerId !== input.seller.sellerId || existing.merchantAccountId !== merchantAccount?.id)) throw new Error("Seller routing mismatch for reused idempotency key");
        } catch (error) { throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Idempotency mismatch" }); }
        return { id: existing.id, externalOrderId: existing.externalOrderId, itemName: existing.itemName, buyerLabel: existing.buyerLabel, returnUrl: existing.returnUrl, displayAmount: (Number(existing.amountAtomic) / 1_000_000).toFixed(6), asset: "USDC" as const, network: "arc-testnet" as const, marketplaceId: existing.marketplaceId, sellerId: existing.sellerId, merchantAccountId: existing.merchantAccountId, merchantAddress: existing.merchantAddress, expiresAt: existing.expiresAt, checkoutUrl: `/checkout/${existing.id}` };
      }
      const id = `pi_${nanoid(12)}`;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await db.insert(paymentIntents).values({
        id,
        externalOrderId: input.externalOrderId,
        marketplaceId: input.seller?.marketplaceId,
        sellerId: input.seller?.sellerId,
        merchantAccountId: merchantAccount?.id,
        idempotencyKey,
        itemName: input.itemName,
        buyerLabel: input.buyerLabel,
        returnUrl,
        orderContext,
        amountAtomic,
        asset: "USDC",
        network: "arc-testnet",
        merchantAddress,
        status: "requires_payment",
        expiresAt,
      });
      return {
        id,
        externalOrderId: input.externalOrderId,
        itemName: input.itemName,
        buyerLabel: input.buyerLabel,
        returnUrl,
        marketplaceId: input.seller?.marketplaceId,
        sellerId: input.seller?.sellerId,
        merchantAccountId: merchantAccount?.id,
        displayAmount: input.amount,
        asset: "USDC" as const,
        network: "arc-testnet" as const,
        merchantAddress,
        expiresAt,
        checkoutUrl: `/checkout/${id}`,
      };
    }),

    listIntents: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      return db.select().from(paymentIntents).where(eq(paymentIntents.merchantAddress, process.env.ARC_MERCHANT_WALLET_ADDRESS!));
    }),

    verifiedPayments: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      return db.select({ id: paymentTransactions.transactionHash, paymentIntentId: paymentTransactions.paymentIntentId, externalOrderId: paymentIntents.externalOrderId, itemName: paymentIntents.itemName, amountAtomic: paymentTransactions.amountAtomic, transactionHash: paymentTransactions.transactionHash, fromAddress: paymentTransactions.fromAddress, toAddress: paymentTransactions.toAddress, finalizedAt: paymentTransactions.finalizedAt, createdAt: paymentIntents.createdAt }).from(paymentTransactions).innerJoin(paymentIntents, eq(paymentTransactions.paymentIntentId, paymentIntents.id)).where(eq(paymentIntents.merchantAddress, process.env.ARC_MERCHANT_WALLET_ADDRESS!));
    }),

    summary: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const intents = await db.select().from(paymentIntents).where(eq(paymentIntents.merchantAddress, process.env.ARC_MERCHANT_WALLET_ADDRESS!));
      const verifiedRows = await db.select({ amountAtomic: paymentTransactions.amountAtomic, paymentIntentId: paymentTransactions.paymentIntentId }).from(paymentTransactions).innerJoin(paymentIntents, eq(paymentTransactions.paymentIntentId, paymentIntents.id)).where(eq(paymentIntents.merchantAddress, process.env.ARC_MERCHANT_WALLET_ADDRESS!));
      const pending = intents.filter(intent => intent.status === "requires_payment" || intent.status === "submitted" || intent.status === "verifying");
      const verifiedSummary = summarizeVerifiedRows(verifiedRows);
      const pendingAtomic = pending.reduce((sum, intent) => sum + BigInt(intent.amountAtomic), BigInt(0));
      return { availableUsdc: (Number(verifiedSummary.totalAtomic) / 1_000_000).toFixed(2), grossUsdc: (Number(verifiedSummary.totalAtomic) / 1_000_000).toFixed(2), pendingUsdc: (Number(pendingAtomic) / 1_000_000).toFixed(2), successfulCount: verifiedSummary.count, pendingCount: pending.length, totalCount: intents.length };
    }),

    getIntent: publicProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, input.id)).limit(1);
      if (!intent) throw new TRPCError({ code: "NOT_FOUND", message: "Payment Intent not found" });
      return intent;
    }),

    prepareTransfer: publicProcedure.input(z.object({ id: z.string().min(1), buyerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, input.id)).limit(1);
      if (!intent) throw new TRPCError({ code: "NOT_FOUND", message: "Payment Intent not found" });
      if (intent.expiresAt.getTime() <= Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "Payment Intent has expired" });
      await db.update(paymentIntents).set({ buyerAddress: input.buyerAddress, status: "submitted" }).where(eq(paymentIntents.id, input.id));
      return buildUsdcTransferRequest(intent.amountAtomic, intent.merchantAddress);
    }),

    verifyTransfer: publicProcedure.input(z.object({ id: z.string().min(1), idempotencyKey: z.string().min(1).max(128).optional(), transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, input.id)).limit(1);
      if (!intent) throw new TRPCError({ code: "NOT_FOUND", message: "Payment Intent not found" });
      if (input.idempotencyKey && input.idempotencyKey !== intent.idempotencyKey) throw new TRPCError({ code: "CONFLICT", message: "Verification idempotency key does not match the Payment Intent" });
      if (intent.status === "succeeded") return intent;
      const [existingTransaction] = await db.select().from(paymentTransactions).where(eq(paymentTransactions.transactionHash, input.transactionHash)).limit(1);
      if (existingTransaction) {
        try { assertTransactionOwnership(existingTransaction.paymentIntentId, intent.id); } catch (error) { throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Transaction hash conflict" }); }
        const [alreadyUpdated] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, intent.id)).limit(1);
        return alreadyUpdated;
      }
      try {
        const verified = await verifyArcUsdcTransfer(input.transactionHash as `0x${string}`, intent.amountAtomic, intent.merchantAddress);
        const transactionRecord = { paymentIntentId: intent.id, transactionHash: verified.transactionHash, fromAddress: verified.fromAddress, toAddress: verified.toAddress, tokenAddress: buildUsdcTransferRequest(intent.amountAtomic, intent.merchantAddress).tokenAddress, amountAtomic: verified.amountAtomic, chainId: 5042002, finalizedAt: new Date() };
        await db.insert(paymentTransactions).values(transactionRecord);
        await db.update(paymentIntents).set({ status: "succeeded", transactionHash: verified.transactionHash }).where(and(eq(paymentIntents.id, intent.id), eq(paymentIntents.status, "submitted")));
        try { await dispatchPaymentVerified(db, intent, transactionRecord as never); } catch (deliveryError) { console.error("[Webhook] payment.verified dispatch failed", deliveryError); }
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to verify Arc transaction" });
      }
      const [updated] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, intent.id)).limit(1);
      return updated;
    }),

    sellerIntents: protectedProcedure.input(sellerRoutingInput).query(async ({ input, ctx }) => {
      const db = await getDb();
      const account = await resolveMerchantAccountForOperator(db, input, ctx.user);
      const intents = await db!.select().from(paymentIntents).where(eq(paymentIntents.merchantAccountId, account.id));
      return filterMerchantRows(intents, account.id);
    }),

    sellerPayments: protectedProcedure.input(sellerRoutingInput).query(async ({ input, ctx }) => {
      const db = await getDb();
      const account = await resolveMerchantAccountForOperator(db, input, ctx.user);
      const payments = await db!.select({ id: paymentTransactions.transactionHash, paymentIntentId: paymentTransactions.paymentIntentId, externalOrderId: paymentIntents.externalOrderId, itemName: paymentIntents.itemName, amountAtomic: paymentTransactions.amountAtomic, transactionHash: paymentTransactions.transactionHash, fromAddress: paymentTransactions.fromAddress, toAddress: paymentTransactions.toAddress, finalizedAt: paymentTransactions.finalizedAt, createdAt: paymentIntents.createdAt, merchantAccountId: paymentIntents.merchantAccountId }).from(paymentTransactions).innerJoin(paymentIntents, eq(paymentTransactions.paymentIntentId, paymentIntents.id)).where(eq(paymentIntents.merchantAccountId, account.id));
      return filterMerchantRows(payments, account.id);
    }),

    sellerSummary: protectedProcedure.input(sellerRoutingInput).query(async ({ input, ctx }) => {
      const db = await getDb();
      const account = await resolveMerchantAccountForOperator(db, input, ctx.user);
      const intents = await db!.select().from(paymentIntents).where(eq(paymentIntents.merchantAccountId, account.id));
      const verifiedRows = await db!.select({ amountAtomic: paymentTransactions.amountAtomic, paymentIntentId: paymentTransactions.paymentIntentId, merchantAccountId: paymentIntents.merchantAccountId }).from(paymentTransactions).innerJoin(paymentIntents, eq(paymentTransactions.paymentIntentId, paymentIntents.id)).where(eq(paymentIntents.merchantAccountId, account.id));
      const pending = intents.filter(intent => intent.status === "requires_payment" || intent.status === "submitted" || intent.status === "verifying");
      const verifiedSummary = summarizeVerifiedRows(filterMerchantRows(verifiedRows, account.id));
      const pendingAtomic = pending.reduce((sum, intent) => sum + BigInt(intent.amountAtomic), BigInt(0));
      return { merchantAccountId: account.id, marketplaceId: account.marketplaceId, sellerId: account.externalSellerId, displayName: account.displayName, receivingAddress: account.receivingAddress, availableUsdc: (Number(verifiedSummary.totalAtomic) / 1_000_000).toFixed(2), grossUsdc: (Number(verifiedSummary.totalAtomic) / 1_000_000).toFixed(2), pendingUsdc: (Number(pendingAtomic) / 1_000_000).toFixed(2), successfulCount: verifiedSummary.count, pendingCount: pending.length, totalCount: intents.length };
    }),
  }),
});

export type AppRouter = typeof appRouter;
