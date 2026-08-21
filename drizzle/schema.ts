import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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

export const paymentIntents = mysqlTable("paymentIntents", {
  id: varchar("id", { length: 32 }).primaryKey(),
  externalOrderId: varchar("externalOrderId", { length: 128 }).notNull(),
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