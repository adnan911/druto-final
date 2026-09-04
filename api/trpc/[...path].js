// api/trpc/[...path].src.ts
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import * as cookieModule from "cookie";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/routers.ts
import { and as and2, eq as eq3, inArray, isNull } from "drizzle-orm";
import { createHash as createHash4 } from "node:crypto";
import { nanoid as nanoid2 } from "nanoid";
import { z as z2 } from "zod";
import { getAddress as getAddress2, verifyMessage } from "viem";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  profileImage: text("profileImage"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var apiKeys = mysqlTable("apiKeys", {
  id: varchar("id", { length: 32 }).primaryKey(),
  ownerUserId: int("ownerUserId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  prefix: varchar("prefix", { length: 32 }).notNull(),
  lastFour: varchar("lastFour", { length: 4 }).notNull(),
  merchantAccountId: varchar("merchantAccountId", { length: 32 }),
  marketplaceId: varchar("marketplaceId", { length: 128 }),
  sellerId: varchar("sellerId", { length: 128 }),
  sellerDisplayName: varchar("sellerDisplayName", { length: 255 }),
  secretHash: varchar("secretHash", { length: 64 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
  revokedAt: timestamp("revokedAt")
}, (table) => ({ ownerCreatedIndex: uniqueIndex("apiKeys_owner_created_unique").on(table.ownerUserId, table.createdAt) }));
var walletLoginChallenges = mysqlTable("walletLoginChallenges", {
  id: varchar("id", { length: 32 }).primaryKey(),
  walletAddress: varchar("walletAddress", { length: 42 }).notNull(),
  message: text("message").notNull(),
  nonceHash: varchar("nonceHash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var merchantAccounts = mysqlTable("merchantAccounts", {
  id: varchar("id", { length: 32 }).primaryKey(),
  marketplaceId: varchar("marketplaceId", { length: 128 }).notNull(),
  externalSellerId: varchar("externalSellerId", { length: 128 }).notNull(),
  ownerUserId: int("ownerUserId"),
  displayName: varchar("displayName", { length: 255 }).notNull(),
  receivingAddress: varchar("receivingAddress", { length: 42 }).notNull(),
  status: mysqlEnum("status", ["pending", "active", "disabled"]).notNull().default("pending"),
  walletVerifiedAt: timestamp("walletVerifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => ({ marketplaceSellerUnique: uniqueIndex("merchantAccounts_marketplace_seller_unique").on(table.marketplaceId, table.externalSellerId) }));
var ownershipChallenges = mysqlTable("ownershipChallenges", {
  id: varchar("id", { length: 32 }).primaryKey(),
  merchantAccountId: varchar("merchantAccountId", { length: 32 }).notNull(),
  marketplaceId: varchar("marketplaceId", { length: 128 }).notNull(),
  sellerId: varchar("sellerId", { length: 128 }).notNull(),
  walletAddress: varchar("walletAddress", { length: 42 }).notNull(),
  message: text("message").notNull(),
  nonceHash: varchar("nonceHash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => ({ challengeAccountIndex: uniqueIndex("ownershipChallenges_account_created_unique").on(table.merchantAccountId, table.createdAt) }));
var webhookEndpoints = mysqlTable("webhookEndpoints", {
  id: varchar("id", { length: 32 }).primaryKey(),
  marketplaceId: varchar("marketplaceId", { length: 128 }).notNull(),
  merchantAccountId: varchar("merchantAccountId", { length: 32 }),
  ownerUserId: int("ownerUserId").notNull(),
  url: varchar("url", { length: 2048 }).notNull(),
  secretCiphertext: text("secretCiphertext").notNull(),
  active: int("active").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => ({ endpointOwnerIndex: uniqueIndex("webhookEndpoints_marketplace_url_unique").on(table.marketplaceId, table.url) }));
var webhookDeliveries = mysqlTable("webhookDeliveries", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => ({ eventEndpointUnique: uniqueIndex("webhookDeliveries_endpoint_event_unique").on(table.endpointId, table.eventId) }));
var paymentIntents = mysqlTable("paymentIntents", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var paymentTransactions = mysqlTable("paymentTransactions", {
  id: int("id").autoincrement().primaryKey(),
  paymentIntentId: varchar("paymentIntentId", { length: 32 }).notNull(),
  transactionHash: varchar("transactionHash", { length: 66 }).notNull().unique(),
  fromAddress: varchar("fromAddress", { length: 42 }).notNull(),
  toAddress: varchar("toAddress", { length: 42 }).notNull(),
  tokenAddress: varchar("tokenAddress", { length: 42 }).notNull(),
  amountAtomic: varchar("amountAtomic", { length: 64 }).notNull(),
  chainId: int("chainId").notNull(),
  finalizedAt: timestamp("finalizedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID || "druto-platform-app",
  cookieSecret: process.env.JWT_SECRET || "druto-local-development-jwt-secret-key-32b",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  privyAppId: process.env.PRIVY_APP_ID ?? "",
  privyAppSecret: process.env.PRIVY_APP_SECRET ?? ""
};

// server/memoryDb.ts
function getTableName(table) {
  if (!table) return "unknown";
  if (typeof table === "string") return table;
  if (table._ && table._.name) return table._.name;
  if (table[Symbol.for("drizzle:Name")]) return table[Symbol.for("drizzle:Name")];
  if (table === users) return "users";
  if (table === merchantAccounts) return "merchantAccounts";
  if (table === apiKeys) return "apiKeys";
  if (table === paymentIntents) return "paymentIntents";
  if (table === paymentTransactions) return "paymentTransactions";
  if (table === webhookEndpoints) return "webhookEndpoints";
  if (table === webhookDeliveries) return "webhookDeliveries";
  if (table === walletLoginChallenges) return "walletLoginChallenges";
  return "unknown";
}
function createMemoryDb() {
  const store = {
    users: [
      {
        id: 1,
        openId: "druto-operator-operator-druto-xyz",
        name: "Druto Operator",
        email: "operator@druto.xyz",
        loginMethod: "account",
        role: "admin",
        createdAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date(),
        lastSignedIn: /* @__PURE__ */ new Date()
      }
    ],
    merchantAccounts: [
      {
        id: "ma_druto_labs",
        marketplaceId: "druto-demo-marketplace",
        externalSellerId: "druto-labs",
        ownerUserId: 1,
        displayName: "Druto Labs",
        receivingAddress: "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217",
        status: "active",
        createdAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      },
      {
        id: "ma_mosaic_works",
        marketplaceId: "druto-demo-marketplace",
        externalSellerId: "mosaic-works",
        ownerUserId: 1,
        displayName: "Mosaic Works",
        receivingAddress: "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217",
        status: "active",
        createdAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      }
    ],
    apiKeys: [],
    paymentIntents: [
      {
        id: "pi_demo_1842",
        externalOrderId: "DR-1842",
        marketplaceId: "druto-demo-marketplace",
        sellerId: "druto-labs",
        merchantAccountId: "ma_druto_labs",
        idempotencyKey: "marketplace-druto-1842",
        itemName: "Arc API Pro \u2014 annual access",
        buyerLabel: "Demo Buyer",
        returnUrl: "/marketplace",
        orderContext: JSON.stringify({
          items: [
            {
              productId: "api-pro",
              name: "Arc API Pro",
              seller: "Druto Labs",
              unitPrice: 1,
              quantity: 1
            }
          ],
          delivery: "Standard",
          shippingAddress: {
            name: "Demo Buyer",
            line1: "100 Crypto Way",
            city: "San Francisco",
            postalCode: "94107",
            country: "US"
          },
          buyerEmail: "buyer@example.com"
        }),
        amountAtomic: "1000000",
        asset: "USDC",
        network: "arc-testnet",
        merchantAddress: "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217",
        buyerAddress: "0x71C56538B1810578d0f191A78401340B2D497143",
        status: "succeeded",
        transactionHash: "0x9876543210abcdef9876543210abcdef9876543210abcdef9876543210abcdef",
        expiresAt: new Date(Date.now() + 864e5),
        createdAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      }
    ],
    paymentTransactions: [
      {
        id: 1,
        paymentIntentId: "pi_demo_1842",
        transactionHash: "0x9876543210abcdef9876543210abcdef9876543210abcdef9876543210abcdef",
        fromAddress: "0x71C56538B1810578d0f191A78401340B2D497143",
        toAddress: "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217",
        tokenAddress: "0x3600000000000000000000000000000000000000",
        amountAtomic: "1000000",
        chainId: 5042002,
        finalizedAt: /* @__PURE__ */ new Date(),
        createdAt: /* @__PURE__ */ new Date()
      }
    ],
    webhookEndpoints: [],
    webhookDeliveries: [],
    walletLoginChallenges: []
  };
  function getTableList(table) {
    const name = getTableName(table);
    if (!store[name]) {
      store[name] = [];
    }
    return store[name];
  }
  function matchesCondition(row, condition) {
    if (!condition) return true;
    if (condition.operator === "and" || condition.type === "and") {
      const conds = condition.conditions || condition.chunks || [];
      return conds.every((c) => matchesCondition(row, c));
    }
    if (condition.operator === "or" || condition.type === "or") {
      const conds = condition.conditions || condition.chunks || [];
      return conds.some((c) => matchesCondition(row, c));
    }
    if (condition.operator === "not" || condition.type === "not") {
      return !matchesCondition(row, condition.value || condition.condition);
    }
    if (condition.queryChunks && Array.isArray(condition.queryChunks)) {
      let matched = true;
      for (const chunk of condition.queryChunks) {
        if (chunk && typeof chunk === "object") {
          if ("conditions" in chunk) {
            if (!matchesCondition(row, chunk)) return false;
          } else if (chunk.left && chunk.right !== void 0) {
            const col = chunk.left.name || chunk.left.columnName;
            const val = chunk.right?.value !== void 0 ? chunk.right.value : chunk.right;
            if (row[col] !== val) return false;
          }
        }
      }
      return matched;
    }
    if (condition.left && condition.right !== void 0) {
      const col = condition.left.name || condition.left.columnName || condition.left;
      const val = condition.right?.value !== void 0 ? condition.right.value : condition.right;
      return row[col] === val;
    }
    if (condition.column && condition.values) {
      const col = condition.column.name || condition.column.columnName || condition.column;
      const values = Array.isArray(condition.values) ? condition.values : [];
      return values.includes(row[col]);
    }
    if (condition.column && condition.operator === "isNull") {
      const col = condition.column.name || condition.column.columnName || condition.column;
      return row[col] === null || row[col] === void 0;
    }
    return true;
  }
  function projectRow(row, shape) {
    if (!shape || typeof shape !== "object") return { ...row };
    const res = {};
    for (const [key, field] of Object.entries(shape)) {
      const colName = field?.name || field?.columnName || key;
      res[key] = row[colName] !== void 0 ? row[colName] : row[key];
    }
    return res;
  }
  const memoryDb = {
    select: (shape) => {
      let currentTable = null;
      let whereClause = null;
      let limitCount = null;
      let joinedTable = null;
      let joinCondition = null;
      const queryBuilder = {
        from: (table) => {
          currentTable = table;
          return queryBuilder;
        },
        innerJoin: (otherTable, onCondition) => {
          joinedTable = otherTable;
          joinCondition = onCondition;
          return queryBuilder;
        },
        where: (condition) => {
          whereClause = condition;
          return queryBuilder;
        },
        orderBy: () => queryBuilder,
        limit: (n) => {
          limitCount = n;
          return queryBuilder;
        },
        then: (resolve, reject) => {
          try {
            const list = getTableList(currentTable);
            let results = [];
            if (joinedTable) {
              const otherList = getTableList(joinedTable);
              for (const rowA of list) {
                for (const rowB of otherList) {
                  const combined = { ...rowB, ...rowA };
                  if (matchesCondition(combined, whereClause)) {
                    results.push(projectRow(combined, shape));
                  }
                }
              }
            } else {
              for (const row of list) {
                if (matchesCondition(row, whereClause)) {
                  results.push(projectRow(row, shape));
                }
              }
            }
            if (limitCount !== null) {
              results = results.slice(0, limitCount);
            }
            resolve(results);
          } catch (err) {
            if (reject) reject(err);
            else throw err;
          }
        }
      };
      return queryBuilder;
    },
    insert: (table) => {
      const list = getTableList(table);
      let duplicateUpdateSet = null;
      const insertBuilder = {
        values: (data) => {
          const rowsToInsert = Array.isArray(data) ? data : [data];
          for (const item of rowsToInsert) {
            const row = {
              id: item.id || list.length + 1,
              createdAt: /* @__PURE__ */ new Date(),
              updatedAt: /* @__PURE__ */ new Date(),
              ...item
            };
            const existingIndex = list.findIndex((r) => {
              if (item.openId && r.openId === item.openId) return true;
              if (item.id && r.id === item.id) return true;
              if (item.idempotencyKey && r.idempotencyKey === item.idempotencyKey) return true;
              return false;
            });
            if (existingIndex >= 0) {
              if (duplicateUpdateSet) {
                Object.assign(list[existingIndex], duplicateUpdateSet, { updatedAt: /* @__PURE__ */ new Date() });
              }
            } else {
              list.push(row);
            }
          }
          return insertBuilder;
        },
        onDuplicateKeyUpdate: (opts) => {
          duplicateUpdateSet = opts.set;
          return insertBuilder;
        },
        then: (resolve) => {
          resolve([{ affectedRows: 1 }]);
        }
      };
      return insertBuilder;
    },
    update: (table) => {
      const list = getTableList(table);
      let setValues = {};
      const updateBuilder = {
        set: (values) => {
          setValues = values;
          return updateBuilder;
        },
        where: (condition) => {
          let affected = 0;
          for (const row of list) {
            if (matchesCondition(row, condition)) {
              Object.assign(row, setValues, { updatedAt: /* @__PURE__ */ new Date() });
              affected++;
            }
          }
          return {
            then: (resolve) => resolve([{ affectedRows: affected }])
          };
        }
      };
      return updateBuilder;
    },
    delete: (table) => {
      const list = getTableList(table);
      return {
        where: (condition) => {
          const initialLen = list.length;
          const filtered = list.filter((r) => !matchesCondition(r, condition));
          list.length = 0;
          list.push(...filtered);
          return {
            then: (resolve) => resolve([{ affectedRows: initialLen - filtered.length }])
          };
        }
      };
    }
  };
  return memoryDb;
}

// server/db.ts
import mysql from "mysql2/promise";
var _db = null;
async function getDb() {
  if (!_db) {
    if (process.env.DATABASE_URL) {
      try {
        const isSslNeeded = process.env.DATABASE_URL.includes("tidb") || process.env.DATABASE_URL.includes("ssl") || process.env.DATABASE_URL.includes("aivencloud") || process.env.DATABASE_URL.includes("planetscale");
        const pool = mysql.createPool({
          uri: process.env.DATABASE_URL,
          ssl: isSslNeeded ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : void 0,
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0
        });
        _db = drizzle(pool);
      } catch (error) {
        console.warn("[Database] Failed to connect MySQL, falling back to in-memory:", error);
        _db = createMemoryDb();
      }
    } else {
      _db = createMemoryDb();
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "profileImage", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/arc.ts
import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  parseUnits
} from "viem";
import { arcTestnet } from "viem/chains";
var ARC_CHAIN_ID = 5042002;
var ARC_RPC_URL = "https://rpc.testnet.arc.io";
var ARC_USDC_ADDRESS = getAddress("0x3600000000000000000000000000000000000000");
var ARC_MERCHANT_WALLET_ADDRESS = getAddress(
  process.env.ARC_MERCHANT_WALLET_ADDRESS ?? "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217"
);
var erc20Abi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" }
    ],
    outputs: [{ name: "success", type: "bool" }]
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" }
    ]
  }
];
var arcPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_RPC_URL)
});
function amountToAtomicUsdc(amount) {
  return parseUnits(amount, 6).toString();
}
async function verifyArcUsdcTransfer(hash, expectedAmountAtomic, expectedRecipient = ARC_MERCHANT_WALLET_ADDRESS) {
  const receipt = await arcPublicClient.waitForTransactionReceipt({ hash, confirmations: 1, pollingInterval: 500 });
  if (receipt.status !== "success") throw new Error("Arc transaction reverted");
  const resolvedRecipient = getAddress(expectedRecipient);
  const matchingTransfer = receipt.logs.filter((log) => log.address.toLowerCase() === ARC_USDC_ADDRESS.toLowerCase()).map((log) => {
    try {
      return decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
    } catch {
      return null;
    }
  }).find((decoded) => decoded?.eventName === "Transfer" && decoded.args.to?.toLowerCase() === resolvedRecipient.toLowerCase() && decoded.args.value?.toString() === expectedAmountAtomic);
  if (!matchingTransfer || !matchingTransfer.args.from || !matchingTransfer.args.to || matchingTransfer.args.value === void 0) {
    throw new Error("No matching USDC transfer to the expected seller wallet was found");
  }
  return {
    fromAddress: getAddress(matchingTransfer.args.from),
    toAddress: getAddress(matchingTransfer.args.to),
    amountAtomic: matchingTransfer.args.value.toString(),
    transactionHash: hash
  };
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    path: "/",
    sameSite: secure ? "none" : "lax",
    secure
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";

// server/payment-policy.ts
function assertIdempotentMatch(existing, requested) {
  if (existing.externalOrderId !== requested.externalOrderId || existing.itemName !== requested.itemName || existing.amountAtomic !== requested.amountAtomic) {
    throw new Error("Idempotency key was already used with different payment details");
  }
}
function normalizeMarketplaceReturnUrl(value) {
  if (!value) return "/";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.toString();
  } catch {
  }
  throw new Error("Return URL must be a relative path or an http(s) URL");
}

// server/payment-summary.ts
function summarizeVerifiedRows(rows) {
  const totalAtomic = rows.reduce((sum, row) => sum + BigInt(row.amountAtomic), BigInt(0));
  return { totalAtomic, count: rows.length };
}

// server/webhooks.ts
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
var WEBHOOK_EVENT_VERSION = "2026-08-23";
function secretKey() {
  return createHash("sha256").update(process.env.JWT_SECRET ?? "druto-development-secret").digest();
}
function encryptWebhookSecret(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}
function decryptWebhookSecret(ciphertext) {
  const [ivValue, tagValue, encryptedValue] = ciphertext.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Invalid webhook secret ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}
function signWebhookPayload(secret, payload, timestamp2 = Math.floor(Date.now() / 1e3)) {
  const signature = createHmac("sha256", secret).update(`${timestamp2}.${payload}`).digest("hex");
  return { header: `t=${timestamp2},v1=${signature}`, timestamp: timestamp2, signature };
}
function parseOrderContext(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value.items) && typeof value.delivery === "string" && typeof value.buyerEmail === "string" ? value : null;
  } catch {
    return null;
  }
}
function buildPaymentVerifiedEvent(intent, transaction, eventId = `evt_${randomBytes(12).toString("hex")}`) {
  return { id: eventId, type: "payment.verified", version: WEBHOOK_EVENT_VERSION, createdAt: (/* @__PURE__ */ new Date()).toISOString(), data: {
    paymentIntentId: intent.id,
    externalOrderId: intent.externalOrderId,
    marketplaceId: intent.marketplaceId,
    sellerId: intent.sellerId,
    merchantAccountId: intent.merchantAccountId,
    status: "succeeded",
    amount: (Number(transaction.amountAtomic) / 1e6).toFixed(6),
    amountAtomic: transaction.amountAtomic,
    asset: "USDC",
    network: "arc-testnet",
    buyerAddress: intent.buyerAddress,
    merchantAddress: intent.merchantAddress,
    transactionHash: transaction.transactionHash,
    orderContext: parseOrderContext(intent.orderContext)
  } };
}
function createWebhookSecret() {
  return randomBytes(32).toString("base64url");
}
function serializeWebhookEvent(event) {
  return JSON.stringify(event);
}
function nextRetryAt(attempts, now = /* @__PURE__ */ new Date()) {
  return new Date(now.getTime() + Math.min(60 * 60 * 1e3, 2 ** Math.min(attempts, 8) * 1e3));
}
function buildWebhookHeaders(eventId, signed) {
  return { "content-type": "application/json", "user-agent": "druto-webhooks/1.0", "x-druto-event-id": eventId, "druto-signature": signed.header };
}
function isValidWebhookUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" && url.hostname === "localhost";
  } catch {
    return false;
  }
}

// server/webhook-delivery.ts
import { and, eq as eq2 } from "drizzle-orm";
import { createHash as createHash2 } from "node:crypto";
function deterministicEventId(paymentIntentId) {
  return `evt_${createHash2("sha256").update(`${paymentIntentId}:payment.verified`).digest("hex").slice(0, 32)}`;
}
async function postWebhook(url, secret, eventId, payload) {
  const signed = signWebhookPayload(secret, payload);
  try {
    const response = await fetch(url, { method: "POST", headers: buildWebhookHeaders(eventId, signed), body: payload, signal: AbortSignal.timeout(1e4) });
    return response.ok ? { ok: true, status: response.status } : { ok: false, status: response.status, error: `Receiver returned HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : "Webhook request failed" };
  }
}
async function dispatchPaymentVerified(db, intent, transaction) {
  if (!intent.merchantAccountId) return [];
  const endpoints = await db.select().from(webhookEndpoints).where(and(eq2(webhookEndpoints.merchantAccountId, intent.merchantAccountId), eq2(webhookEndpoints.active, 1)));
  const eventId = deterministicEventId(intent.id);
  const payload = serializeWebhookEvent(buildPaymentVerifiedEvent(intent, transaction, eventId));
  const results = [];
  for (const endpoint of endpoints) {
    const secret = decryptWebhookSecret(endpoint.secretCiphertext);
    const signed = signWebhookPayload(secret, payload);
    const deliveryId = `wd_${createHash2("sha256").update(`${endpoint.id}:${eventId}`).digest("hex").slice(0, 24)}`;
    try {
      await db.insert(webhookDeliveries).values({ id: deliveryId, endpointId: endpoint.id, eventId, eventType: "payment.verified", paymentIntentId: intent.id, payload, signature: signed.header, status: "pending", attempts: 0 });
    } catch {
      const [existing] = await db.select().from(webhookDeliveries).where(and(eq2(webhookDeliveries.endpointId, endpoint.id), eq2(webhookDeliveries.eventId, eventId))).limit(1);
      if (existing?.status === "succeeded") {
        results.push({ ok: true, status: 200 });
        continue;
      }
    }
    const result = await postWebhook(endpoint.url, secret, eventId, payload);
    results.push(result);
    await db.update(webhookDeliveries).set({ status: result.ok ? "succeeded" : "failed", attempts: 1, lastError: result.error ?? null, deliveredAt: result.ok ? /* @__PURE__ */ new Date() : null, nextAttemptAt: result.ok ? null : nextRetryAt(1) }).where(eq2(webhookDeliveries.id, deliveryId));
  }
  return results;
}
async function retryWebhookDelivery(db, deliveryId, now = /* @__PURE__ */ new Date()) {
  const [delivery] = await db.select().from(webhookDeliveries).where(eq2(webhookDeliveries.id, deliveryId)).limit(1);
  if (!delivery || delivery.status === "succeeded") return { ok: true, status: 200, skipped: true };
  if (delivery.nextAttemptAt && delivery.nextAttemptAt.getTime() > now.getTime()) return { ok: false, status: 425, error: "Retry is not due yet" };
  const [endpoint] = await db.select().from(webhookEndpoints).where(eq2(webhookEndpoints.id, delivery.endpointId)).limit(1);
  if (!endpoint || endpoint.active !== 1) return { ok: false, status: 410, error: "Webhook endpoint is inactive" };
  const result = await postWebhook(endpoint.url, decryptWebhookSecret(endpoint.secretCiphertext), delivery.eventId, delivery.payload);
  const attempts = Number(delivery.attempts ?? 0) + 1;
  await db.update(webhookDeliveries).set({ status: result.ok ? "succeeded" : "failed", attempts, lastError: result.error ?? null, deliveredAt: result.ok ? now : null, nextAttemptAt: result.ok ? null : nextRetryAt(attempts, now) }).where(eq2(webhookDeliveries.id, delivery.id));
  return { ...result, skipped: false };
}

// server/api-keys.ts
import { createHash as createHash3, randomBytes as randomBytes2 } from "node:crypto";
import { nanoid } from "nanoid";
var API_KEY_PREFIX = "druto_test_";
function hashApiKey(secret) {
  return createHash3("sha256").update(secret).digest("hex");
}
function createApiKeyMaterial(name) {
  const normalizedName = name.trim().replace(/\s+/g, " ");
  if (!normalizedName || normalizedName.length > 120) throw new Error("API key name must be between 1 and 120 characters");
  const secret = `${API_KEY_PREFIX}${randomBytes2(32).toString("base64url")}`;
  return {
    id: `key_${nanoid(14)}`,
    name: normalizedName,
    prefix: API_KEY_PREFIX,
    lastFour: secret.slice(-4),
    secretHash: hashApiKey(secret),
    secret
  };
}

// server/privy-auth.ts
import { verifyAccessToken } from "@privy-io/node";
import { createRemoteJWKSet } from "jose";
var jwks = null;
function getPrivyJwks() {
  if (!ENV.privyAppId || !ENV.privyAppSecret) throw new Error("Privy authentication is not configured");
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://auth.privy.io/v1/apps/${encodeURIComponent(ENV.privyAppId)}/jwks.json`), {
      headers: { Authorization: `Basic ${Buffer.from(`${ENV.privyAppId}:${ENV.privyAppSecret}`).toString("base64")}` }
    });
  }
  return jwks;
}
async function verifyPrivyToken(accessToken) {
  if (!accessToken.trim()) throw new Error("Privy access token is missing");
  return verifyAccessToken({ access_token: accessToken, app_id: ENV.privyAppId, verification_key: getPrivyJwks() });
}
function privyOpenId(userId) {
  return `privy:${userId}`;
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString2 = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey2 = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey2);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey2 = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey2, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString2(openId) || !isNonEmptyString2(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId: isNonEmptyString2(appId) ? appId : ENV.appId || "druto-platform-app",
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/routers.ts
var sellerRoutingInput = z2.object({
  marketplaceId: z2.string().min(1).max(128),
  sellerId: z2.string().min(1).max(128),
  merchantAccountId: z2.string().min(1).max(32).optional()
});
var paymentInput = z2.object({
  externalOrderId: z2.string().min(1).max(128),
  idempotencyKey: z2.string().min(1).max(128).optional(),
  itemName: z2.string().min(1).max(255),
  buyerLabel: z2.string().max(255).optional(),
  returnUrl: z2.string().max(2048).optional(),
  amount: z2.string().regex(/^\d+(\.\d{1,6})?$/, "Amount must be a positive USDC decimal amount"),
  orderContext: z2.object({ items: z2.array(z2.object({ productId: z2.string(), name: z2.string(), seller: z2.string(), unitPrice: z2.number().nonnegative(), quantity: z2.number().int().positive() })), delivery: z2.string(), shippingAddress: z2.object({ name: z2.string(), line1: z2.string(), city: z2.string(), postalCode: z2.string(), country: z2.string() }), buyerEmail: z2.string().email() }).optional(),
  seller: sellerRoutingInput.optional()
});
var LEGACY_DEMO_SELLERS = { "druto-labs": "Druto Labs", "mosaic-works": "Mosaic Works", "dawn-studio": "Dawn Studio", "atlas-compute": "Atlas Compute", "meridian-ops": "Meridian Ops" };
function resolveLegacyDemoMerchantAccount(seller) {
  if (seller.marketplaceId !== "druto-demo-marketplace" || !LEGACY_DEMO_SELLERS[seller.sellerId]) return null;
  return { id: `legacy-demo-${seller.sellerId}`, marketplaceId: seller.marketplaceId, externalSellerId: seller.sellerId, displayName: LEGACY_DEMO_SELLERS[seller.sellerId], receivingAddress: process.env.ARC_MERCHANT_WALLET_ADDRESS, ownerUserId: void 0, status: "active" };
}
async function resolveMerchantAccount(db, seller, options = {}) {
  if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
  const [account] = seller.merchantAccountId ? await db.select().from(merchantAccounts).where(eq3(merchantAccounts.id, seller.merchantAccountId)).limit(1) : await db.select().from(merchantAccounts).where(and2(eq3(merchantAccounts.marketplaceId, seller.marketplaceId), eq3(merchantAccounts.externalSellerId, seller.sellerId))).limit(1);
  const legacyDemoAccount = resolveLegacyDemoMerchantAccount(seller);
  if (!account && legacyDemoAccount) return legacyDemoAccount;
  if (!account || !options.allowPending && account.status !== "active") throw new TRPCError3({ code: "NOT_FOUND", message: "Seller is not onboarded or active in Druto" });
  if (account.marketplaceId !== seller.marketplaceId || account.externalSellerId !== seller.sellerId) throw new TRPCError3({ code: "CONFLICT", message: "Seller routing identifiers do not match the merchant account" });
  return account;
}
async function resolveMerchantAccountForOperator(db, seller, user, options = {}) {
  const account = await resolveMerchantAccount(db, seller, options);
  if (account.id.startsWith("legacy-demo-")) return account;
  if (user.role !== "admin" && account.ownerUserId !== user.id) throw new TRPCError3({ code: "FORBIDDEN", message: "You are not authorized to view this seller account" });
  return account;
}
async function getOperatorMerchantAccountIds(db, user) {
  if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
  const accounts = user.role === "admin" ? await db.select({ id: merchantAccounts.id }).from(merchantAccounts) : await db.select({ id: merchantAccounts.id }).from(merchantAccounts).where(eq3(merchantAccounts.ownerUserId, user.id));
  return accounts.map((account) => account.id);
}
function filterMerchantRows(rows, merchantAccountId) {
  return rows.filter((row) => row.merchantAccountId === merchantAccountId);
}
async function requireSellerApiKey(db, request, seller) {
  if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) throw new TRPCError3({ code: "UNAUTHORIZED", message: "A Druto seller API key is required" });
  const secret = authorization.slice("Bearer ".length).trim();
  if (!secret) throw new TRPCError3({ code: "UNAUTHORIZED", message: "A Druto seller API key is required" });
  const [key] = await db.select().from(apiKeys).where(eq3(apiKeys.secretHash, hashApiKey(secret))).limit(1);
  if (!key || key.revokedAt) throw new TRPCError3({ code: "UNAUTHORIZED", message: "Invalid or revoked Druto API key" });
  if (key.marketplaceId !== seller.marketplaceId || key.sellerId !== seller.sellerId || !key.merchantAccountId) throw new TRPCError3({ code: "FORBIDDEN", message: "This API key is not linked to the requested seller" });
  await db.update(apiKeys).set({ lastUsedAt: /* @__PURE__ */ new Date() }).where(eq3(apiKeys.id, key.id));
  return key;
}
var appRouter = router({
  system: systemRouter,
  apiKeys: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      return db.select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, lastFour: apiKeys.lastFour, merchantAccountId: apiKeys.merchantAccountId, marketplaceId: apiKeys.marketplaceId, sellerId: apiKeys.sellerId, sellerDisplayName: apiKeys.sellerDisplayName, createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt }).from(apiKeys).where(eq3(apiKeys.ownerUserId, ctx.user.id));
    }),
    create: protectedProcedure.input(z2.object({ name: z2.string().trim().min(1).max(120), merchantAccountId: z2.string().min(1).max(32).optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      let account;
      if (input.merchantAccountId) {
        const [candidate] = await db.select().from(merchantAccounts).where(eq3(merchantAccounts.id, input.merchantAccountId)).limit(1);
        if (!candidate || ctx.user.role !== "admin" && candidate.ownerUserId !== ctx.user.id) throw new TRPCError3({ code: "FORBIDDEN", message: "You are not authorized to link this API key to the seller account" });
        account = candidate;
      }
      const material = createApiKeyMaterial(input.name);
      await db.insert(apiKeys).values({ id: material.id, ownerUserId: ctx.user.id, name: material.name, prefix: material.prefix, lastFour: material.lastFour, merchantAccountId: account?.id, marketplaceId: account?.marketplaceId, sellerId: account?.externalSellerId, sellerDisplayName: account?.displayName, secretHash: material.secretHash });
      return { id: material.id, name: material.name, prefix: material.prefix, lastFour: material.lastFour, merchantAccountId: account?.id ?? null, marketplaceId: account?.marketplaceId ?? null, sellerId: account?.externalSellerId ?? null, sellerDisplayName: account?.displayName ?? null, secret: material.secret };
    }),
    revoke: protectedProcedure.input(z2.object({ id: z2.string().min(1).max(32) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const result = await db.update(apiKeys).set({ revokedAt: /* @__PURE__ */ new Date() }).where(and2(eq3(apiKeys.id, input.id), eq3(apiKeys.ownerUserId, ctx.user.id), isNull(apiKeys.revokedAt)));
      const affectedRows = Number(result?.[0]?.affectedRows ?? result?.affectedRows ?? 0);
      if (affectedRows !== 1) throw new TRPCError3({ code: "NOT_FOUND", message: "Active API key not found" });
      return { success: true };
    })
  }),
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    createWalletChallenge: publicProcedure.input(z2.object({ walletAddress: z2.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM wallet address") })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const walletAddress = getAddress2(input.walletAddress);
      const challengeId = `wch_${nanoid2(12)}`;
      const nonce = nanoid2(24);
      const issuedAt = /* @__PURE__ */ new Date();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1e3);
      const message = `Sign in to Druto Platform

Wallet: ${walletAddress}
Nonce: ${nonce}
Issued At: ${issuedAt.toISOString()}`;
      const nonceHash = createHash4("sha256").update(nonce).digest("hex");
      await db.insert(walletLoginChallenges).values({
        id: challengeId,
        walletAddress,
        message,
        nonceHash,
        expiresAt
      });
      return { challengeId, message, expiresAt };
    }),
    verifyWalletLogin: publicProcedure.input(z2.object({
      challengeId: z2.string().min(1).max(32),
      walletAddress: z2.string().regex(/^0x[a-fA-F0-9]{40}$/),
      signature: z2.string().regex(/^0x[a-fA-F0-9]+$/)
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const walletAddress = getAddress2(input.walletAddress);
      const [challenge] = await db.select().from(walletLoginChallenges).where(eq3(walletLoginChallenges.id, input.challengeId)).limit(1);
      if (!challenge) throw new TRPCError3({ code: "NOT_FOUND", message: "Login challenge not found" });
      if (challenge.usedAt) throw new TRPCError3({ code: "BAD_REQUEST", message: "Login challenge already used" });
      if (/* @__PURE__ */ new Date() > new Date(challenge.expiresAt)) throw new TRPCError3({ code: "BAD_REQUEST", message: "Login challenge expired" });
      if (challenge.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: "Challenge wallet mismatch" });
      }
      let isValid = false;
      try {
        isValid = await verifyMessage({
          address: walletAddress,
          message: challenge.message,
          signature: input.signature
        });
      } catch (err) {
        console.error("[Wallet Verify Error]", err);
        isValid = false;
      }
      if (!isValid) {
        throw new TRPCError3({ code: "UNAUTHORIZED", message: "Invalid wallet signature" });
      }
      await db.update(walletLoginChallenges).set({ usedAt: /* @__PURE__ */ new Date() }).where(eq3(walletLoginChallenges.id, challenge.id));
      const [boundAccount] = await db.select().from(merchantAccounts).where(eq3(merchantAccounts.receivingAddress, walletAddress)).limit(1);
      let targetOpenId = `wallet-${walletAddress.toLowerCase()}`;
      let targetName = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
      if (boundAccount && boundAccount.ownerUserId !== null) {
        const [ownerUser] = await db.select().from(users).where(eq3(users.id, boundAccount.ownerUserId)).limit(1);
        if (ownerUser) {
          targetOpenId = ownerUser.openId;
          targetName = ownerUser.name || targetName;
        }
      }
      const signedInAt = /* @__PURE__ */ new Date();
      await db.insert(users).values({
        openId: targetOpenId,
        name: targetName,
        loginMethod: "wallet",
        role: "admin",
        lastSignedIn: signedInAt
      }).onDuplicateKeyUpdate({
        set: { name: targetName, loginMethod: "wallet", role: "admin", lastSignedIn: signedInAt }
      });
      const token = await sdk.createSessionToken(targetOpenId, { name: targetName });
      ctx.res.cookie(COOKIE_NAME, token, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: 365 * 24 * 60 * 60 * 1e3
      });
      return { authenticated: true, openId: targetOpenId, name: targetName, token, walletAddress };
    }),
    directAccountLogin: publicProcedure.input(z2.object({ email: z2.string().email().optional(), name: z2.string().optional() }).optional()).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const email = input?.email || "operator@druto.xyz";
      const name = input?.name || "Druto Operator";
      const openId = `druto-operator-${email.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
      const signedInAt = /* @__PURE__ */ new Date();
      await db.insert(users).values({ openId, name, email, loginMethod: "account", role: "admin", lastSignedIn: signedInAt }).onDuplicateKeyUpdate({ set: { name, email, loginMethod: "account", role: "admin", lastSignedIn: signedInAt } });
      const token = await sdk.createSessionToken(openId, { name });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: 365 * 24 * 60 * 60 * 1e3 });
      return { authenticated: true, openId, name, token };
    }),
    privyLogin: publicProcedure.input(z2.object({
      accessToken: z2.string().min(20).max(4096),
      email: z2.string().email().optional(),
      name: z2.string().optional(),
      walletAddress: z2.string().regex(/^0x[a-fA-F0-9]{40}$/).optional()
    })).mutation(async ({ input, ctx }) => {
      let verified;
      try {
        verified = await verifyPrivyToken(input.accessToken);
      } catch {
        throw new TRPCError3({ code: "UNAUTHORIZED", message: "Privy authentication could not be verified" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const openId = privyOpenId(verified.user_id);
      const email = input.email;
      const name = input.name || (email ? email.split("@")[0] : "Privy workspace");
      const signedInAt = /* @__PURE__ */ new Date();
      await db.insert(users).values({ openId, name, email, loginMethod: "privy", role: "admin", lastSignedIn: signedInAt }).onDuplicateKeyUpdate({ set: { name, email, loginMethod: "privy", role: "admin", lastSignedIn: signedInAt } });
      const token = await sdk.createSessionToken(openId, { name });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: 365 * 24 * 60 * 60 * 1e3 });
      return { authenticated: true, openId, name };
    }),
    bindWallet: protectedProcedure.input(z2.object({
      challengeId: z2.string().min(1).max(32),
      walletAddress: z2.string().regex(/^0x[a-fA-F0-9]{40}$/),
      signature: z2.string().regex(/^0x[a-fA-F0-9]+$/)
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const walletAddress = getAddress2(input.walletAddress);
      const [challenge] = await db.select().from(walletLoginChallenges).where(eq3(walletLoginChallenges.id, input.challengeId)).limit(1);
      if (!challenge) throw new TRPCError3({ code: "NOT_FOUND", message: "Challenge not found" });
      if (challenge.usedAt) throw new TRPCError3({ code: "BAD_REQUEST", message: "Challenge already used" });
      if (/* @__PURE__ */ new Date() > new Date(challenge.expiresAt)) throw new TRPCError3({ code: "BAD_REQUEST", message: "Challenge expired" });
      if (challenge.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: "Wallet mismatch" });
      }
      const isValid = await verifyMessage({
        address: walletAddress,
        message: challenge.message,
        signature: input.signature
      }).catch(() => false);
      if (!isValid) throw new TRPCError3({ code: "UNAUTHORIZED", message: "Invalid wallet signature" });
      await db.update(walletLoginChallenges).set({ usedAt: /* @__PURE__ */ new Date() }).where(eq3(walletLoginChallenges.id, challenge.id));
      const updatedName = ctx.user.name && !ctx.user.name.startsWith("0x") ? `${ctx.user.name} (${walletAddress.slice(0, 6)}\u2026${walletAddress.slice(-4)})` : `${walletAddress.slice(0, 6)}\u2026${walletAddress.slice(-4)}`;
      await db.update(users).set({
        name: updatedName,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq3(users.id, ctx.user.id));
      return { success: true, walletAddress, name: updatedName };
    }),
    updateProfile: protectedProcedure.input(z2.object({
      name: z2.string().optional(),
      profileImage: z2.string().optional()
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      await db.update(users).set({
        name: input.name ?? ctx.user.name,
        profileImage: input.profileImage ?? ctx.user.profileImage,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq3(users.id, ctx.user.id));
      const [updatedUser] = await db.select().from(users).where(eq3(users.id, ctx.user.id)).limit(1);
      return updatedUser;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  merchantAccounts: router({
    listMine: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const accounts = ctx.user.role === "admin" ? await db.select().from(merchantAccounts) : await db.select().from(merchantAccounts).where(eq3(merchantAccounts.ownerUserId, ctx.user.id));
      const accountIds = accounts.map((account) => account.id);
      const webhooks = accountIds.length ? await db.select({ id: webhookEndpoints.id, merchantAccountId: webhookEndpoints.merchantAccountId, url: webhookEndpoints.url, active: webhookEndpoints.active, createdAt: webhookEndpoints.createdAt, updatedAt: webhookEndpoints.updatedAt }).from(webhookEndpoints).where(inArray(webhookEndpoints.merchantAccountId, accountIds)) : [];
      return { accounts, webhooks };
    }),
    register: protectedProcedure.input(z2.object({ marketplaceId: z2.string().min(1).max(128), sellerId: z2.string().min(1).max(128), displayName: z2.string().min(1).max(255), receivingAddress: z2.string().regex(/^0x[a-fA-F0-9]{40}$/) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [existing] = await db.select().from(merchantAccounts).where(and2(eq3(merchantAccounts.marketplaceId, input.marketplaceId), eq3(merchantAccounts.externalSellerId, input.sellerId))).limit(1);
      if (existing) {
        if (existing.ownerUserId && existing.ownerUserId !== ctx.user.id && ctx.user.role !== "admin") {
          throw new TRPCError3({ code: "CONFLICT", message: `Seller ID '${input.sellerId}' in marketplace '${input.marketplaceId}' is already registered by another account.` });
        }
        await db.update(merchantAccounts).set({
          displayName: input.displayName,
          receivingAddress: input.receivingAddress,
          ownerUserId: ctx.user.id,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq3(merchantAccounts.id, existing.id));
        const [updated] = await db.select().from(merchantAccounts).where(eq3(merchantAccounts.id, existing.id)).limit(1);
        return updated;
      }
      const id = `ma_${nanoid2(12)}`;
      try {
        await db.insert(merchantAccounts).values({ id, marketplaceId: input.marketplaceId, externalSellerId: input.sellerId, ownerUserId: ctx.user.id, displayName: input.displayName, receivingAddress: input.receivingAddress, status: "pending" });
      } catch (error) {
        throw new TRPCError3({ code: "CONFLICT", message: error instanceof Error ? error.message : "Seller account already exists" });
      }
      const [account] = await db.select().from(merchantAccounts).where(eq3(merchantAccounts.id, id)).limit(1);
      return account;
    }),
    registerWebhook: protectedProcedure.input(z2.object({ seller: sellerRoutingInput, url: z2.string().min(1).max(2048) })).mutation(async ({ input, ctx }) => {
      if (!isValidWebhookUrl(input.url)) throw new TRPCError3({ code: "BAD_REQUEST", message: "Webhook URL must use HTTPS (or localhost HTTP for development)" });
      const db = await getDb();
      const account = await resolveMerchantAccountForOperator(db, input.seller, ctx.user, { allowPending: true });
      if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const secret = createWebhookSecret();
      const id = `wh_${nanoid2(12)}`;
      await db.insert(webhookEndpoints).values({ id, marketplaceId: account.marketplaceId, merchantAccountId: account.id, ownerUserId: ctx.user.id, url: input.url, secretCiphertext: encryptWebhookSecret(secret), active: 1 });
      return { id, url: input.url, sellerId: account.externalSellerId, secret };
    }),
    listWebhooks: protectedProcedure.input(sellerRoutingInput).query(async ({ input, ctx }) => {
      const db = await getDb();
      const account = await resolveMerchantAccountForOperator(db, input, ctx.user);
      return db.select({ id: webhookEndpoints.id, url: webhookEndpoints.url, active: webhookEndpoints.active, createdAt: webhookEndpoints.createdAt, updatedAt: webhookEndpoints.updatedAt }).from(webhookEndpoints).where(eq3(webhookEndpoints.merchantAccountId, account.id));
    }),
    retryWebhook: protectedProcedure.input(z2.object({ deliveryId: z2.string().min(1).max(32) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [delivery] = await db.select().from(webhookDeliveries).where(eq3(webhookDeliveries.id, input.deliveryId)).limit(1);
      if (!delivery) throw new TRPCError3({ code: "NOT_FOUND", message: "Webhook delivery not found" });
      const [endpoint] = await db.select().from(webhookEndpoints).where(eq3(webhookEndpoints.id, delivery.endpointId)).limit(1);
      if (!endpoint) throw new TRPCError3({ code: "NOT_FOUND", message: "Webhook endpoint not found" });
      const [account] = await db.select().from(merchantAccounts).where(eq3(merchantAccounts.id, endpoint.merchantAccountId)).limit(1);
      if (!account || ctx.user.role !== "admin" && account.ownerUserId !== ctx.user.id) throw new TRPCError3({ code: "FORBIDDEN", message: "You are not authorized to retry this delivery" });
      return retryWebhookDelivery(db, input.deliveryId);
    }),
    approve: adminProcedure.input(z2.object({ merchantAccountId: z2.string().min(1).max(32) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [accountBeforeApproval] = await db.select().from(merchantAccounts).where(eq3(merchantAccounts.id, input.merchantAccountId)).limit(1);
      if (!accountBeforeApproval) throw new TRPCError3({ code: "NOT_FOUND", message: "Merchant account not found" });
      await db.update(merchantAccounts).set({ status: "active" }).where(eq3(merchantAccounts.id, input.merchantAccountId));
      const [account] = await db.select().from(merchantAccounts).where(eq3(merchantAccounts.id, input.merchantAccountId)).limit(1);
      if (!account) throw new TRPCError3({ code: "NOT_FOUND", message: "Merchant account not found" });
      return account;
    })
  }),
  payments: router({
    createIntent: publicProcedure.input(paymentInput).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const idempotencyKey = input.idempotencyKey ?? input.externalOrderId;
      const amountAtomic = amountToAtomicUsdc(input.amount);
      const orderContext = input.orderContext ? JSON.stringify(input.orderContext) : null;
      const returnUrl = normalizeMarketplaceReturnUrl(input.returnUrl);
      if (input.seller && !resolveLegacyDemoMerchantAccount(input.seller)) await requireSellerApiKey(db, ctx.req, input.seller);
      const merchantAccount = input.seller ? await resolveMerchantAccount(db, input.seller) : null;
      const merchantAddress = merchantAccount?.receivingAddress ?? process.env.ARC_MERCHANT_WALLET_ADDRESS;
      const [existing] = await db.select().from(paymentIntents).where(eq3(paymentIntents.idempotencyKey, idempotencyKey)).limit(1);
      if (existing) {
        try {
          assertIdempotentMatch(existing, { externalOrderId: input.externalOrderId, itemName: input.itemName, amountAtomic });
          if (input.seller && (existing.marketplaceId !== input.seller.marketplaceId || existing.sellerId !== input.seller.sellerId || existing.merchantAccountId !== merchantAccount?.id)) throw new Error("Seller routing mismatch for reused idempotency key");
        } catch (error) {
          throw new TRPCError3({ code: "CONFLICT", message: error instanceof Error ? error.message : "Idempotency mismatch" });
        }
        return { id: existing.id, externalOrderId: existing.externalOrderId, itemName: existing.itemName, buyerLabel: existing.buyerLabel, returnUrl: existing.returnUrl, displayAmount: (Number(existing.amountAtomic) / 1e6).toFixed(6), asset: "USDC", network: "arc-testnet", marketplaceId: existing.marketplaceId, sellerId: existing.sellerId, merchantAccountId: existing.merchantAccountId, merchantAddress: existing.merchantAddress, expiresAt: existing.expiresAt, checkoutUrl: `/checkout/${existing.id}` };
      }
      const id = `pi_${nanoid2(12)}`;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1e3);
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
        expiresAt
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
        asset: "USDC",
        network: "arc-testnet",
        merchantAddress,
        expiresAt,
        checkoutUrl: `/checkout/${id}`
      };
    }),
    reconcileLegacyIntent: protectedProcedure.input(z2.object({ intentId: z2.string().min(1).max(32).optional(), transactionHash: z2.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(), seller: sellerRoutingInput }).refine((value) => Boolean(value.intentId || value.transactionHash), { message: "Provide a Payment Intent ID or transaction hash" })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const account = await resolveMerchantAccountForOperator(db, input.seller, ctx.user);
      let targetIntentId = input.intentId;
      if (!targetIntentId && input.transactionHash) {
        const [transaction2] = await db.select({ paymentIntentId: paymentTransactions.paymentIntentId }).from(paymentTransactions).where(eq3(paymentTransactions.transactionHash, input.transactionHash)).limit(1);
        targetIntentId = transaction2?.paymentIntentId;
      }
      if (!targetIntentId) throw new TRPCError3({ code: "NOT_FOUND", message: "No Payment Intent was found for that transaction" });
      const [intent] = await db.select().from(paymentIntents).where(eq3(paymentIntents.id, targetIntentId)).limit(1);
      if (!intent) throw new TRPCError3({ code: "NOT_FOUND", message: "Payment Intent not found" });
      if (intent.marketplaceId || intent.sellerId || intent.merchantAccountId) throw new TRPCError3({ code: "CONFLICT", message: "Payment Intent is already seller-scoped" });
      if (intent.merchantAddress.toLowerCase() !== account.receivingAddress.toLowerCase()) throw new TRPCError3({ code: "CONFLICT", message: "Legacy payment destination does not match the active seller wallet" });
      const [transaction] = await db.select().from(paymentTransactions).where(eq3(paymentTransactions.paymentIntentId, intent.id)).limit(1);
      if (transaction && transaction.toAddress.toLowerCase() !== account.receivingAddress.toLowerCase()) throw new TRPCError3({ code: "CONFLICT", message: "Observed transaction destination does not match the active seller wallet" });
      await db.update(paymentIntents).set({ marketplaceId: account.marketplaceId, sellerId: account.externalSellerId, merchantAccountId: account.id }).where(and2(eq3(paymentIntents.id, intent.id), isNull(paymentIntents.merchantAccountId)));
      const [updated] = await db.select().from(paymentIntents).where(eq3(paymentIntents.id, intent.id)).limit(1);
      return updated;
    }),
    listIntents: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      const accountIds = await getOperatorMerchantAccountIds(db, ctx.user);
      if (!accountIds.length) return [];
      return db.select().from(paymentIntents).where(inArray(paymentIntents.merchantAccountId, accountIds));
    }),
    verifiedPayments: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      const accountIds = await getOperatorMerchantAccountIds(db, ctx.user);
      if (!accountIds.length) return [];
      return db.select({ id: paymentTransactions.transactionHash, paymentIntentId: paymentTransactions.paymentIntentId, externalOrderId: paymentIntents.externalOrderId, itemName: paymentIntents.itemName, buyerLabel: paymentIntents.buyerLabel, amountAtomic: paymentTransactions.amountAtomic, transactionHash: paymentTransactions.transactionHash, fromAddress: paymentTransactions.fromAddress, toAddress: paymentTransactions.toAddress, finalizedAt: paymentTransactions.finalizedAt, createdAt: paymentIntents.createdAt }).from(paymentTransactions).innerJoin(paymentIntents, eq3(paymentTransactions.paymentIntentId, paymentIntents.id)).where(inArray(paymentIntents.merchantAccountId, accountIds));
    }),
    summary: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      const accountIds = await getOperatorMerchantAccountIds(db, ctx.user);
      if (!accountIds.length) return { availableUsdc: "0.00", grossUsdc: "0.00", pendingUsdc: "0.00", successfulCount: 0, pendingCount: 0, totalCount: 0 };
      const intents = await db.select().from(paymentIntents).where(inArray(paymentIntents.merchantAccountId, accountIds));
      const verifiedRows = await db.select({ amountAtomic: paymentTransactions.amountAtomic, paymentIntentId: paymentTransactions.paymentIntentId }).from(paymentTransactions).innerJoin(paymentIntents, eq3(paymentTransactions.paymentIntentId, paymentIntents.id)).where(inArray(paymentIntents.merchantAccountId, accountIds));
      const pending = intents.filter((intent) => intent.status === "requires_payment" || intent.status === "submitted" || intent.status === "verifying");
      const verifiedSummary = summarizeVerifiedRows(verifiedRows);
      const pendingAtomic = pending.reduce((sum, intent) => sum + BigInt(intent.amountAtomic), BigInt(0));
      return { availableUsdc: (Number(verifiedSummary.totalAtomic) / 1e6).toFixed(2), grossUsdc: (Number(verifiedSummary.totalAtomic) / 1e6).toFixed(2), pendingUsdc: (Number(pendingAtomic) / 1e6).toFixed(2), successfulCount: verifiedSummary.count, pendingCount: pending.length, totalCount: intents.length };
    }),
    getIntent: publicProcedure.input(z2.object({ id: z2.string().min(1) })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [intent] = await db.select().from(paymentIntents).where(eq3(paymentIntents.id, input.id)).limit(1);
      if (!intent) throw new TRPCError3({ code: "NOT_FOUND", message: "Payment Intent not found" });
      return intent;
    }),
    verifyTransfer: publicProcedure.input(z2.object({
      paymentIntentId: z2.string().min(1).max(32),
      transactionHash: z2.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash format")
    })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [intent] = await db.select().from(paymentIntents).where(eq3(paymentIntents.id, input.paymentIntentId)).limit(1);
      if (!intent) throw new TRPCError3({ code: "NOT_FOUND", message: "Payment Intent not found" });
      const [existingTx] = await db.select().from(paymentTransactions).where(eq3(paymentTransactions.transactionHash, input.transactionHash)).limit(1);
      if (existingTx && existingTx.paymentIntentId !== intent.id) {
        throw new TRPCError3({ code: "CONFLICT", message: "Transaction hash already associated with a different Payment Intent" });
      }
      if (intent.status === "succeeded" && existingTx) {
        return {
          paymentIntentId: intent.id,
          transactionHash: existingTx.transactionHash,
          fromAddress: existingTx.fromAddress,
          toAddress: existingTx.toAddress,
          amountAtomic: existingTx.amountAtomic,
          status: "succeeded"
        };
      }
      await db.update(paymentIntents).set({
        status: "verifying",
        transactionHash: input.transactionHash
      }).where(eq3(paymentIntents.id, intent.id));
      let verifiedTransfer;
      try {
        verifiedTransfer = await verifyArcUsdcTransfer(
          input.transactionHash,
          intent.amountAtomic,
          intent.merchantAddress
        );
      } catch (err) {
        await db.update(paymentIntents).set({
          status: "requires_payment"
        }).where(eq3(paymentIntents.id, intent.id));
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: err?.message || "Arc Testnet transfer verification failed"
        });
      }
      const finalizedAt = /* @__PURE__ */ new Date();
      if (!existingTx) {
        await db.insert(paymentTransactions).values({
          paymentIntentId: intent.id,
          transactionHash: verifiedTransfer.transactionHash,
          fromAddress: verifiedTransfer.fromAddress,
          toAddress: verifiedTransfer.toAddress,
          tokenAddress: ARC_USDC_ADDRESS,
          amountAtomic: verifiedTransfer.amountAtomic,
          chainId: ARC_CHAIN_ID,
          finalizedAt
        });
      }
      await db.update(paymentIntents).set({
        status: "succeeded",
        buyerAddress: verifiedTransfer.fromAddress,
        transactionHash: verifiedTransfer.transactionHash
      }).where(eq3(paymentIntents.id, intent.id));
      const [updatedIntent] = await db.select().from(paymentIntents).where(eq3(paymentIntents.id, intent.id)).limit(1);
      const [finalTx] = await db.select().from(paymentTransactions).where(eq3(paymentTransactions.transactionHash, verifiedTransfer.transactionHash)).limit(1);
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
        status: "succeeded"
      };
    }),
    sellerIntents: protectedProcedure.input(sellerRoutingInput).query(async ({ input, ctx }) => {
      const db = await getDb();
      const account = await resolveMerchantAccountForOperator(db, input, ctx.user);
      const intents = await db.select().from(paymentIntents).where(eq3(paymentIntents.merchantAccountId, account.id));
      return filterMerchantRows(intents, account.id);
    }),
    sellerPayments: protectedProcedure.input(sellerRoutingInput).query(async ({ input, ctx }) => {
      const db = await getDb();
      const account = await resolveMerchantAccountForOperator(db, input, ctx.user);
      const payments = await db.select({ id: paymentTransactions.transactionHash, paymentIntentId: paymentTransactions.paymentIntentId, externalOrderId: paymentIntents.externalOrderId, itemName: paymentIntents.itemName, amountAtomic: paymentTransactions.amountAtomic, transactionHash: paymentTransactions.transactionHash, fromAddress: paymentTransactions.fromAddress, toAddress: paymentTransactions.toAddress, finalizedAt: paymentTransactions.finalizedAt, createdAt: paymentIntents.createdAt, merchantAccountId: paymentIntents.merchantAccountId }).from(paymentTransactions).innerJoin(paymentIntents, eq3(paymentTransactions.paymentIntentId, paymentIntents.id)).where(eq3(paymentIntents.merchantAccountId, account.id));
      return filterMerchantRows(payments, account.id);
    }),
    sellerSummary: protectedProcedure.input(sellerRoutingInput).query(async ({ input, ctx }) => {
      const db = await getDb();
      const account = await resolveMerchantAccountForOperator(db, input, ctx.user);
      const intents = await db.select().from(paymentIntents).where(eq3(paymentIntents.merchantAccountId, account.id));
      const verifiedRows = await db.select({ amountAtomic: paymentTransactions.amountAtomic, paymentIntentId: paymentTransactions.paymentIntentId, merchantAccountId: paymentIntents.merchantAccountId }).from(paymentTransactions).innerJoin(paymentIntents, eq3(paymentTransactions.paymentIntentId, paymentIntents.id)).where(eq3(paymentIntents.merchantAccountId, account.id));
      const pending = intents.filter((intent) => intent.status === "requires_payment" || intent.status === "submitted" || intent.status === "verifying");
      const verifiedSummary = summarizeVerifiedRows(filterMerchantRows(verifiedRows, account.id));
      const pendingAtomic = pending.reduce((sum, intent) => sum + BigInt(intent.amountAtomic), BigInt(0));
      return { merchantAccountId: account.id, marketplaceId: account.marketplaceId, sellerId: account.externalSellerId, displayName: account.displayName, receivingAddress: account.receivingAddress, availableUsdc: (Number(verifiedSummary.totalAtomic) / 1e6).toFixed(2), grossUsdc: (Number(verifiedSummary.totalAtomic) / 1e6).toFixed(2), pendingUsdc: (Number(pendingAtomic) / 1e6).toFixed(2), successfulCount: verifiedSummary.count, pendingCount: pending.length, totalCount: intents.length };
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// api/trpc/[...path].src.ts
var serializeCookie = cookieModule.serialize;
function appendSetCookie(res, value) {
  const current = res.getHeader("set-cookie");
  const values = Array.isArray(current) ? current.map(String) : current ? [String(current)] : [];
  res.setHeader("set-cookie", [...values, value]);
}
function createCookieResponse(res) {
  return {
    cookie(name, value, options = {}) {
      appendSetCookie(res, serializeCookie(name, value, {
        ...options,
        sameSite: options.sameSite ?? "lax"
      }));
    },
    clearCookie(name, options = {}) {
      appendSetCookie(res, serializeCookie(name, "", {
        ...options,
        maxAge: 0,
        sameSite: options.sameSite ?? "lax"
      }));
    }
  };
}
function normalizeRequest(req) {
  const normalized = Object.create(req);
  const originalUrl = req.url ?? "/";
  const strippedUrl = originalUrl.replace(/^\/api\/trpc(?=\/|$)/, "").replace(/^\/trpc(?=\/|$)/, "");
  normalized.url = strippedUrl || "/";
  normalized.protocol = String(req.headers["x-forwarded-proto"] ?? "https").split(",")[0].trim();
  normalized.hostname = (req.headers.host ?? "").split(":")[0] || void 0;
  return normalized;
}
var trpcHandler = createHTTPHandler({
  router: appRouter,
  basePath: "/",
  createContext: ({ req, res }) => createContext({
    req,
    res: createCookieResponse(res),
    info: {}
  })
});
function safeErrorMessage(error) {
  if (!(error instanceof Error)) return "Unknown tRPC bootstrap error";
  return error.message.replace(/\s+/g, " ").slice(0, 240) || "Unknown tRPC bootstrap error";
}
async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("access-control-allow-origin", req.headers.origin ?? "*");
    res.setHeader("access-control-allow-headers", "content-type, authorization, x-trpc-source");
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.end();
    return;
  }
  try {
    return trpcHandler(normalizeRequest(req), res);
  } catch (error) {
    console.error("[Vercel tRPC bootstrap] failed", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        error: {
          message: "Druto tRPC bootstrap failed",
          code: -32603,
          data: {
            code: "INTERNAL_SERVER_ERROR",
            httpStatus: 500,
            path: typeof req.url === "string" ? req.url.split("?")[0] : void 0,
            detail: safeErrorMessage(error)
          }
        }
      }));
    }
  }
}
export {
  handler as default
};
