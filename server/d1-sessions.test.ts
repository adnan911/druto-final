import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { COOKIE_NAME } from "@shared/const";
import { withD1, checkD1Readiness } from "./d1-db";
import { cleanupD1Sessions, D1_SESSION_RETENTION_MS, D1_SESSION_CLEANUP_LIMIT, createD1Session, D1_SESSION_LIFETIME_MS, hashD1SessionToken, readD1SessionToken, revokeD1Session } from "./d1-sessions";
import { createD1Context } from "./d1-context";
import { d1Router } from "./d1-router";

// Exercise the real migrations and generated SQL. Hosted D1 is separately
// checked with Wrangler smoke tests; this adapter is only an in-memory fixture.
let sqlite: DatabaseSync;
// Vitest 2's module loader predates this Node builtin.
const { DatabaseSync: SQLiteDatabase } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
function statement(sql: string, parameters: SQLInputValue[] = []): any {
  return {
    bind: (...values: SQLInputValue[]) => statement(sql, values),
    run: async () => ({ success: true, meta: { changes: Number(sqlite.prepare(sql).run(...parameters).changes) } }),
    raw: async () => sqlite.prepare(sql).all(...parameters).map(row => Object.values(row)),
    all: async () => ({ results: sqlite.prepare(sql).all(...parameters) }),
  };
}
const binding = {
  prepare: statement,
  async batch(statements: any[]) {
    sqlite.exec("BEGIN");
    try {
      const result = [];
      for (const item of statements) result.push(await item.run());
      sqlite.exec("COMMIT");
      return result;
    } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  },
};
const run = <T>(work: () => Promise<T>) => withD1(binding as never, work);
const cookie = (token: string) => `${COOKIE_NAME}=${token}`;
async function context(token?: string, authorization?: string) {
  return createD1Context({ req: { headers: { cookie: token && cookie(token), authorization } },
    res: { clearCookie: vi.fn() } } as never);
}

beforeEach(() => {
  sqlite = new SQLiteDatabase(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of ["0000_cool_tempest.sql", "0001_dashboard_sessions.sql"]) {
    sqlite.exec(readFileSync(`drizzle-d1/${file}`, "utf8"));
  }
  sqlite.exec("INSERT INTO users (id, openId, name, loginMethod) VALUES (1, 'wallet-one', 'One', 'wallet'), (2, 'wallet-two', 'Two', 'wallet')");
});
afterEach(() => { sqlite.close(); vi.useRealTimers(); });

describe("D1 revocable dashboard sessions", () => {
  it("drains a 10,000-row backlog in bounded batches while preserving 10,000 unexpired rows", async () => run(async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-11T00:00:00Z"));
    const cutoff = Date.now() - D1_SESSION_RETENTION_MS;
    const insert = sqlite.prepare("INSERT INTO dashboardSessions VALUES (?, 1, ?, ?, ?)");
    sqlite.exec("BEGIN");
    for (let i = 0; i < 10_000; i++) {
      insert.run(`backlog-${i}`, cutoff - D1_SESSION_LIFETIME_MS - i, cutoff - i, i % 2 ? cutoff - i : null);
      insert.run(`unexpired-${i}`, Date.now(), Date.now() + D1_SESSION_LIFETIME_MS, null);
    }
    sqlite.exec("COMMIT");
    const active = await createD1Session(1);
    const survivorDigest = () => sqlite.prepare("SELECT tokenHash, expiresAt, revokedAt FROM dashboardSessions WHERE expiresAt > ? ORDER BY tokenHash").all(cutoff);
    const survivorsBefore = survivorDigest();
    for (let batch = 0; batch < 100; batch++) {
      expect(await cleanupD1Sessions()).toEqual({ deleted: 100, limitReached: true });
      if (batch === 0) {
        // Oldest first: the newest eligible fixture must wait for a later batch.
        expect(sqlite.prepare("SELECT 1 FROM dashboardSessions WHERE tokenHash='backlog-0'").get()).toBeDefined();
        expect(sqlite.prepare("SELECT 1 FROM dashboardSessions WHERE tokenHash='backlog-9999'").get()).toBeUndefined();
      }
    }
    expect(await cleanupD1Sessions()).toEqual({ deleted: 0, limitReached: false });
    expect(survivorDigest()).toEqual(survivorsBefore);
    expect((await context(active.token)).user?.id).toBe(1);
  }));

  it("rolls back a mid-batch database failure and safely retries after recovery", async () => run(async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-11T00:00:00Z"));
    const cutoff = Date.now() - D1_SESSION_RETENTION_MS;
    const insert = sqlite.prepare("INSERT INTO dashboardSessions VALUES (?, 1, 0, ?, NULL)");
    for (let i = 0; i < 100; i++) insert.run(`failure-${i}`, cutoff);
    const active = await createD1Session(1);
    // Abort after ten deletions within one statement, not before it starts.
    sqlite.exec(`CREATE TRIGGER fail_cleanup BEFORE DELETE ON dashboardSessions
      WHEN (SELECT count(*) FROM dashboardSessions WHERE expiresAt <= ${cutoff}) = 90
      BEGIN SELECT RAISE(ABORT, 'Injected cleanup failure'); END`);
    await expect(cleanupD1Sessions()).rejects.toThrow('Injected cleanup failure');
    expect(sqlite.prepare("SELECT count(*) AS n FROM dashboardSessions WHERE expiresAt <= ?").get(cutoff)?.n).toBe(100);
    expect((await context(active.token)).user?.id).toBe(1);
    sqlite.exec("DROP TRIGGER fail_cleanup");
    expect(await cleanupD1Sessions()).toEqual({ deleted: 100, limitReached: true });
    expect(await cleanupD1Sessions()).toEqual({ deleted: 0, limitReached: false });
    expect((await context(active.token)).user?.id).toBe(1);
  }));

  it("cleans only rows past retention, with a bounded restartable batch", async () => run(async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-11T00:00:00Z"));
    const cutoff = Date.now() - D1_SESSION_RETENTION_MS;
    const insert = sqlite.prepare("INSERT INTO dashboardSessions VALUES (?, 1, ?, ?, ?)");
    for (let i = 0; i < D1_SESSION_CLEANUP_LIMIT + 1; i++) {
      insert.run(`old-${i}`, cutoff - D1_SESSION_LIFETIME_MS, cutoff, i % 2 ? cutoff - 100 : null);
    }
    insert.run("recent-expired", cutoff, cutoff + 1, null);
    insert.run("recent-revoked", Date.now(), Date.now() + D1_SESSION_LIFETIME_MS, Date.now());
    const active = await createD1Session(1);
    expect(await cleanupD1Sessions()).toEqual({ deleted: 100, limitReached: true });
    expect(await cleanupD1Sessions()).toEqual({ deleted: 1, limitReached: false });
    expect(await cleanupD1Sessions()).toEqual({ deleted: 0, limitReached: false });
    expect(sqlite.prepare("SELECT count(*) AS n FROM dashboardSessions").get()?.n).toBe(3);
    expect((await context(active.token)).user?.id).toBe(1);
    expect(sqlite.prepare("SELECT count(*) AS n FROM users").get()?.n).toBe(2);
    const plan = sqlite.prepare("EXPLAIN QUERY PLAN SELECT tokenHash FROM dashboardSessions WHERE expiresAt <= ? ORDER BY expiresAt LIMIT ?").all(cutoff, 100);
    expect(JSON.stringify(plan)).toContain("dashboardSessions_expiry_idx");
  }));

  it("does not revive a revoked token after deleting its retained row", async () => run(async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    const session = await createD1Session(1);
    await revokeD1Session(session.token);
    vi.setSystemTime(session.expiresAt + D1_SESSION_RETENTION_MS);
    expect(await cleanupD1Sessions()).toEqual({ deleted: 1, limitReached: false });
    expect((await context(session.token)).user).toBeNull();
    sqlite.exec("DROP TABLE dashboardSessions");
    await expect(cleanupD1Sessions()).rejects.toThrow();
  }));

  it("persists only a token hash with a 24-hour absolute expiry", async () => run(async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-10T00:00:00Z"));
    const session = await createD1Session(1);
    expect(session.token).toMatch(/^d1s_[a-f0-9]{64}$/);
    const row = sqlite.prepare("SELECT * FROM dashboardSessions").get();
    expect(row).toMatchObject({ tokenHash: hashD1SessionToken(session.token), userId: 1,
      createdAt: Date.now(), expiresAt: Date.now() + D1_SESSION_LIFETIME_MS, revokedAt: null });
    expect(JSON.stringify(row)).not.toContain(session.token);
    expect((await context(session.token)).user?.openId).toBe("wallet-one");
    vi.setSystemTime(session.expiresAt - 1);
    expect((await context(session.token)).user?.id).toBe(1);
    vi.setSystemTime(session.expiresAt);
    expect((await context(session.token)).user).toBeNull();
  }));

  it("rejects a copied token after logout while other sessions remain valid", async () => run(async () => {
    const first = await createD1Session(1);
    const other = await createD1Session(1);
    const ctx = await context(first.token);
    expect(await d1Router.createCaller(ctx as never).auth.logout()).toEqual({ success: true });
    expect(ctx.res.clearCookie).toHaveBeenCalled();
    expect((await context(first.token)).user).toBeNull();
    expect((await context(other.token)).user?.id).toBe(1);
    await revokeD1Session(first.token); // idempotent repeated logout
    expect((await context(first.token)).user).toBeNull();
  }));

  it("rotates the browser token after a new login without revoking other devices", async () => run(async () => {
    const old = await createD1Session(1);
    const otherDevice = await createD1Session(1);
    const next = await createD1Session(2, old.token);
    expect(next.token).not.toBe(old.token);
    expect((await context(old.token)).user).toBeNull();
    expect((await context(next.token)).user?.id).toBe(2);
    expect((await context(otherDevice.token)).user?.id).toBe(1);
  }));

  it("rolls back session creation on failure and keeps the previous session valid", async () => run(async () => {
    const old = await createD1Session(1);
    await expect(createD1Session(999, old.token)).rejects.toThrow();
    expect((await context(old.token)).user?.id).toBe(1);
    expect(sqlite.prepare("SELECT count(*) AS n FROM dashboardSessions").get()?.n).toBe(1);
  }));

  it("rejects malformed, unknown, legacy JWT and bearer-only session credentials", async () => run(async () => {
    for (const token of [undefined, "eyJhbGciOiJIUzI1NiJ9.legacy.signature", "d1s_bad", `d1s_${"0".repeat(64)}`]) {
      expect((await context(token)).user).toBeNull();
    }
    const session = await createD1Session(1);
    expect((await context(undefined, `Bearer ${session.token}`)).user).toBeNull();
    expect(readD1SessionToken(`${COOKIE_NAME}=%FF`)).toBeUndefined();
  }));

  it("fails closed on database failure and never reports a successful logout", async () => run(async () => {
    const session = await createD1Session(1);
    const ctx = await context(session.token);
    sqlite.exec("DROP TABLE dashboardSessions");
    await expect(context(session.token)).rejects.toThrow();
    await expect(d1Router.createCaller(ctx as never).auth.logout()).rejects.toThrow();
    expect(ctx.res.clearCookie).not.toHaveBeenCalled();
    await expect(checkD1Readiness()).rejects.toThrow("D1 schema is incomplete");
  }));

  it("does not authenticate a deleted user", async () => run(async () => {
    const session = await createD1Session(1);
    sqlite.exec("DELETE FROM users WHERE id = 1");
    expect((await context(session.token)).user).toBeNull();
    expect(sqlite.prepare("SELECT count(*) AS n FROM dashboardSessions").get()?.n).toBe(0);
  }));
});
