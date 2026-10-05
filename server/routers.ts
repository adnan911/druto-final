import { COOKIE_NAME } from "@shared/const";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getAddress, verifyMessage } from "viem";
import { apiKeys, merchantAccounts, paymentIntents, paymentTransactions, users, walletLoginChallenges, webhookDeliveries, webhookEndpoints } from "../drizzle/schema";
import { getDb } from "./db";
import { drutoPublicOrigin } from "./public-origin";
import { amountToAtomicUsdc } from "./arc";

import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { normalizeMarketplaceReturnUrl } from "./payment-policy";
import { parsePaymentAmount } from '../shared/usdc-amount';
import { publicPaymentIntent, privatePaymentIntent, createdPaymentSession } from './payment-intent-view';
import { insertIdempotentIntent } from './payment-idempotency';
import { summarizeVerifiedRows } from "./payment-summary";
import { createWebhookSecret, encryptWebhookSecret, isAllowedWebhookOrigin, isValidWebhookUrl } from "./webhooks";
import { retryWebhookDelivery } from "./webhook-delivery";
import { createApiKeyMaterial, hashApiKey } from "./api-keys";
import { privyOpenId, verifyPrivyToken } from "./privy-auth";
import { sdk } from "./_core/sdk";
import { sellerOwnershipRouter } from "./seller-ownership";
import { settlePayment, paymentVerificationOrigin } from "./payment-settlement";

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
  amount: z.string().max(14).superRefine((value, ctx) => {
    try { parsePaymentAmount(value); }
    catch (error) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : 'Invalid USDC amount' }); }
  }),
  orderContext: z.object({ items: z.array(z.object({ productId: z.string(), name: z.string(), seller: z.string(), unitPrice: z.number().nonnegative(), quantity: z.number().int().positive() })), delivery: z.string(), shippingAddress: z.object({ name: z.string(), line1: z.string(), city: z.string(), postalCode: z.string(), country: z.string() }), buyerEmail: z.string().email() }).optional(),
  seller: sellerRoutingInput.optional(),
});

const LEGACY_DEMO_SELLERS: Record<string, string> = { "druto-labs": "Druto Labs", "mosaic-works": "Mosaic Works", "dawn-studio": "Dawn Studio", "atlas-compute": "Atlas Compute", "meridian-ops": "Meridian Ops" };

function resolveLegacyDemoMerchantAccount(seller: z.infer<typeof sellerRoutingInput>) {
  if (process.env.NODE_ENV === "production" || process.env.DRUTO_RUNTIME === "cloudflare") return null;
  if (seller.marketplaceId !== "druto-demo-marketplace" || !LEGACY_DEMO_SELLERS[seller.sellerId]) return null;
  // Compatibility only: catalog sellers share the configured demo wallet until each seller completes real onboarding.
  return { id: `legacy-demo-${seller.sellerId}`, marketplaceId: seller.marketplaceId, externalSellerId: seller.sellerId, displayName: LEGACY_DEMO_SELLERS[seller.sellerId], receivingAddress: process.env.ARC_MERCHANT_WALLET_ADDRESS!, ownerUserId: undefined, status: "active" as const };
}

async function resolveMerchantAccount(db: Awaited<ReturnType<typeof getDb>>, seller: z.infer<typeof sellerRoutingInput>, options: { allowPending?: boolean } = {}) {
  if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
  const [account] = seller.merchantAccountId
    ? await db.select().from(merchantAccounts).where(eq(merchantAccounts.id, seller.merchantAccountId)).limit(1)
    : await db.select().from(merchantAccounts).where(and(eq(merchantAccounts.marketplaceId, seller.marketplaceId), eq(merchantAccounts.externalSellerId, seller.sellerId))).limit(1);
  const legacyDemoAccount = resolveLegacyDemoMerchantAccount(seller);
  if (!account && legacyDemoAccount) return legacyDemoAccount;
  if (!account || (!options.allowPending && account.status !== "active")) throw new TRPCError({ code: "NOT_FOUND", message: "Seller is not onboarded or active in Druto" });
  if (account.marketplaceId !== seller.marketplaceId || account.externalSellerId !== seller.sellerId) throw new TRPCError({ code: "CONFLICT", message: "Seller routing identifiers do not match the merchant account" });
  return account;
}

async function resolveMerchantAccountForOperator(db: Awaited<ReturnType<typeof getDb>>, seller: z.infer<typeof sellerRoutingInput>, user: { id: number; role: "admin" | "user" }, options: { allowPending?: boolean } = {}) {
  const account = await resolveMerchantAccount(db, seller, options);
  if (account.id.startsWith("legacy-demo-")) return account;
  if (user.role !== "admin" && account.ownerUserId !== user.id) throw new TRPCError({ code: "FORBIDDEN", message: "You are not authorized to view this seller account" });
  return account;
}

async function getOperatorMerchantAccountIds(db: Awaited<ReturnType<typeof getDb>>, user: { id: number; role: "admin" | "user" }) {
  if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
  const accounts = user.role === "admin"
    ? await db.select({ id: merchantAccounts.id }).from(merchantAccounts)
    : await db.select({ id: merchantAccounts.id }).from(merchantAccounts).where(eq(merchantAccounts.ownerUserId, user.id));
  return accounts.map(account => account.id);
}

function filterMerchantRows<T extends { merchantAccountId?: string | null }>(rows: T[], merchantAccountId: string) {
  return rows.filter(row => row.merchantAccountId === merchantAccountId);
}

async function requireSellerApiKey(db: Awaited<ReturnType<typeof getDb>>, request: { headers?: { authorization?: string | string[] } } | undefined, seller?: z.infer<typeof sellerRoutingInput>) {
  if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
  const authorization = request?.headers?.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) throw new TRPCError({ code: "UNAUTHORIZED", message: "A Druto seller API key is required" });
  const secret = authorization.slice("Bearer ".length).trim();
  if (!secret) throw new TRPCError({ code: "UNAUTHORIZED", message: "A Druto seller API key is required" });
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.secretHash, hashApiKey(secret))).limit(1);
  if (!key || key.revokedAt) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or revoked Druto API key" });
  if (!seller || !key.merchantAccountId || key.marketplaceId !== seller.marketplaceId || key.sellerId !== seller.sellerId || (seller.merchantAccountId && seller.merchantAccountId !== key.merchantAccountId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "API key is not authorized for this seller" });
  }
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
  return key;
}

export const appRouter = router({
  system: systemRouter,
  sellerOwnership: sellerOwnershipRouter,
  apiKeys: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      return db.select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, lastFour: apiKeys.lastFour, merchantAccountId: apiKeys.merchantAccountId, marketplaceId: apiKeys.marketplaceId, sellerId: apiKeys.sellerId, sellerDisplayName: apiKeys.sellerDisplayName, createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt }).from(apiKeys).where(eq(apiKeys.ownerUserId, ctx.user.id));
    }),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(120), merchantAccountId: z.string().min(1).max(32).optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      let account: typeof merchantAccounts.$inferSelect | undefined;
      if (input.merchantAccountId) {
        const [candidate] = await db.select().from(merchantAccounts).where(eq(merchantAccounts.id, input.merchantAccountId)).limit(1);
        if (!candidate || (ctx.user.role !== "admin" && candidate.ownerUserId !== ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN", message: "You are not authorized to link this API key to the seller account" });
        account = candidate;
      }
      const material = createApiKeyMaterial(input.name);
      await db.insert(apiKeys).values({ id: material.id, ownerUserId: ctx.user.id, name: material.name, prefix: material.prefix, lastFour: material.lastFour, merchantAccountId: account?.id, marketplaceId: account?.marketplaceId, sellerId: account?.externalSellerId, sellerDisplayName: account?.displayName, secretHash: material.secretHash });
      return { id: material.id, name: material.name, prefix: material.prefix, lastFour: material.lastFour, merchantAccountId: account?.id ?? null, marketplaceId: account?.marketplaceId ?? null, sellerId: account?.externalSellerId ?? null, sellerDisplayName: account?.displayName ?? null, secret: material.secret };
    }),
    revoke: protectedProcedure.input(z.object({ id: z.string().min(1).max(32) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const result = await db.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, input.id), eq(apiKeys.ownerUserId, ctx.user.id), isNull(apiKeys.revokedAt)));
      const affectedRows = Number((result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0);
      if (affectedRows !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Active API key not found" });
      return { success: true as const };
    }),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    createWalletChallenge: publicProcedure
      .input(z.object({ walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM wallet address") }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
        const walletAddress = getAddress(input.walletAddress);
        const challengeId = `wch_${nanoid(12)}`;
        const nonce = nanoid(24);
        const issuedAt = new Date();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        const message = `Sign in to Druto Platform\n\nWallet: ${walletAddress}\nNonce: ${nonce}\nIssued At: ${issuedAt.toISOString()}`;
        const nonceHash = createHash("sha256").update(nonce).digest("hex");
        await db.insert(walletLoginChallenges).values({
          id: challengeId,
          walletAddress,
          message,
          nonceHash,
          expiresAt,
        });
        return { challengeId, message, expiresAt };
      }),
    verifyWalletLogin: publicProcedure
      .input(z.object({
        challengeId: z.string().min(1).max(32),
        walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
        const walletAddress = getAddress(input.walletAddress);
        const [challenge] = await db
          .select()
          .from(walletLoginChallenges)
          .where(eq(walletLoginChallenges.id, input.challengeId))
          .limit(1);
        if (!challenge) throw new TRPCError({ code: "NOT_FOUND", message: "Login challenge not found" });
        if (challenge.usedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Login challenge already used" });
        if (new Date() > new Date(challenge.expiresAt)) throw new TRPCError({ code: "BAD_REQUEST", message: "Login challenge expired" });
        if (challenge.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Challenge wallet mismatch" });
        }

        let isValid = false;
        try {
          isValid = await verifyMessage({
            address: walletAddress,
            message: challenge.message,
            signature: input.signature as `0x${string}`,
          });
        } catch (err) {
          console.error("[Wallet Verify Error]", err);
          isValid = false;
        }

        if (!isValid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid wallet signature" });
        }

        await db.update(walletLoginChallenges).set({ usedAt: new Date() }).where(eq(walletLoginChallenges.id, challenge.id));

        // A payout address is not proof of another account's identity.
        const targetOpenId = `wallet-${walletAddress.toLowerCase()}`;
        const targetName = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;

        const signedInAt = new Date();
        await db.insert(users).values({
          openId: targetOpenId,
          name: targetName,
          loginMethod: "wallet",
          role: "user",
          lastSignedIn: signedInAt,
        }).onDuplicateKeyUpdate({
          set: { name: targetName, loginMethod: "wallet", role: "user", lastSignedIn: signedInAt },
        });

        const token = await sdk.createSessionToken(targetOpenId, { name: targetName });
        ctx.res.cookie(COOKIE_NAME, token, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: 365 * 24 * 60 * 60 * 1000,
        });
        return { authenticated: true, openId: targetOpenId, name: targetName, token, walletAddress } as const;
      }),
    privyLogin: publicProcedure.input(z.object({
      accessToken: z.string().min(20).max(4096),
      email: z.string().email().optional(),
      name: z.string().optional(),
      walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
    })).mutation(async ({ input, ctx }) => {
      let verified;
      try { verified = await verifyPrivyToken(input.accessToken); } catch { throw new TRPCError({ code: "UNAUTHORIZED", message: "Privy authentication could not be verified" }); }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const openId = privyOpenId(verified.user_id);
      const email = input.email;
      const name = input.name || (email ? email.split("@")[0] : "Privy workspace");
      const signedInAt = new Date();
      await db.insert(users).values({ openId, name, email, loginMethod: "privy", role: "user", lastSignedIn: signedInAt }).onDuplicateKeyUpdate({ set: { name, email, loginMethod: "privy", role: "user", lastSignedIn: signedInAt } });
      const token = await sdk.createSessionToken(openId, { name });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: 365 * 24 * 60 * 60 * 1000 });
      return { authenticated: true, openId, name } as const;
    }),
    bindWallet: protectedProcedure
      .input(z.object({
        challengeId: z.string().min(1).max(32),
        walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
        const walletAddress = getAddress(input.walletAddress);
        const [challenge] = await db
          .select()
          .from(walletLoginChallenges)
          .where(eq(walletLoginChallenges.id, input.challengeId))
          .limit(1);
        if (!challenge) throw new TRPCError({ code: "NOT_FOUND", message: "Challenge not found" });
        if (challenge.usedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Challenge already used" });
        if (new Date() > new Date(challenge.expiresAt)) throw new TRPCError({ code: "BAD_REQUEST", message: "Challenge expired" });
        if (challenge.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Wallet mismatch" });
        }

        const isValid = await verifyMessage({
          address: walletAddress,
          message: challenge.message,
          signature: input.signature as `0x${string}`,
        }).catch(() => false);

        if (!isValid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid wallet signature" });

        await db.update(walletLoginChallenges).set({ usedAt: new Date() }).where(eq(walletLoginChallenges.id, challenge.id));

        const updatedName = ctx.user.name && !ctx.user.name.startsWith("0x")
          ? `${ctx.user.name} (${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)})`
          : `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`;

        await db.update(users).set({
          name: updatedName,
          updatedAt: new Date(),
        }).where(eq(users.id, ctx.user.id));

        return { success: true, walletAddress, name: updatedName };
      }),
    updateProfile: protectedProcedure
      .input(z.object({
        name: z.string().optional(),
        profileImage: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
        
        await db.update(users).set({
          name: input.name ?? ctx.user.name,
          profileImage: input.profileImage ?? ctx.user.profileImage,
          updatedAt: new Date(),
        }).where(eq(users.id, ctx.user.id));
        
        const [updatedUser] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
        return updatedUser;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  merchantAccounts: router({
    listMine: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const accounts = ctx.user.role === "admin"
        ? await db.select().from(merchantAccounts)
        : await db.select().from(merchantAccounts).where(eq(merchantAccounts.ownerUserId, ctx.user.id));
      const accountIds = accounts.map(account => account.id);
      const webhooks = accountIds.length
        ? await db.select({ id: webhookEndpoints.id, merchantAccountId: webhookEndpoints.merchantAccountId, url: webhookEndpoints.url, active: webhookEndpoints.active, createdAt: webhookEndpoints.createdAt, updatedAt: webhookEndpoints.updatedAt }).from(webhookEndpoints).where(inArray(webhookEndpoints.merchantAccountId, accountIds))
        : [];
      return { accounts, webhooks };
    }),
    register: protectedProcedure.input(z.object({ marketplaceId: z.string().min(1).max(128), sellerId: z.string().min(1).max(128), displayName: z.string().min(1).max(255), receivingAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [existing] = await db.select().from(merchantAccounts).where(and(eq(merchantAccounts.marketplaceId, input.marketplaceId), eq(merchantAccounts.externalSellerId, input.sellerId))).limit(1);
      if (existing) {
        if (existing.ownerUserId !== ctx.user.id) {
          throw new TRPCError({ code: "CONFLICT", message: `Seller ID '${input.sellerId}' in marketplace '${input.marketplaceId}' is already registered by another account.` });
        }
        if (existing.status === "disabled") throw new TRPCError({ code: "FORBIDDEN", message: "Disabled seller requires operator review" });
        if (existing.receivingAddress.toLowerCase() !== input.receivingAddress.toLowerCase()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Receiving-wallet changes require a separate verified change process" });
        const result = await db.update(merchantAccounts).set({
          displayName: input.displayName,
          status: existing.walletVerifiedAt ? existing.status : "pending",
          updatedAt: new Date(),
        }).where(and(eq(merchantAccounts.id, existing.id), eq(merchantAccounts.ownerUserId, ctx.user.id), eq(merchantAccounts.status, existing.status), eq(merchantAccounts.receivingAddress, existing.receivingAddress)));
        if (Number((result as any)[0]?.affectedRows) !== 1) throw new TRPCError({ code: "CONFLICT", message: "Seller state changed; refresh before updating" });
        const [updated] = await db.select().from(merchantAccounts).where(eq(merchantAccounts.id, existing.id)).limit(1);
        return updated;
      }
      const id = `ma_${nanoid(12)}`;
      try {
        await db.insert(merchantAccounts).values({ id, marketplaceId: input.marketplaceId, externalSellerId: input.sellerId, ownerUserId: ctx.user.id, displayName: input.displayName, receivingAddress: getAddress(input.receivingAddress), status: "pending" });
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Seller account already exists" });
      }
      const [account] = await db.select().from(merchantAccounts).where(eq(merchantAccounts.id, id)).limit(1);
      return account;
    }),
    registerWebhook: protectedProcedure.input(z.object({ seller: sellerRoutingInput, url: z.string().min(1).max(2048) })).mutation(async ({ input, ctx }) => {
      if (!isValidWebhookUrl(input.url)) throw new TRPCError({ code: "BAD_REQUEST", message: "Webhook URL must use HTTPS with a DNS hostname and no credentials or fragment" });
      if (!isAllowedWebhookOrigin(input.url)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Webhook origin is not enabled by the operator" });
      const db = await getDb();
      const account = await resolveMerchantAccountForOperator(db, input.seller, ctx.user, { allowPending: true });
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
      return retryWebhookDelivery(db, input.deliveryId, new Date(), true);
    }),
    approve: adminProcedure.input(z.object({ merchantAccountId: z.string().min(1).max(32) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [accountBeforeApproval] = await db.select().from(merchantAccounts).where(eq(merchantAccounts.id, input.merchantAccountId)).limit(1);
      if (!accountBeforeApproval) throw new TRPCError({ code: "NOT_FOUND", message: "Merchant account not found" });
      if (!accountBeforeApproval.walletVerifiedAt) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Receiving-wallet ownership must be verified before approval" });
      await db.update(merchantAccounts).set({ status: "active" }).where(and(eq(merchantAccounts.id, input.merchantAccountId), eq(merchantAccounts.receivingAddress, accountBeforeApproval.receivingAddress), eq(merchantAccounts.walletVerifiedAt, accountBeforeApproval.walletVerifiedAt)));
      const [account] = await db.select().from(merchantAccounts).where(eq(merchantAccounts.id, input.merchantAccountId)).limit(1);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Merchant account not found" });
      return account;
    }),
  }),

  payments: router({
    createIntent: publicProcedure.input(paymentInput).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const idempotencyKey = input.idempotencyKey ?? input.externalOrderId;
      const amountAtomic = amountToAtomicUsdc(input.amount);
      const orderContext = input.orderContext ? JSON.stringify(input.orderContext) : null;
      const returnUrl = normalizeMarketplaceReturnUrl(input.returnUrl);
      const authorization = ctx.req?.headers?.authorization;
      const hasApiKey = typeof authorization === "string" && authorization.startsWith("Bearer ");
      if ((process.env.NODE_ENV === "production" || process.env.DRUTO_RUNTIME === "cloudflare") && !input.seller) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A verified seller is required" });
      }
      if (process.env.NODE_ENV === "production" || process.env.DRUTO_RUNTIME === "cloudflare" || hasApiKey || (input.seller && !resolveLegacyDemoMerchantAccount(input.seller))) {
        const key = await requireSellerApiKey(db, ctx.req, input.seller);
        input.seller = { ...input.seller!, merchantAccountId: key.merchantAccountId! };
      }
      const merchantAccount = input.seller ? await resolveMerchantAccount(db, input.seller) : null;
      if (merchantAccount && !merchantAccount.id.startsWith("legacy-demo-") && !("walletVerifiedAt" in merchantAccount && merchantAccount.walletVerifiedAt)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Seller receiving wallet is not verified" });
      let merchantAddress: string;
      try { merchantAddress = getAddress(merchantAccount?.receivingAddress ?? process.env.ARC_MERCHANT_WALLET_ADDRESS ?? ''); }
      catch { throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Receiving wallet configuration is invalid' }); }
      const id = `pi_${nanoid(12)}`;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      // MVP settlement sends the entire payment directly to the seller wallet.
      const platformFeeBps = 0;
      const platformFeeAmount = "0";
      const merchantPayoutAmount = amountAtomic;

      const saved = await insertIdempotentIntent(db, idempotencyKey, {
        id,
        externalOrderId: input.externalOrderId,
        marketplaceId: merchantAccount?.marketplaceId ?? null,
        sellerId: merchantAccount?.externalSellerId ?? null,
        merchantAccountId: merchantAccount?.id ?? null,
        idempotencyKey,
        itemName: input.itemName,
        buyerLabel: input.buyerLabel ?? null,
        returnUrl,
        orderContext,
        amountAtomic,
        platformFeeBps,
        platformFeeAmount,
        merchantPayoutAmount,
        splitContractAddress: null,
        asset: "USDC",
        network: "arc-testnet",
        merchantAddress,
        status: "requires_payment",
        expiresAt,
        buyerAddress: null,
        transactionHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const baseUrl = drutoPublicOrigin();
      return createdPaymentSession(saved, baseUrl);
    }),

    reconcileLegacyIntent: protectedProcedure.input(z.object({ intentId: z.string().min(1).max(32).optional(), transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(), seller: sellerRoutingInput }).refine(value => Boolean(value.intentId || value.transactionHash), { message: "Provide a Payment Intent ID or transaction hash" })).mutation(async ({ input, ctx }) => {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Legacy payment reassignment is disabled pending verified order attribution" });
    }),
    listIntents: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      if (ctx.user.role === "admin") {
        return db.select().from(paymentIntents);
      }
      const accountIds = await getOperatorMerchantAccountIds(db, ctx.user);
      if (!accountIds.length) return [];
      return db.select().from(paymentIntents).where(inArray(paymentIntents.merchantAccountId, accountIds));
    }),

    verifiedPayments: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      if (ctx.user.role === "admin") {
        return db.select({ id: paymentTransactions.transactionHash, paymentIntentId: paymentTransactions.paymentIntentId, externalOrderId: paymentIntents.externalOrderId, itemName: paymentIntents.itemName, buyerLabel: paymentIntents.buyerLabel, amountAtomic: paymentTransactions.amountAtomic, transactionHash: paymentTransactions.transactionHash, fromAddress: paymentTransactions.fromAddress, toAddress: paymentTransactions.toAddress, finalizedAt: paymentTransactions.finalizedAt, createdAt: paymentIntents.createdAt }).from(paymentTransactions).innerJoin(paymentIntents, eq(paymentTransactions.paymentIntentId, paymentIntents.id));
      }
      const accountIds = await getOperatorMerchantAccountIds(db, ctx.user);
      if (!accountIds.length) return [];
      return db.select({ id: paymentTransactions.transactionHash, paymentIntentId: paymentTransactions.paymentIntentId, externalOrderId: paymentIntents.externalOrderId, itemName: paymentIntents.itemName, buyerLabel: paymentIntents.buyerLabel, amountAtomic: paymentTransactions.amountAtomic, transactionHash: paymentTransactions.transactionHash, fromAddress: paymentTransactions.fromAddress, toAddress: paymentTransactions.toAddress, finalizedAt: paymentTransactions.finalizedAt, createdAt: paymentIntents.createdAt }).from(paymentTransactions).innerJoin(paymentIntents, eq(paymentTransactions.paymentIntentId, paymentIntents.id)).where(inArray(paymentIntents.merchantAccountId, accountIds));
    }),

    summary: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      let intents, verifiedRows;
      if (ctx.user.role === "admin") {
        intents = await db.select().from(paymentIntents);
        verifiedRows = await db.select({ amountAtomic: paymentTransactions.amountAtomic, paymentIntentId: paymentTransactions.paymentIntentId }).from(paymentTransactions).innerJoin(paymentIntents, eq(paymentTransactions.paymentIntentId, paymentIntents.id));
      } else {
        const accountIds = await getOperatorMerchantAccountIds(db, ctx.user);
        if (!accountIds.length) return { availableUsdc: "0.00", grossUsdc: "0.00", pendingUsdc: "0.00", successfulCount: 0, pendingCount: 0, totalCount: 0 };
        intents = await db.select().from(paymentIntents).where(inArray(paymentIntents.merchantAccountId, accountIds));
        verifiedRows = await db.select({ amountAtomic: paymentTransactions.amountAtomic, paymentIntentId: paymentTransactions.paymentIntentId }).from(paymentTransactions).innerJoin(paymentIntents, eq(paymentTransactions.paymentIntentId, paymentIntents.id)).where(inArray(paymentIntents.merchantAccountId, accountIds));
      }
      const pending = intents.filter(intent => intent.status === "requires_payment" || intent.status === "submitted" || intent.status === "verifying");
      const verifiedSummary = summarizeVerifiedRows(verifiedRows);
      const pendingAtomic = pending.reduce((sum, intent) => sum + BigInt(intent.amountAtomic), BigInt(0));
      return { availableUsdc: (Number(verifiedSummary.totalAtomic) / 1_000_000).toFixed(2), grossUsdc: (Number(verifiedSummary.totalAtomic) / 1_000_000).toFixed(2), pendingUsdc: (Number(pendingAtomic) / 1_000_000).toFixed(2), successfulCount: verifiedSummary.count, pendingCount: pending.length, totalCount: intents.length };
    }),

    getIntent: publicProcedure.input(z.object({ id: z.string().min(1).max(32) })).query(async ({ input, ctx }) => {
      ctx.res?.setHeader?.('Cache-Control', 'private, no-store');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, input.id)).limit(1);
      if (!intent || intent.id !== input.id) throw new TRPCError({ code: "NOT_FOUND", message: "Payment Intent not found" });
      return publicPaymentIntent(intent, paymentVerificationOrigin());
    }),
    getPrivateIntent: protectedProcedure.input(z.object({ id: z.string().min(1).max(32) })).query(async ({ input, ctx }) => {
      ctx.res?.setHeader?.('Cache-Control', 'private, no-store');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, input.id)).limit(1);
      if (!intent || intent.id !== input.id) throw new TRPCError({ code: "NOT_FOUND", message: "Payment Intent not found" });
      if (ctx.user.role !== 'admin') {
        if (!intent.merchantAccountId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment Intent not found' });
        const [account] = await db.select().from(merchantAccounts).where(eq(merchantAccounts.id, intent.merchantAccountId)).limit(1);
        if (!account || account.id !== intent.merchantAccountId || account.ownerUserId !== ctx.user.id) throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment Intent not found' });
      }
      return privatePaymentIntent(intent, paymentVerificationOrigin());
    }),

    verifyTransfer: publicProcedure.input(z.object({
      paymentIntentId: z.string().min(1).max(32),
      transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash format"),
      payerSignature: z.string().regex(/^0x[a-fA-F0-9]+$/).max(2048).optional(),
    })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED" });
      return settlePayment(db, input);
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

    syncArcPayments: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED" });
      const ids = await getOperatorMerchantAccountIds(db, ctx.user);
      const intents = ids.length ? await db.select().from(paymentIntents).where(inArray(paymentIntents.merchantAccountId, ids)) : [];
      // Only explicit transaction references are candidates; amount matching is never attribution.
      const candidates = intents.filter(i => i.transactionHash && i.status !== "succeeded").slice(0, 10);
      let newlySynced = 0;
      let needsReview = 0;
      for (const intent of candidates) {
        try { await settlePayment(db, { paymentIntentId: intent.id, transactionHash: intent.transactionHash! }); newlySynced++; }
        catch { needsReview++; }
      }
      return { success: true, scannedCount: candidates.length, newlySynced, needsReview, lastSyncedAt: new Date().toISOString() };
    }),
  }),
});

export type AppRouter = typeof appRouter;
