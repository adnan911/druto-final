import { createHash, randomBytes } from "node:crypto";
import { parse as parseCookie } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import { getD1Binding } from "./d1-db";

export const D1_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;

export function readD1SessionToken(cookieHeader: string | undefined): string | undefined {
  const token = parseCookie(cookieHeader || "")[COOKIE_NAME];
  // Old signed JWTs deliberately do not qualify for the D1 session store.
  return typeof token === "string" && /^d1s_[a-f0-9]{64}$/.test(token) ? token : undefined;
}

export function hashD1SessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createD1Session(userId: number, previousToken?: string) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("Invalid session user");
  const token = `d1s_${randomBytes(32).toString("hex")}`;
  const now = Date.now();
  const expiresAt = now + D1_SESSION_LIFETIME_MS;
  const db = getD1Binding();
  const statements = [db.prepare(`INSERT INTO dashboardSessions
    (tokenHash, userId, createdAt, expiresAt, revokedAt) VALUES (?, ?, ?, ?, NULL)`)
    .bind(hashD1SessionToken(token), userId, now, expiresAt)];
  if (previousToken) {
    statements.push(db.prepare(`UPDATE dashboardSessions SET revokedAt = ?
      WHERE tokenHash = ? AND revokedAt IS NULL`).bind(now, hashD1SessionToken(previousToken)));
  }
  // Replace a browser's previous session only if the new session is durable.
  await db.batch(statements);
  return { token, expiresAt };
}

export async function revokeD1Session(token: string | undefined) {
  if (!token) return;
  // Do not clear the cookie or report success until revocation is durable.
  await getD1Binding().prepare(`UPDATE dashboardSessions SET revokedAt = ?
    WHERE tokenHash = ? AND revokedAt IS NULL`).bind(Date.now(), hashD1SessionToken(token)).run();
}
