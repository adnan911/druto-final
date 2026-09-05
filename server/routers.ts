import { COOKIE_NAME } from "@shared/const";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getAddress, verifyMessage } from "viem";
import { apiKeys, merchantAccounts, paymentIntents, paymentTransactions, users, walletLoginChallenges, webhookDeliveries, webhookEndpoints } from "../drizzle/schema";
import { getDb } from "./db";
import { amountToAtomicUsdc, ARC_CHAIN_ID, ARC_USDC_ADDRESS, verifyArcUsdcTransfer } from "./arc";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { assertIdempotentMatch, assertTransactionOwnership, normalizeMarketplaceReturnUrl } from "./payment-policy";
import { summarizeVerifiedRows } from "./payment-summary";
import { createWebhookSecret, encryptWebhookSecret, isValidWebhookUrl } from "./webhooks";
import { dispatchPaymentVerified, retryWebhookDelivery } from "./webhook-delivery";
import { createApiKeyMaterial, hashApiKey } from "./api-keys";
import { privyOpenId, verifyPrivyToken } from "./privy-auth";
import { sdk } from "./_core/sdk";

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

const LEGACY_DEMO_SELLERS: Record<string, string> = { "druto-labs": "Druto Labs", "mosaic-works": "Mosaic Works", "dawn-studio": "Dawn Studio", "atlas-compute": "Atlas Compute", "meridian-ops": "Meridian Ops" };

function resolveLegacyDemoMerchantAccount(seller: z.infer<typeof sellerRoutingInput>) {
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

async function requireSellerApiKey(db: Awaited<ReturnType<typeof getDb>>, request: { headers?: { authorization?: string | string[] } } | undefined, _seller?: z.infer<typeof sellerRoutingInput>) {
  if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
  const authorization = request?.headers?.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) throw new TRPCError({ code: "UNAUTHORIZED", message: "A Druto seller API key is required" });
  const secret = authorization.slice("Bearer ".length).trim();
  if (!secret) throw new TRPCError({ code: "UNAUTHORIZED", message: "A Druto seller API key is required" });
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.secretHash, hashApiKey(secret))).limit(1);
  if (!key || key.revokedAt) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or revoked Druto API key" });
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
  return key;
}

export const appRouter = router({
  system: systemRouter,
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

        // Check if this wallet is associated with an existing merchant account or user
        const [boundAccount] = await db
          .select()
          .from(merchantAccounts)
          .where(eq(merchantAccounts.receivingAddress, walletAddress))
          .limit(1);

        let targetOpenId = `wallet-${walletAddress.toLowerCase()}`;
        let targetName = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;

        if (boundAccount && boundAccount.ownerUserId !== null) {
          const [ownerUser] = await db
            .select()
            .from(users)
            .where(eq(users.id, boundAccount.ownerUserId))
            .limit(1);
          if (ownerUser) {
            targetOpenId = ownerUser.openId;
            targetName = ownerUser.name || targetName;
          }
        }

        const signedInAt = new Date();
        await db.insert(users).values({
          openId: targetOpenId,
          name: targetName,
          loginMethod: "wallet",
          role: "admin",
          lastSignedIn: signedInAt,
        }).onDuplicateKeyUpdate({
          set: { name: targetName, loginMethod: "wallet", role: "admin", lastSignedIn: signedInAt },
        });

        const token = await sdk.createSessionToken(targetOpenId, { name: targetName });
        ctx.res.cookie(COOKIE_NAME, token, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: 365 * 24 * 60 * 60 * 1000,
        });
        return { authenticated: true, openId: targetOpenId, name: targetName, token, walletAddress } as const;
      }),
    directAccountLogin: publicProcedure.input(z.object({ email: z.string().email().optional(), name: z.string().optional() }).optional()).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const email = input?.email || "operator@druto.xyz";
      const name = input?.name || "Druto Operator";
      const openId = `druto-operator-${email.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
      const signedInAt = new Date();
      await db.insert(users).values({ openId, name, email, loginMethod: "account", role: "admin", lastSignedIn: signedInAt }).onDuplicateKeyUpdate({ set: { name, email, loginMethod: "account", role: "admin", lastSignedIn: signedInAt } });
      const token = await sdk.createSessionToken(openId, { name });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: 365 * 24 * 60 * 60 * 1000 });
      return { authenticated: true, openId, name, token } as const;
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
      await db.insert(users).values({ openId, name, email, loginMethod: "privy", role: "admin", lastSignedIn: signedInAt }).onDuplicateKeyUpdate({ set: { name, email, loginMethod: "privy", role: "admin", lastSignedIn: signedInAt } });
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
        if (existing.ownerUserId && existing.ownerUserId !== ctx.user.id && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "CONFLICT", message: `Seller ID '${input.sellerId}' in marketplace '${input.marketplaceId}' is already registered by another account.` });
        }
        await db.update(merchantAccounts).set({
          displayName: input.displayName,
          receivingAddress: input.receivingAddress,
          ownerUserId: ctx.user.id,
          status: "active",
          updatedAt: new Date(),
        }).where(eq(merchantAccounts.id, existing.id));
        const [updated] = await db.select().from(merchantAccounts).where(eq(merchantAccounts.id, existing.id)).limit(1);
        return updated;
      }
      const id = `ma_${nanoid(12)}`;
      try {
        await db.insert(merchantAccounts).values({ id, marketplaceId: input.marketplaceId, externalSellerId: input.sellerId, ownerUserId: ctx.user.id, displayName: input.displayName, receivingAddress: input.receivingAddress, status: "active" });
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Seller account already exists" });
      }
      const [account] = await db.select().from(merchantAccounts).where(eq(merchantAccounts.id, id)).limit(1);
      return account;
    }),
    registerWebhook: protectedProcedure.input(z.object({ seller: sellerRoutingInput, url: z.string().min(1).max(2048) })).mutation(async ({ input, ctx }) => {
      if (!isValidWebhookUrl(input.url)) throw new TRPCError({ code: "BAD_REQUEST", message: "Webhook URL must use HTTPS (or localhost HTTP for development)" });
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
      return retryWebhookDelivery(db, input.deliveryId);
    }),
    approve: adminProcedure.input(z.object({ merchantAccountId: z.string().min(1).max(32) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [accountBeforeApproval] = await db.select().from(merchantAccounts).where(eq(merchantAccounts.id, input.merchantAccountId)).limit(1);
      if (!accountBeforeApproval) throw new TRPCError({ code: "NOT_FOUND", message: "Merchant account not found" });
      await db.update(merchantAccounts).set({ status: "active" }).where(eq(merchantAccounts.id, input.merchantAccountId));
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
      if (hasApiKey || (input.seller && !resolveLegacyDemoMerchantAccount(input.seller))) {
        await requireSellerApiKey(db, ctx.req, input.seller);
      }
      const merchantAccount = input.seller ? await resolveMerchantAccount(db, input.seller) : null;
      const merchantAddress = merchantAccount?.receivingAddress ?? process.env.ARC_MERCHANT_WALLET_ADDRESS!;
      const [existing] = await db.select().from(paymentIntents).where(eq(paymentIntents.idempotencyKey, idempotencyKey)).limit(1);
      if (existing) {
        try {
          assertIdempotentMatch(existing, { externalOrderId: input.externalOrderId, itemName: input.itemName, amountAtomic });
          if (input.seller && (existing.marketplaceId !== input.seller.marketplaceId || existing.sellerId !== input.seller.sellerId || existing.merchantAccountId !== merchantAccount?.id)) throw new Error("Seller routing mismatch for reused idempotency key");
        } catch (error) { throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Idempotency mismatch" }); }
        const baseUrl = process.env.DRUTO_API_URL || "https://druto-final.vercel.app";
        return { id: existing.id, externalOrderId: existing.externalOrderId, itemName: existing.itemName, buyerLabel: existing.buyerLabel, returnUrl: existing.returnUrl, displayAmount: (Number(existing.amountAtomic) / 1_000_000).toFixed(6), asset: "USDC" as const, network: "arc-testnet" as const, marketplaceId: existing.marketplaceId, sellerId: existing.sellerId, merchantAccountId: existing.merchantAccountId, merchantAddress: existing.merchantAddress, expiresAt: existing.expiresAt, checkoutUrl: `/checkout/${existing.id}`, redirectUrl: `${baseUrl}/checkout/${existing.id}` };
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
      const baseUrl = process.env.DRUTO_API_URL || "https://druto-final.vercel.app";
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
        redirectUrl: `${baseUrl}/checkout/${id}`,
      };
    }),

    reconcileLegacyIntent: protectedProcedure.input(z.object({ intentId: z.string().min(1).max(32).optional(), transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(), seller: sellerRoutingInput }).refine(value => Boolean(value.intentId || value.transactionHash), { message: "Provide a Payment Intent ID or transaction hash" })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const account = await resolveMerchantAccountForOperator(db, input.seller, ctx.user);
      let targetIntentId = input.intentId;
      if (!targetIntentId && input.transactionHash) {
        const [transaction] = await db.select({ paymentIntentId: paymentTransactions.paymentIntentId }).from(paymentTransactions).where(eq(paymentTransactions.transactionHash, input.transactionHash)).limit(1);
        targetIntentId = transaction?.paymentIntentId;
      }
      if (!targetIntentId) throw new TRPCError({ code: "NOT_FOUND", message: "No Payment Intent was found for that transaction" });
      const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, targetIntentId)).limit(1);
      if (!intent) throw new TRPCError({ code: "NOT_FOUND", message: "Payment Intent not found" });
      if (intent.marketplaceId || intent.sellerId || intent.merchantAccountId) throw new TRPCError({ code: "CONFLICT", message: "Payment Intent is already seller-scoped" });
      if (intent.merchantAddress.toLowerCase() !== account.receivingAddress.toLowerCase()) throw new TRPCError({ code: "CONFLICT", message: "Legacy payment destination does not match the active seller wallet" });
      const [transaction] = await db.select().from(paymentTransactions).where(eq(paymentTransactions.paymentIntentId, intent.id)).limit(1);
      if (transaction && transaction.toAddress.toLowerCase() !== account.receivingAddress.toLowerCase()) throw new TRPCError({ code: "CONFLICT", message: "Observed transaction destination does not match the active seller wallet" });
      await db.update(paymentIntents).set({ marketplaceId: account.marketplaceId, sellerId: account.externalSellerId, merchantAccountId: account.id }).where(and(eq(paymentIntents.id, intent.id), isNull(paymentIntents.merchantAccountId)));
      const [updated] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, intent.id)).limit(1);
      return updated;
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

    getIntent: publicProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, input.id)).limit(1);
      if (!intent) throw new TRPCError({ code: "NOT_FOUND", message: "Payment Intent not found" });
      return intent;
    }),

    verifyTransfer: publicProcedure.input(z.object({
      paymentIntentId: z.string().min(1).max(32),
      transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash format"),
    })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });

      const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, input.paymentIntentId)).limit(1);
      if (!intent) throw new TRPCError({ code: "NOT_FOUND", message: "Payment Intent not found" });

      // Check if transaction was already registered to another intent
      const [existingTx] = await db.select().from(paymentTransactions).where(eq(paymentTransactions.transactionHash, input.transactionHash)).limit(1);
      if (existingTx && existingTx.paymentIntentId !== intent.id) {
        throw new TRPCError({ code: "CONFLICT", message: "Transaction hash already associated with a different Payment Intent" });
      }

      if (intent.status === "succeeded" && existingTx) {
        return {
          paymentIntentId: intent.id,
          transactionHash: existingTx.transactionHash,
          fromAddress: existingTx.fromAddress,
          toAddress: existingTx.toAddress,
          amountAtomic: existingTx.amountAtomic,
          status: "succeeded" as const,
        };
      }

      // Mark intent as verifying
      await db.update(paymentIntents).set({
        status: "verifying",
        transactionHash: input.transactionHash,
      }).where(eq(paymentIntents.id, intent.id));

      let verifiedTransfer;
      try {
        verifiedTransfer = await verifyArcUsdcTransfer(
          input.transactionHash as `0x${string}`,
          intent.amountAtomic,
          intent.merchantAddress
        );
      } catch (err: any) {
        await db.update(paymentIntents).set({
          status: "requires_payment",
        }).where(eq(paymentIntents.id, intent.id));
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err?.message || "Arc Testnet transfer verification failed",
        });
      }

      const finalizedAt = new Date();
      if (!existingTx) {
        await db.insert(paymentTransactions).values({
          paymentIntentId: intent.id,
          transactionHash: verifiedTransfer.transactionHash,
          fromAddress: verifiedTransfer.fromAddress,
          toAddress: verifiedTransfer.toAddress,
          tokenAddress: ARC_USDC_ADDRESS,
          amountAtomic: verifiedTransfer.amountAtomic,
          chainId: ARC_CHAIN_ID,
          finalizedAt,
        });
      }

      await db.update(paymentIntents).set({
        status: "succeeded",
        buyerAddress: verifiedTransfer.fromAddress,
        transactionHash: verifiedTransfer.transactionHash,
      }).where(eq(paymentIntents.id, intent.id));

      const [updatedIntent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, intent.id)).limit(1);
      const [finalTx] = await db.select().from(paymentTransactions).where(eq(paymentTransactions.transactionHash, verifiedTransfer.transactionHash)).limit(1);

      if (updatedIntent && finalTx) {
        try {
          await dispatchPaymentVerified(db, updatedIntent, finalTx);
        } catch (err) {
          console.error("[Webhook Dispatch Error]", err);
        }
      }

      return {
        paymentIntentId: intent.id,
        transactionHash: verifiedTransfer.transactionHash,
        fromAddress: verifiedTransfer.fromAddress,
        toAddress: verifiedTransfer.toAddress,
        amountAtomic: verifiedTransfer.amountAtomic,
        status: "succeeded" as const,
      };
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
