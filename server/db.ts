import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { drizzle as drizzleTiDb } from "drizzle-orm/tidb-serverless";
import { connect } from "@tidbcloud/serverless";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

import mysql from "mysql2/promise";
import { AsyncLocalStorage } from "node:async_hooks";
import { assertDatabaseTarget } from "./db-target";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: ReturnType<typeof mysql.createPool> | null = null;

type WorkerDbContext = {
  url: string;
  client?: ReturnType<typeof connect>;
  db?: ReturnType<typeof drizzle>;
};
const workerDbContext = new AsyncLocalStorage<WorkerDbContext>();

function assertTiDbHttpTarget(connectionUrl: string): void {
  let url: URL;
  try { url = new URL(connectionUrl); }
  catch { throw new Error("Cloudflare TiDB URL is invalid"); }
  if (url.protocol !== "mysql:" || url.pathname !== "/druto_testnet" ||
      url.port !== "4000" || !url.hostname.toLowerCase().endsWith(".tidbcloud.com") ||
      !decodeURIComponent(url.username).endsWith(".druto_app") || !url.password ||
      url.search || url.hash) {
    throw new Error("Cloudflare TiDB HTTP driver must use the restricted druto_testnet app identity");
  }
}

/** TiDB's HTTPS driver is scoped to one Worker invocation. */
export async function withTiDbHttp<T>(connectionUrl: string, work: () => Promise<T>): Promise<T> {
  assertTiDbHttpTarget(connectionUrl);
  return workerDbContext.run({ url: connectionUrl }, work);
}

function getWorkerDb(context: WorkerDbContext): ReturnType<typeof drizzle> {
  context.client ??= connect({ url: context.url });
  context.db ??= drizzleTiDb({ client: context.client }) as unknown as ReturnType<typeof drizzle>;
  return context.db;
}

// Operational auth and payment state must always use the configured SQL database.
export async function getDb(): Promise<ReturnType<typeof drizzle> | null> {
  const workerContext = workerDbContext.getStore();
  if (workerContext) return getWorkerDb(workerContext);
  const databaseUrl = process.env.DATABASE_URL;
  assertDatabaseTarget(databaseUrl);
  if (!_db) {
    const isSslNeeded = process.env.NODE_ENV === "production" ||
      databaseUrl!.includes("tidb") ||
      databaseUrl!.includes("ssl") ||
      databaseUrl!.includes("aivencloud") ||
      databaseUrl!.includes("planetscale");

    _pool = mysql.createPool({
      uri: databaseUrl,
      ssl: isSslNeeded ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    _db = drizzle(_pool as any);
  }
  return _db;
}

/** Probe the actual SQL session; pool construction alone is not readiness. */
export async function checkDatabaseReadiness(): Promise<void> {
  const workerContext = workerDbContext.getStore();
  await getDb();
  const tables = ["apiKeys", "merchantAccounts", "ownershipChallenges", "paymentIntents", "paymentTransactions", "users", "walletLoginChallenges", "webhookDeliveries", "webhookEndpoints"];
  if (workerContext) {
    const client = workerContext.client!;
    const identity = await client.execute("SELECT DATABASE() AS databaseName, CURRENT_USER() AS currentUser") as unknown as Array<{
      databaseName?: string;
      currentUser?: string;
    }>;
    if (identity[0]?.databaseName !== "druto_testnet" ||
        !String(identity[0]?.currentUser ?? "").split("@")[0].endsWith(".druto_app")) {
      throw new Error("Database identity verification failed");
    }
    for (const table of tables) await client.execute(`SELECT 1 FROM \`${table}\` LIMIT 0`);
    return;
  }
  if (!workerContext && !_pool) throw new Error("Database pool unavailable");
  const connection = await _pool!.getConnection();
  try {
    const [identity] = await connection.query<mysql.RowDataPacket[]>("SELECT DATABASE() AS databaseName, CURRENT_USER() AS currentUser");
    const [tls] = await connection.query<mysql.RowDataPacket[]>("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
    if (process.env.NODE_ENV === "production" && (
      identity[0]?.databaseName !== "druto_testnet" ||
      !String(identity[0]?.currentUser ?? "").split("@")[0].endsWith(".druto_app") ||
      !tls[0]?.Value
    )) throw new Error("Database identity or TLS verification failed");
    for (const table of tables) {
      await connection.query(`SELECT 1 FROM \`${table}\` LIMIT 0`);
    }
  } finally {
    (connection as mysql.PoolConnection).release();
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "profileImage", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.
