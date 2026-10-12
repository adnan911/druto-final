import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Schema for the Cloudflare D1 Testnet Worker.
const nowMs = sql`(unixepoch() * 1000)`;
const date = (name: string) => integer(name, { mode: "timestamp_ms" });

export const usersD1 = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  profileImage: text("profileImage"),
  loginMethod: text("loginMethod"),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  createdAt: date("createdAt").notNull().default(nowMs),
  updatedAt: date("updatedAt").notNull().default(nowMs),
  lastSignedIn: date("lastSignedIn").notNull().default(nowMs),
});

export const dashboardSessionsD1 = sqliteTable("dashboardSessions", {
  tokenHash: text("tokenHash").primaryKey(),
  userId: integer("userId").notNull().references(() => usersD1.id, { onDelete: "cascade" }),
  createdAt: date("createdAt").notNull(),
  expiresAt: date("expiresAt").notNull(),
  revokedAt: date("revokedAt"),
}, table => ({
  userIndex: index("dashboardSessions_user_idx").on(table.userId),
  expiryIndex: index("dashboardSessions_expiry_idx").on(table.expiresAt),
}));

export const apiKeysD1 = sqliteTable("apiKeys", {
  id: text("id").primaryKey(),
  ownerUserId: integer("ownerUserId").notNull(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  lastFour: text("lastFour").notNull(),
  merchantAccountId: text("merchantAccountId"),
  marketplaceId: text("marketplaceId"),
  sellerId: text("sellerId"),
  sellerDisplayName: text("sellerDisplayName"),
  secretHash: text("secretHash").notNull().unique(),
  createdAt: date("createdAt").notNull().default(nowMs),
  lastUsedAt: date("lastUsedAt"),
  revokedAt: date("revokedAt"),
});

export const walletLoginChallengesD1 = sqliteTable("walletLoginChallenges", {
  id: text("id").primaryKey(),
  walletAddress: text("walletAddress").notNull(),
  message: text("message").notNull(),
  nonceHash: text("nonceHash").notNull().unique(),
  expiresAt: date("expiresAt").notNull(),
  usedAt: date("usedAt"),
  createdAt: date("createdAt").notNull().default(nowMs),
});

export const merchantAccountsD1 = sqliteTable("merchantAccounts", {
  id: text("id").primaryKey(),
  marketplaceId: text("marketplaceId").notNull(),
  externalSellerId: text("externalSellerId").notNull(),
  ownerUserId: integer("ownerUserId"),
  displayName: text("displayName").notNull(),
  receivingAddress: text("receivingAddress").notNull(),
  status: text("status", { enum: ["pending", "active", "disabled"] }).notNull().default("pending"),
  walletVerifiedAt: date("walletVerifiedAt"),
  createdAt: date("createdAt").notNull().default(nowMs),
  updatedAt: date("updatedAt").notNull().default(nowMs),
}, table => ({ marketplaceSellerUnique: uniqueIndex("merchantAccounts_marketplace_seller_unique").on(table.marketplaceId, table.externalSellerId) }));

export const ownershipChallengesD1 = sqliteTable("ownershipChallenges", {
  id: text("id").primaryKey(),
  merchantAccountId: text("merchantAccountId").notNull(),
  marketplaceId: text("marketplaceId").notNull(),
  sellerId: text("sellerId").notNull(),
  walletAddress: text("walletAddress").notNull(),
  message: text("message").notNull(),
  nonceHash: text("nonceHash").notNull().unique(),
  expiresAt: date("expiresAt").notNull(),
  usedAt: date("usedAt"),
  createdAt: date("createdAt").notNull().default(nowMs),
}, table => ({ challengeAccountIndex: uniqueIndex("ownershipChallenges_account_created_unique").on(table.merchantAccountId, table.createdAt) }));

export const webhookEndpointsD1 = sqliteTable("webhookEndpoints", {
  id: text("id").primaryKey(),
  marketplaceId: text("marketplaceId").notNull(),
  merchantAccountId: text("merchantAccountId"),
  ownerUserId: integer("ownerUserId").notNull(),
  url: text("url").notNull(),
  // SQLite/D1 has no built-in SHA-256 function. Write this digest in app code.
  urlHash: text("urlHash").notNull(),
  secretCiphertext: text("secretCiphertext").notNull(),
  active: integer("active").notNull().default(1),
  createdAt: date("createdAt").notNull().default(nowMs),
  updatedAt: date("updatedAt").notNull().default(nowMs),
}, table => ({
  endpointOwnerIndex: uniqueIndex("webhookEndpoints_marketplace_url_hash_unique").on(table.marketplaceId, table.urlHash),
  merchantCoverageIndex: index("webhookEndpoints_merchant_active_created_idx").on(table.merchantAccountId, table.active, table.createdAt, table.id),
}));

export const webhookDeliveriesD1 = sqliteTable("webhookDeliveries", {
  id: text("id").primaryKey(),
  endpointId: text("endpointId").notNull(),
  eventId: text("eventId").notNull(),
  eventType: text("eventType").notNull(),
  paymentIntentId: text("paymentIntentId").notNull(),
  payload: text("payload").notNull(),
  signature: text("signature").notNull(),
  status: text("status", { enum: ["pending", "succeeded", "failed"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: date("nextAttemptAt"),
  lastError: text("lastError"),
  deliveredAt: date("deliveredAt"),
  createdAt: date("createdAt").notNull().default(nowMs),
  updatedAt: date("updatedAt").notNull().default(nowMs),
}, table => ({
  eventEndpointUnique: uniqueIndex("webhookDeliveries_endpoint_event_unique").on(table.endpointId, table.eventId),
  paymentCoverageIndex: index("webhookDeliveries_payment_endpoint_type_idx").on(table.paymentIntentId, table.endpointId, table.eventType),
}));

export const paymentIntentsD1 = sqliteTable("paymentIntents", {
  id: text("id").primaryKey(),
  externalOrderId: text("externalOrderId").notNull(),
  marketplaceId: text("marketplaceId"),
  sellerId: text("sellerId"),
  merchantAccountId: text("merchantAccountId"),
  idempotencyKey: text("idempotencyKey").unique(),
  itemName: text("itemName").notNull(),
  buyerLabel: text("buyerLabel"),
  returnUrl: text("returnUrl"),
  orderContext: text("orderContext"),
  amountAtomic: text("amountAtomic").notNull(),
  platformFeeBps: integer("platformFeeBps").notNull().default(0),
  platformFeeAmount: text("platformFeeAmount"),
  merchantPayoutAmount: text("merchantPayoutAmount"),
  splitContractAddress: text("splitContractAddress"),
  asset: text("asset").notNull().default("USDC"),
  network: text("network").notNull().default("arc-testnet"),
  merchantAddress: text("merchantAddress").notNull(),
  buyerAddress: text("buyerAddress"),
  status: text("status", { enum: ["requires_payment", "submitted", "verifying", "succeeded", "failed", "expired"] }).notNull().default("requires_payment"),
  transactionHash: text("transactionHash"),
  expiresAt: date("expiresAt").notNull(),
  createdAt: date("createdAt").notNull().default(nowMs),
  updatedAt: date("updatedAt").notNull().default(nowMs),
}, table => ({
  reconciliationIndex: index("paymentIntents_status_id_updated_idx").on(table.status, table.id, table.updatedAt),
}));

export const paymentTransactionsD1 = sqliteTable("paymentTransactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  paymentIntentId: text("paymentIntentId").notNull().unique(),
  transactionHash: text("transactionHash").notNull().unique(),
  fromAddress: text("fromAddress").notNull(),
  toAddress: text("toAddress").notNull(),
  treasuryAddress: text("treasuryAddress"),
  tokenAddress: text("tokenAddress").notNull(),
  amountAtomic: text("amountAtomic").notNull(),
  platformFeeAmount: text("platformFeeAmount"),
  merchantPayoutAmount: text("merchantPayoutAmount"),
  chainId: integer("chainId").notNull(),
  finalizedAt: date("finalizedAt"),
  createdAt: date("createdAt").notNull().default(nowMs),
});
