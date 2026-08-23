import { int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const merchantAccounts = mysqlTable("merchantAccounts", {
  id: varchar("id", { length: 32 }).primaryKey(),
  marketplaceId: varchar("marketplaceId", { length: 128 }).notNull(),
  externalSellerId: varchar("externalSellerId", { length: 128 }).notNull(),
  ownerUserId: int("ownerUserId"),
  displayName: varchar("displayName", { length: 255 }).notNull(),
  receivingAddress: varchar("receivingAddress", { length: 42 }).notNull(),
  status: mysqlEnum("status", ["pending", "active", "disabled"]).notNull().default("pending"),
  walletVerifiedAt: timestamp("walletVerifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({ marketplaceSellerUnique: uniqueIndex("merchantAccounts_marketplace_seller_unique").on(table.marketplaceId, table.externalSellerId) }));

export type MerchantAccount = typeof merchantAccounts.$inferSelect;
export type InsertMerchantAccount = typeof merchantAccounts.$inferInsert;

export const ownershipChallenges = mysqlTable("ownershipChallenges", {
  id: varchar("id", { length: 32 }).primaryKey(),
  merchantAccountId: varchar("merchantAccountId", { length: 32 }).notNull(),
  marketplaceId: varchar("marketplaceId", { length: 128 }).notNull(),
  sellerId: varchar("sellerId", { length: 128 }).notNull(),
  walletAddress: varchar("walletAddress", { length: 42 }).notNull(),
  message: text("message").notNull(),
  nonceHash: varchar("nonceHash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ challengeAccountIndex: uniqueIndex("ownershipChallenges_account_created_unique").on(table.merchantAccountId, table.createdAt) }));

export type OwnershipChallenge = typeof ownershipChallenges.$inferSelect;
export type InsertOwnershipChallenge = typeof ownershipChallenges.$inferInsert;

export const webhookEndpoints = mysqlTable("webhookEndpoints", {
  id: varchar("id", { length: 32 }).primaryKey(),
  marketplaceId: varchar("marketplaceId", { length: 128 }).notNull(),
  merchantAccountId: varchar("merchantAccountId", { length: 32 }),
  ownerUserId: int("ownerUserId").notNull(),
  url: varchar("url", { length: 2048 }).notNull(),
  secretCiphertext: text("secretCiphertext").notNull(),
  active: int("active").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({ endpointOwnerIndex: uniqueIndex("webhookEndpoints_marketplace_url_unique").on(table.marketplaceId, table.url) }));

export const webhookDeliveries = mysqlTable("webhookDeliveries", {
  id: varchar("id", { length: 32 }).primaryKey(),
  endpointId: varchar("endpointId", { length: 32 }).notNull(),
  eventId: varchar("eventId", { length: 64 }).notNull(),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  paymentIntentId: varchar("paymentIntentId", { length: 32 }).notNull(),
  payload: text("payload").notNull(),
  signature: varchar("signature", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["pending", "succeeded", "failed"]).notNull().default("pending"),
  attempts: int("attempts").notNull().default(0),
  nextAttemptAt: timestamp("nextAttemptAt"),
  lastError: text("lastError"),
  deliveredAt: timestamp("deliveredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({ eventEndpointUnique: uniqueIndex("webhookDeliveries_endpoint_event_unique").on(table.endpointId, table.eventId) }));

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type InsertWebhookEndpoint = typeof webhookEndpoints.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type InsertWebhookDelivery = typeof webhookDeliveries.$inferInsert;

export const paymentIntents = mysqlTable("paymentIntents", {
  id: varchar("id", { length: 32 }).primaryKey(),
  externalOrderId: varchar("externalOrderId", { length: 128 }).notNull(),
  marketplaceId: varchar("marketplaceId", { length: 128 }),
  sellerId: varchar("sellerId", { length: 128 }),
  merchantAccountId: varchar("merchantAccountId", { length: 32 }),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).unique(),
  itemName: varchar("itemName", { length: 255 }).notNull(),
  buyerLabel: varchar("buyerLabel", { length: 255 }),
  returnUrl: varchar("returnUrl", { length: 2048 }),
  orderContext: text("orderContext"),
  amountAtomic: varchar("amountAtomic", { length: 64 }).notNull(),
  asset: varchar("asset", { length: 16 }).notNull().default("USDC"),
  network: varchar("network", { length: 32 }).notNull().default("arc-testnet"),
  merchantAddress: varchar("merchantAddress", { length: 42 }).notNull(),
  buyerAddress: varchar("buyerAddress", { length: 42 }),
  status: mysqlEnum("status", ["requires_payment", "submitted", "verifying", "succeeded", "failed", "expired"]).notNull().default("requires_payment"),
  transactionHash: varchar("transactionHash", { length: 66 }),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const paymentTransactions = mysqlTable("paymentTransactions", {
  id: int("id").autoincrement().primaryKey(),
  paymentIntentId: varchar("paymentIntentId", { length: 32 }).notNull(),
  transactionHash: varchar("transactionHash", { length: 66 }).notNull().unique(),
  fromAddress: varchar("fromAddress", { length: 42 }).notNull(),
  toAddress: varchar("toAddress", { length: 42 }).notNull(),
  tokenAddress: varchar("tokenAddress", { length: 42 }).notNull(),
  amountAtomic: varchar("amountAtomic", { length: 64 }).notNull(),
  chainId: int("chainId").notNull(),
  finalizedAt: timestamp("finalizedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PaymentIntent = typeof paymentIntents.$inferSelect;
export type InsertPaymentIntent = typeof paymentIntents.$inferInsert;
export type PaymentTransaction = typeof paymentTransactions.$inferSelect;
export type InsertPaymentTransaction = typeof paymentTransactions.$inferInsert;