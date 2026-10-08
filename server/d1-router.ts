import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { getAddress, verifyMessage } from "viem";
import { z } from "zod";
import { apiKeysD1, merchantAccountsD1, ownershipChallengesD1, paymentIntentsD1,
  paymentTransactionsD1, usersD1, walletLoginChallengesD1, webhookDeliveriesD1, webhookEndpointsD1 } from "../drizzle/schema.d1";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { getD1, getD1Binding } from "./d1-db";
import { commitDirectPaymentAndOutbox, consumeVerifiedSellerChallenge, consumeVerifiedWalletLoginChallenge } from "./d1-atomic";
import { createApiKeyMaterial, hashApiKey } from "./api-keys";
import { drutoPublicOrigin } from "./public-origin";
import { paymentInput, sellerRoutingInput } from "./payment-contract";
import { amountToAtomicUsdc, verifyArcUsdcTransfer, ARC_CHAIN_ID, ARC_USDC_ADDRESS } from "./arc";
import { normalizeMarketplaceReturnUrl } from "./payment-policy";
import { assertIntentRetry, scopedIntentKey } from "./payment-idempotency";
import { createdPaymentSession, privatePaymentIntent, publicPaymentIntent } from "./payment-intent-view";
import { summarizeVerifiedRows } from "./payment-summary";
import { createWebhookSecret, encryptWebhookSecret, isAllowedWebhookOrigin, isValidWebhookUrl } from "./webhooks";
import { buildPaymentVerifiedEvent, serializeWebhookEvent } from "./webhooks";
import { sendD1Webhook } from "./d1-webhook-drain";

const unavailable = () => { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This operation is not enabled on D1 Testnet yet" }); };
const db = getD1;

async function seller(input: z.infer<typeof sellerRoutingInput>, ownerId?: number) {
  const [account] = input.merchantAccountId
    ? await db().select().from(merchantAccountsD1).where(eq(merchantAccountsD1.id, input.merchantAccountId)).limit(1)
    : await db().select().from(merchantAccountsD1).where(and(eq(merchantAccountsD1.marketplaceId, input.marketplaceId), eq(merchantAccountsD1.externalSellerId, input.sellerId))).limit(1);
  if (!account || account.marketplaceId !== input.marketplaceId || account.externalSellerId !== input.sellerId ||
      (ownerId !== undefined && account.ownerUserId !== ownerId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Seller account not found" });
  }
  return account;
}

async function accountIds(user: { id: number; role: "admin" | "user" }) {
  const rows = user.role === "admin"
    ? await db().select({ id: merchantAccountsD1.id }).from(merchantAccountsD1)
    : await db().select({ id: merchantAccountsD1.id }).from(merchantAccountsD1).where(eq(merchantAccountsD1.ownerUserId, user.id));
  return rows.map(row => row.id);
}

export const d1Router = router({
  apiKeys: router({
    list: protectedProcedure.query(({ ctx }) => db().select({ id: apiKeysD1.id, name: apiKeysD1.name,
      prefix: apiKeysD1.prefix, lastFour: apiKeysD1.lastFour, merchantAccountId: apiKeysD1.merchantAccountId,
      marketplaceId: apiKeysD1.marketplaceId, sellerId: apiKeysD1.sellerId, sellerDisplayName: apiKeysD1.sellerDisplayName,
      createdAt: apiKeysD1.createdAt, lastUsedAt: apiKeysD1.lastUsedAt, revokedAt: apiKeysD1.revokedAt })
      .from(apiKeysD1).where(eq(apiKeysD1.ownerUserId, ctx.user.id))),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(120),
      merchantAccountId: z.string().min(1).max(32).optional() })).mutation(async ({ input, ctx }) => {
      const account = input.merchantAccountId
        ? (await db().select().from(merchantAccountsD1).where(eq(merchantAccountsD1.id, input.merchantAccountId)).limit(1))[0]
        : undefined;
      if (input.merchantAccountId && (!account || (ctx.user.role !== "admin" && account.ownerUserId !== ctx.user.id) ||
        account.status !== "active" || !account.walletVerifiedAt)) throw new TRPCError({ code: "FORBIDDEN", message: "Verified seller account required" });
      const material = createApiKeyMaterial(input.name);
      await db().insert(apiKeysD1).values({ id: material.id, ownerUserId: ctx.user.id, name: material.name,
        prefix: material.prefix, lastFour: material.lastFour, merchantAccountId: account?.id,
        marketplaceId: account?.marketplaceId, sellerId: account?.externalSellerId,
        sellerDisplayName: account?.displayName, secretHash: material.secretHash });
      return { id: material.id, name: material.name, prefix: material.prefix, lastFour: material.lastFour,
        merchantAccountId: account?.id ?? null, marketplaceId: account?.marketplaceId ?? null,
        sellerId: account?.externalSellerId ?? null, sellerDisplayName: account?.displayName ?? null, secret: material.secret };
    }),
    revoke: protectedProcedure.input(z.object({ id: z.string().min(1).max(32) })).mutation(async ({ input, ctx }) => {
      const updated = await db().update(apiKeysD1).set({ revokedAt: new Date() }).where(and(eq(apiKeysD1.id, input.id),
        eq(apiKeysD1.ownerUserId, ctx.user.id), isNull(apiKeysD1.revokedAt))).returning({ id: apiKeysD1.id });
      if (updated.length !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Active API key not found" });
      return { success: true } as const;
    }),
  }),
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), sameSite: "lax", maxAge: -1 });
      return { success: true } as const;
    }),
    createWalletChallenge: publicProcedure.input(z.object({ walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/) })).mutation(async ({ input }) => {
      const walletAddress = getAddress(input.walletAddress);
      const challengeId = `wch_${nanoid(12)}`;
      const nonce = nanoid(24);
      const issuedAt = new Date();
      const expiresAt = new Date(issuedAt.getTime() + 10 * 60_000);
      const message = `Sign in to Druto Platform\n\nWallet: ${walletAddress}\nNonce: ${nonce}\nIssued At: ${issuedAt.toISOString()}`;
      await db().insert(walletLoginChallengesD1).values({ id: challengeId, walletAddress, message,
        nonceHash: createHash("sha256").update(nonce).digest("hex"), expiresAt });
      return { challengeId, message, expiresAt };
    }),
    verifyWalletLogin: publicProcedure.input(z.object({ challengeId: z.string().min(1).max(32),
      walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/), signature: z.string().regex(/^0x[a-fA-F0-9]+$/).max(2048) })).mutation(async ({ input, ctx }) => {
      const walletAddress = getAddress(input.walletAddress);
      const [challenge] = await db().select().from(walletLoginChallengesD1).where(eq(walletLoginChallengesD1.id, input.challengeId)).limit(1);
      if (!challenge || challenge.usedAt || challenge.expiresAt.getTime() <= Date.now() || challenge.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Wallet login challenge unavailable" });
      }
      const verified = await verifyMessage({ address: walletAddress, message: challenge.message,
        signature: input.signature as `0x${string}` }).catch(() => false);
      if (!verified) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid wallet signature" });
      const consumed = await consumeVerifiedWalletLoginChallenge(getD1Binding(), { challengeId: challenge.id,
        walletAddress, message: challenge.message, usedAt: new Date() });
      if (!consumed) throw new TRPCError({ code: "CONFLICT", message: "Wallet challenge already used" });
      const openId = `wallet-${walletAddress.toLowerCase()}`;
      const name = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
      await db().insert(usersD1).values({ openId, name, loginMethod: "wallet", role: "user", lastSignedIn: new Date() })
        .onConflictDoUpdate({ target: usersD1.openId, set: { name, loginMethod: "wallet", lastSignedIn: new Date() } });
      const token = await sdk.createSessionToken(openId, { name });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), sameSite: "lax", maxAge: 365 * 24 * 60 * 60 * 1000 });
      return { authenticated: true, openId, name, token, walletAddress } as const;
    }),
    privyLogin: publicProcedure.mutation(unavailable),
    bindWallet: protectedProcedure.mutation(unavailable),
    updateProfile: protectedProcedure.input(z.object({ name: z.string().optional(), profileImage: z.string().optional() })).mutation(async ({ input, ctx }) => {
      await db().update(usersD1).set({ name: input.name ?? ctx.user.name, profileImage: input.profileImage ?? ctx.user.profileImage,
        updatedAt: new Date() }).where(eq(usersD1.id, ctx.user.id));
      return (await db().select().from(usersD1).where(eq(usersD1.id, ctx.user.id)).limit(1))[0];
    }),
  }),
  merchantAccounts: router({
    listMine: protectedProcedure.query(async ({ ctx }) => {
      const accounts = ctx.user.role === "admin" ? await db().select().from(merchantAccountsD1)
        : await db().select().from(merchantAccountsD1).where(eq(merchantAccountsD1.ownerUserId, ctx.user.id));
      const ids = accounts.map(row => row.id);
      const webhooks = ids.length ? await db().select({ id: webhookEndpointsD1.id, merchantAccountId: webhookEndpointsD1.merchantAccountId,
        url: webhookEndpointsD1.url, active: webhookEndpointsD1.active, createdAt: webhookEndpointsD1.createdAt,
        updatedAt: webhookEndpointsD1.updatedAt }).from(webhookEndpointsD1).where(inArray(webhookEndpointsD1.merchantAccountId, ids)) : [];
      return { accounts, webhooks };
    }),
    register: protectedProcedure.input(z.object({ marketplaceId: z.string().min(1).max(128), sellerId: z.string().min(1).max(128),
      displayName: z.string().min(1).max(255), receivingAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/) })).mutation(async ({ input, ctx }) => {
      const [existing] = await db().select().from(merchantAccountsD1).where(and(eq(merchantAccountsD1.marketplaceId, input.marketplaceId),
        eq(merchantAccountsD1.externalSellerId, input.sellerId))).limit(1);
      const receivingAddress = getAddress(input.receivingAddress);
      if (existing) {
        if (existing.ownerUserId !== ctx.user.id) throw new TRPCError({ code: "CONFLICT", message: "Seller ID is already registered by another account" });
        if (existing.status === "disabled" || existing.receivingAddress.toLowerCase() !== receivingAddress.toLowerCase()) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Receiving-wallet changes require separate verification" });
        }
        const updated = await db().update(merchantAccountsD1).set({ displayName: input.displayName, updatedAt: new Date() })
          .where(and(eq(merchantAccountsD1.id, existing.id), eq(merchantAccountsD1.ownerUserId, ctx.user.id))).returning();
        return updated[0];
      }
      const id = `ma_${nanoid(12)}`;
      try {
        await db().insert(merchantAccountsD1).values({ id, marketplaceId: input.marketplaceId, externalSellerId: input.sellerId,
          ownerUserId: ctx.user.id, displayName: input.displayName, receivingAddress, status: "pending" });
      } catch { throw new TRPCError({ code: "CONFLICT", message: "Seller account already exists" }); }
      return (await db().select().from(merchantAccountsD1).where(eq(merchantAccountsD1.id, id)).limit(1))[0];
    }),
    registerWebhook: protectedProcedure.input(z.object({ seller: sellerRoutingInput, url: z.string().min(1).max(2048) })).mutation(async ({ input, ctx }) => {
      if (!isValidWebhookUrl(input.url) || !isAllowedWebhookOrigin(input.url)) throw new TRPCError({ code: "BAD_REQUEST", message: "Webhook HTTPS origin is not enabled" });
      const account = await seller(input.seller, ctx.user.id);
      if (account.status !== "active" || !account.walletVerifiedAt) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Seller wallet must be verified" });
      const id = `wh_${nanoid(12)}`;
      const secret = createWebhookSecret();
      const urlHash = createHash("sha256").update(input.url).digest("hex");
      await db().insert(webhookEndpointsD1).values({ id, marketplaceId: account.marketplaceId, merchantAccountId: account.id,
        ownerUserId: ctx.user.id, url: input.url, urlHash, secretCiphertext: encryptWebhookSecret(secret), active: 1 });
      return { id, url: input.url, sellerId: account.externalSellerId, secret };
    }),
    listWebhooks: protectedProcedure.input(sellerRoutingInput).query(async ({ input, ctx }) => {
      const account = await seller(input, ctx.user.id);
      return db().select({ id: webhookEndpointsD1.id, url: webhookEndpointsD1.url, active: webhookEndpointsD1.active,
        createdAt: webhookEndpointsD1.createdAt, updatedAt: webhookEndpointsD1.updatedAt }).from(webhookEndpointsD1)
        .where(eq(webhookEndpointsD1.merchantAccountId, account.id));
    }),
    retryWebhook: protectedProcedure.input(z.object({ deliveryId: z.string().min(1).max(32) })).mutation(async ({ input, ctx }) => {
      const [delivery] = await db().select().from(webhookDeliveriesD1).where(eq(webhookDeliveriesD1.id, input.deliveryId)).limit(1);
      if (!delivery) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook delivery not found" });
      const [endpoint] = await db().select().from(webhookEndpointsD1).where(eq(webhookEndpointsD1.id, delivery.endpointId)).limit(1);
      if (!endpoint || !endpoint.merchantAccountId) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook endpoint not found" });
      const [account] = await db().select().from(merchantAccountsD1).where(eq(merchantAccountsD1.id, endpoint.merchantAccountId)).limit(1);
      if (!account || (ctx.user.role !== "admin" && account.ownerUserId !== ctx.user.id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Seller account ownership required" });
      }
      return sendD1Webhook(delivery.id, true);
    }),
    approve: adminProcedure.mutation(unavailable),
  }),
  sellerOwnership: router({
    createChallenge: protectedProcedure.input(z.object({ merchantAccountId: z.string().min(1).max(32) })).mutation(async ({ input, ctx }) => {
      const [account] = await db().select().from(merchantAccountsD1).where(eq(merchantAccountsD1.id, input.merchantAccountId)).limit(1);
      if (!account || account.ownerUserId !== ctx.user.id || account.status === "disabled") throw new TRPCError({ code: "FORBIDDEN" });
      const id = `own_${nanoid(12)}`;
      const nonce = nanoid(32);
      const expiresAt = new Date(Date.now() + 5 * 60_000);
      const walletAddress = getAddress(account.receivingAddress);
      const message = `Druto seller receiving-wallet verification\nOrigin: ${drutoPublicOrigin()}\nChain ID: 5042002\nAccount: ${account.id}\nOwner: ${ctx.user.id}\nMarketplace: ${account.marketplaceId}\nSeller: ${account.externalSellerId}\nWallet: ${walletAddress}\nNonce: ${nonce}\nExpires: ${expiresAt.toISOString()}\nThis signature verifies the receiving wallet; it does not transfer funds.`;
      await db().insert(ownershipChallengesD1).values({ id, merchantAccountId: account.id, marketplaceId: account.marketplaceId,
        sellerId: account.externalSellerId, walletAddress, message, nonceHash: createHash("sha256").update(nonce).digest("hex"), expiresAt });
      return { challengeId: id, message, expiresAt, walletAddress };
    }),
    verify: protectedProcedure.input(z.object({ merchantAccountId: z.string().min(1).max(32), challengeId: z.string().min(1).max(32),
      signature: z.string().regex(/^0x[a-fA-F0-9]+$/).max(2048) })).mutation(async ({ input, ctx }) => {
      const [account] = await db().select().from(merchantAccountsD1).where(eq(merchantAccountsD1.id, input.merchantAccountId)).limit(1);
      if (!account || account.ownerUserId !== ctx.user.id || account.status === "disabled") throw new TRPCError({ code: "FORBIDDEN" });
      const [challenge] = await db().select().from(ownershipChallengesD1).where(eq(ownershipChallengesD1.id, input.challengeId)).limit(1);
      if (!challenge || challenge.merchantAccountId !== account.id || challenge.marketplaceId !== account.marketplaceId ||
        challenge.sellerId !== account.externalSellerId || challenge.walletAddress.toLowerCase() !== account.receivingAddress.toLowerCase() ||
        !challenge.message.includes(`\nOwner: ${ctx.user.id}\n`) || challenge.usedAt || challenge.expiresAt.getTime() <= Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Seller challenge unavailable" });
      }
      const verified = await verifyMessage({ address: getAddress(account.receivingAddress), message: challenge.message,
        signature: input.signature as `0x${string}` }).catch(() => false);
      if (!verified) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid receiving-wallet signature" });
      const usedAt = new Date();
      if (!await consumeVerifiedSellerChallenge(getD1Binding(), { challengeId: challenge.id, merchantAccountId: account.id,
        marketplaceId: account.marketplaceId, sellerId: account.externalSellerId, walletAddress: account.receivingAddress,
        ownerUserId: ctx.user.id, usedAt })) throw new TRPCError({ code: "CONFLICT", message: "Seller challenge already used" });
      return { merchantAccountId: account.id, status: "active" as const, walletVerifiedAt: usedAt };
    }),
  }),
  payments: router({
    createIntent: publicProcedure.input(paymentInput).mutation(async ({ input, ctx }) => {
      if (!input.seller) throw new TRPCError({ code: "BAD_REQUEST", message: "Verified seller is required" });
      const authorization = ctx.req.headers.authorization;
      if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Seller API key required" });
      }
      const [key] = await db().select().from(apiKeysD1).where(eq(apiKeysD1.secretHash,
        hashApiKey(authorization.slice(7).trim()))).limit(1);
      if (!key || key.revokedAt || !key.merchantAccountId || key.marketplaceId !== input.seller.marketplaceId ||
        key.sellerId !== input.seller.sellerId || (input.seller.merchantAccountId && input.seller.merchantAccountId !== key.merchantAccountId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "API key is not authorized for this seller" });
      }
      const account = await seller({ ...input.seller, merchantAccountId: key.merchantAccountId });
      if (account.status !== "active" || !account.walletVerifiedAt) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Seller wallet is not verified" });
      await db().update(apiKeysD1).set({ lastUsedAt: new Date() }).where(eq(apiKeysD1.id, key.id));
      const amountAtomic = amountToAtomicUsdc(input.amount);
      const rawKey = input.idempotencyKey ?? input.externalOrderId;
      if (rawKey.startsWith("druto_v2_")) throw new TRPCError({ code: "BAD_REQUEST", message: "Reserved idempotency key" });
      const idempotencyKey = scopedIntentKey(rawKey, { marketplaceId: account.marketplaceId,
        sellerId: account.externalSellerId, merchantAccountId: account.id });
      const [existing] = await db().select().from(paymentIntentsD1).where(eq(paymentIntentsD1.idempotencyKey, idempotencyKey)).limit(1);
      const intent = { id: `pi_${nanoid(12)}`, externalOrderId: input.externalOrderId,
        marketplaceId: account.marketplaceId, sellerId: account.externalSellerId, merchantAccountId: account.id,
        idempotencyKey, itemName: input.itemName, buyerLabel: input.buyerLabel ?? null,
        returnUrl: normalizeMarketplaceReturnUrl(input.returnUrl), orderContext: input.orderContext ? JSON.stringify(input.orderContext) : null,
        amountAtomic, platformFeeBps: 0, platformFeeAmount: "0", merchantPayoutAmount: amountAtomic,
        splitContractAddress: null, asset: "USDC", network: "arc-testnet", merchantAddress: account.receivingAddress,
        buyerAddress: null, status: "requires_payment" as const, transactionHash: null,
        expiresAt: new Date(Date.now() + 30 * 60_000), createdAt: new Date(), updatedAt: new Date() };
      if (existing) {
        assertIntentRetry(existing as any, intent as any);
        return createdPaymentSession(existing as any, drutoPublicOrigin());
      }
      try { await db().insert(paymentIntentsD1).values(intent); }
      catch {
        const [winner] = await db().select().from(paymentIntentsD1).where(eq(paymentIntentsD1.idempotencyKey, idempotencyKey)).limit(1);
        if (!winner) throw new TRPCError({ code: "CONFLICT", message: "Intent creation conflicted; retry" });
        assertIntentRetry(winner as any, intent as any);
        return createdPaymentSession(winner as any, drutoPublicOrigin());
      }
      const [saved] = await db().select().from(paymentIntentsD1).where(eq(paymentIntentsD1.id, intent.id)).limit(1);
      if (!saved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Intent creation could not be confirmed" });
      return createdPaymentSession(saved as any, drutoPublicOrigin());
    }),
    getIntent: publicProcedure.input(z.object({ id: z.string().min(1).max(32) })).query(async ({ input, ctx }) => {
      ctx.res.setHeader("Cache-Control", "private, no-store");
      const [intent] = await db().select().from(paymentIntentsD1).where(eq(paymentIntentsD1.id, input.id)).limit(1);
      if (!intent) throw new TRPCError({ code: "NOT_FOUND", message: "Payment Intent not found" });
      return publicPaymentIntent(intent as any, drutoPublicOrigin());
    }),
    getPrivateIntent: protectedProcedure.input(z.object({ id: z.string().min(1).max(32) })).query(async ({ input, ctx }) => {
      const [intent] = await db().select().from(paymentIntentsD1).where(eq(paymentIntentsD1.id, input.id)).limit(1);
      if (!intent) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "admin") {
        if (!intent.merchantAccountId) throw new TRPCError({ code: "NOT_FOUND" });
        const [account] = await db().select().from(merchantAccountsD1).where(eq(merchantAccountsD1.id, intent.merchantAccountId)).limit(1);
        if (!account || account.ownerUserId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      }
      return privatePaymentIntent(intent as any, drutoPublicOrigin());
    }),
    verifyTransfer: publicProcedure.input(z.object({ paymentIntentId: z.string().min(1).max(32),
      transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
      payerSignature: z.string().regex(/^0x[a-fA-F0-9]+$/).max(2048).optional() })).mutation(async ({ input }) => {
      const hash = input.transactionHash.toLowerCase() as `0x${string}`;
      const [intent] = await db().select().from(paymentIntentsD1).where(eq(paymentIntentsD1.id, input.paymentIntentId)).limit(1);
      if (!intent) throw new TRPCError({ code: "NOT_FOUND", message: "Payment Intent not found" });
      const success = async () => {
        const [tx] = await db().select().from(paymentTransactionsD1).where(eq(paymentTransactionsD1.paymentIntentId, intent.id)).limit(1);
        if (!tx || tx.transactionHash.toLowerCase() !== hash) throw new TRPCError({ code: "CONFLICT", message: "Payment ledger requires review" });
        return { paymentIntentId: intent.id, transactionHash: tx.transactionHash, fromAddress: tx.fromAddress,
          toAddress: tx.toAddress, amountAtomic: tx.amountAtomic, status: "succeeded" as const };
      };
      if (intent.status === "succeeded") return success();
      if (!(["requires_payment", "submitted", "verifying", "expired"] as string[]).includes(intent.status)) {
        throw new TRPCError({ code: "CONFLICT", message: "Payment state does not allow verification" });
      }
      const verified = await verifyArcUsdcTransfer(hash, intent.amountAtomic, intent.merchantAddress, intent.id,
        { createdAt: intent.createdAt, expiresAt: intent.expiresAt, payerSignature: input.payerSignature as `0x${string}` | undefined,
          origin: drutoPublicOrigin(), platformFeeBps: intent.platformFeeBps, splitterAddress: intent.splitContractAddress })
        .catch(error => { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Arc verification failed" }); });
      if (verified.isSplit || verified.platformFeeAmount !== "0" || verified.amountAtomic !== intent.amountAtomic) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only direct zero-fee USDC transfers are supported" });
      }
      const eventId = `evt_${createHash("sha256").update(`${intent.id}:payment.verified`).digest("hex").slice(0, 32)}`;
      const event = buildPaymentVerifiedEvent({ ...intent, status: "succeeded", buyerAddress: verified.fromAddress,
        transactionHash: hash } as any, { paymentIntentId: intent.id, transactionHash: hash,
        amountAtomic: verified.amountAtomic } as any, eventId);
      try {
        await commitDirectPaymentAndOutbox(getD1Binding(), { paymentIntentId: intent.id, transactionHash: hash,
          fromAddress: verified.fromAddress, toAddress: verified.toAddress, tokenAddress: ARC_USDC_ADDRESS,
          amountAtomic: verified.amountAtomic, chainId: ARC_CHAIN_ID, finalizedAt: new Date(), eventId,
          eventPayload: serializeWebhookEvent(event) });
      } catch {
        const [current] = await db().select().from(paymentIntentsD1).where(eq(paymentIntentsD1.id, intent.id)).limit(1);
        if (current?.status !== "succeeded" || current.transactionHash?.toLowerCase() !== hash) {
          throw new TRPCError({ code: "CONFLICT", message: "Payment settlement conflicted; refresh status" });
        }
      }
      return success();
    }),
    summary: protectedProcedure.query(async ({ ctx }) => {
      const ids = await accountIds(ctx.user);
      if (!ids.length) return { availableUsdc: "0.00", grossUsdc: "0.00", pendingUsdc: "0.00", successfulCount: 0, pendingCount: 0, totalCount: 0 };
      const intents = await db().select().from(paymentIntentsD1).where(inArray(paymentIntentsD1.merchantAccountId, ids));
      const rows = await db().select({ amountAtomic: paymentTransactionsD1.amountAtomic,
        paymentIntentId: paymentTransactionsD1.paymentIntentId }).from(paymentTransactionsD1)
        .innerJoin(paymentIntentsD1, eq(paymentTransactionsD1.paymentIntentId, paymentIntentsD1.id))
        .where(inArray(paymentIntentsD1.merchantAccountId, ids));
      const verified = summarizeVerifiedRows(rows);
      const pending = intents.filter(row => ["requires_payment", "submitted", "verifying"].includes(row.status));
      const pendingAtomic = pending.reduce((sum, row) => sum + BigInt(row.amountAtomic), BigInt(0));
      return { availableUsdc: (Number(verified.totalAtomic) / 1_000_000).toFixed(2),
        grossUsdc: (Number(verified.totalAtomic) / 1_000_000).toFixed(2),
        pendingUsdc: (Number(pendingAtomic) / 1_000_000).toFixed(2), successfulCount: verified.count,
        pendingCount: pending.length, totalCount: intents.length };
    }),
    listIntents: protectedProcedure.query(async ({ ctx }) => {
      const ids = await accountIds(ctx.user);
      return ids.length ? db().select().from(paymentIntentsD1).where(inArray(paymentIntentsD1.merchantAccountId, ids)) : [];
    }),
    verifiedPayments: protectedProcedure.query(async ({ ctx }) => {
      const ids = await accountIds(ctx.user);
      return ids.length ? db().select({ id: paymentTransactionsD1.transactionHash,
        paymentIntentId: paymentTransactionsD1.paymentIntentId, externalOrderId: paymentIntentsD1.externalOrderId,
        itemName: paymentIntentsD1.itemName, buyerLabel: paymentIntentsD1.buyerLabel,
        amountAtomic: paymentTransactionsD1.amountAtomic, transactionHash: paymentTransactionsD1.transactionHash,
        fromAddress: paymentTransactionsD1.fromAddress, toAddress: paymentTransactionsD1.toAddress,
        finalizedAt: paymentTransactionsD1.finalizedAt, createdAt: paymentIntentsD1.createdAt })
        .from(paymentTransactionsD1).innerJoin(paymentIntentsD1, eq(paymentTransactionsD1.paymentIntentId, paymentIntentsD1.id))
        .where(inArray(paymentIntentsD1.merchantAccountId, ids)) : [];
    }),
    sellerIntents: protectedProcedure.input(sellerRoutingInput).query(async ({ input, ctx }) => {
      const account = await seller(input, ctx.user.role === "admin" ? undefined : ctx.user.id);
      return db().select().from(paymentIntentsD1).where(eq(paymentIntentsD1.merchantAccountId, account.id));
    }),
    sellerPayments: protectedProcedure.input(sellerRoutingInput).query(async ({ input, ctx }) => {
      const account = await seller(input, ctx.user.role === "admin" ? undefined : ctx.user.id);
      return db().select({ id: paymentTransactionsD1.transactionHash, paymentIntentId: paymentTransactionsD1.paymentIntentId,
        externalOrderId: paymentIntentsD1.externalOrderId, itemName: paymentIntentsD1.itemName,
        amountAtomic: paymentTransactionsD1.amountAtomic, transactionHash: paymentTransactionsD1.transactionHash,
        fromAddress: paymentTransactionsD1.fromAddress, toAddress: paymentTransactionsD1.toAddress,
        finalizedAt: paymentTransactionsD1.finalizedAt, createdAt: paymentIntentsD1.createdAt,
        merchantAccountId: paymentIntentsD1.merchantAccountId }).from(paymentTransactionsD1)
        .innerJoin(paymentIntentsD1, eq(paymentTransactionsD1.paymentIntentId, paymentIntentsD1.id))
        .where(eq(paymentIntentsD1.merchantAccountId, account.id));
    }),
    sellerSummary: protectedProcedure.input(sellerRoutingInput).query(async ({ input, ctx }) => {
      const account = await seller(input, ctx.user.role === "admin" ? undefined : ctx.user.id);
      const intents = await db().select().from(paymentIntentsD1).where(eq(paymentIntentsD1.merchantAccountId, account.id));
      const txs = await db().select({ amountAtomic: paymentTransactionsD1.amountAtomic,
        paymentIntentId: paymentTransactionsD1.paymentIntentId }).from(paymentTransactionsD1)
        .innerJoin(paymentIntentsD1, eq(paymentTransactionsD1.paymentIntentId, paymentIntentsD1.id))
        .where(eq(paymentIntentsD1.merchantAccountId, account.id));
      const verified = summarizeVerifiedRows(txs);
      const pending = intents.filter(row => ["requires_payment", "submitted", "verifying"].includes(row.status));
      return { merchantAccountId: account.id, marketplaceId: account.marketplaceId, sellerId: account.externalSellerId,
        displayName: account.displayName, receivingAddress: account.receivingAddress,
        availableUsdc: (Number(verified.totalAtomic) / 1_000_000).toFixed(2),
        grossUsdc: (Number(verified.totalAtomic) / 1_000_000).toFixed(2),
        pendingUsdc: (Number(pending.reduce((sum, row) => sum + BigInt(row.amountAtomic), BigInt(0))) / 1_000_000).toFixed(2),
        successfulCount: verified.count, pendingCount: pending.length, totalCount: intents.length };
    }),
    syncArcPayments: protectedProcedure.mutation(unavailable),
    reconcileLegacyIntent: protectedProcedure.mutation(unavailable),
  }),
});
