import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

import mysql from "mysql2/promise";
import { AsyncLocalStorage } from "node:async_hooks";
import { assertDatabaseTarget } from "./db-target";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: ReturnType<typeof mysql.createPool> | null = null;

export type HyperdriveCredentials = {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
};
type WorkerDbContext = {
  credentials: HyperdriveCredentials;
  connection?: mysql.Connection;
  dbPromise?: Promise<ReturnType<typeof drizzle>>;
};
const workerDbContext = new AsyncLocalStorage<WorkerDbContext>();

function assertHyperdriveTarget(credentials: HyperdriveCredentials): void {
  if (credentials.database !== "druto_testnet" ||
      !credentials.user.endsWith(".druto_app") ||
      !credentials.password || !credentials.host || !Number.isInteger(credentials.port)) {
    throw new Error("Cloudflare Hyperdrive must use the restricted druto_testnet app identity");
  }
}

/** One MySQL connection per Worker invocation; Hyperdrive owns the underlying pool. */
export async function withHyperdrive<T>(credentials: HyperdriveCredentials, work: () => Promise<T>): Promise<T> {
  assertHyperdriveTarget(credentials);
  const context: WorkerDbContext = { credentials };
  return workerDbContext.run(context, async () => {
    try { return await work(); }
    finally { if (context.connection) await context.connection.end(); }
  });
}

async function getWorkerDb(context: WorkerDbContext): Promise<ReturnType<typeof drizzle>> {
  context.dbPromise ??= (async () => {
    const connection = await mysql.createConnection({
      host: context.credentials.host,
      user: context.credentials.user,
      password: context.credentials.password,
      database: context.credentials.database,
      port: context.credentials.port,
      disableEval: true,
    });
    context.connection = connection;
    return drizzle(connection as any);
  })();
  return context.dbPromise;
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
  if (!workerContext && !_pool) throw new Error("Database pool unavailable");
  const connection = workerContext ? workerContext.connection! : await _pool!.getConnection();
  try {
    const [identity] = await connection.query<mysql.RowDataPacket[]>("SELECT DATABASE() AS databaseName, CURRENT_USER() AS currentUser");
    const [tls] = await connection.query<mysql.RowDataPacket[]>("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
    if ((workerContext || process.env.NODE_ENV === "production") && (
      identity[0]?.databaseName !== "druto_testnet" ||
      !String(identity[0]?.currentUser ?? "").split("@")[0].endsWith(".druto_app") ||
      !tls[0]?.Value
    )) throw new Error("Database identity or TLS verification failed");
    for (const table of ["apiKeys", "merchantAccounts", "ownershipChallenges", "paymentIntents", "paymentTransactions", "users", "walletLoginChallenges", "webhookDeliveries", "webhookEndpoints"]) {
      await connection.query(`SELECT 1 FROM \`${table}\` LIMIT 0`);
    }
  } finally {
    if (!workerContext) (connection as mysql.PoolConnection).release();
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
