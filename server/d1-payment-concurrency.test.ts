import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { withD1 } from './d1-db';
import { d1Router } from './d1-router';
import { hashApiKey } from './api-keys';
import { encryptWebhookSecret } from './webhooks';
import { claimD1Webhook, finishD1Webhook } from './d1-webhook-lease';
import { sendD1Webhook, drainD1WebhookOutbox } from './d1-webhook-drain';
import { postWorkerWebhook } from './webhook-transport';

// No RPC, wallet or HTTP side effect: only the outbound transport is mocked.
vi.mock('./webhook-transport', () => ({ postWorkerWebhook: vi.fn() }));
const { DatabaseSync: SQLiteDatabase } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
let sqlite: DatabaseSync;
let waitForInitialReads: undefined | (() => Promise<void>);
let uniqueInsertFailures: number;
function statement(sql: string, values: SQLInputValue[] = []): any {
  return {
    bind: (...parameters: SQLInputValue[]) => statement(sql, parameters),
    run: async () => {
      try { return { success: true, meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; }
      catch (error) {
        if (String(error).includes('UNIQUE constraint failed: paymentIntents.idempotencyKey')) uniqueInsertFailures++;
        throw error;
      }
    },
    raw: async () => {
      const rows = sqlite.prepare(sql).all(...values).map(row => Object.values(row));
      // Force overlapping requests to observe absence before any can insert.
      if (/^select[\s\S]*from "paymentIntents"[\s\S]*where[\s\S]*idempotencyKey/i.test(sql)) {
        await waitForInitialReads?.();
      }
      return rows;
    },
    all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
    first: async () => sqlite.prepare(sql).get(...values) ?? null,
  };
}
const binding = {
  prepare: statement,
  async batch(items: any[]) {
    sqlite.exec('BEGIN');
    try { const results = []; for (const item of items) results.push(await item.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
const run = <T>(work: () => Promise<T>) => withD1(binding as never, work);
function raceInitialReads(count: number) {
  let arrived = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  waitForInitialReads = async () => {
    if (++arrived === count) { waitForInitialReads = undefined; release(); }
    await gate;
  };
}
const input = (sellerId = 'seller-a', amount = '2') => ({
  seller: { marketplaceId: 'fixture-market', sellerId },
  externalOrderId: 'fixture-order', idempotencyKey: 'fixture-order', itemName: 'Fixture', amount,
});
const caller = (key = 'fixture-api-a') => d1Router.createCaller({
  req: { headers: { authorization: `Bearer ${key}` } }, res: {}, user: null,
} as never);
const delivery = () => sqlite.prepare("SELECT * FROM webhookDeliveries WHERE id='delivery'").get()!;
function seedDelivery() {
  sqlite.prepare(`INSERT INTO webhookEndpoints(id,marketplaceId,ownerUserId,url,urlHash,secretCiphertext)
    VALUES ('endpoint','fixture-market',1,'https://fixture.invalid/hook','fixture-url',?)`).run(encryptWebhookSecret('fixture-webhook-secret'));
  sqlite.exec(`INSERT INTO webhookDeliveries(id,endpointId,eventId,eventType,paymentIntentId,payload,signature)
    VALUES ('delivery','endpoint','event-stable','payment.verified','fixture-intent','{"id":"event-stable"}','unused');`);
}
beforeEach(() => {
  sqlite = new SQLiteDatabase(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of ['0000_cool_tempest.sql','0001_dashboard_sessions.sql','0002_reconciliation_indexes.sql']) sqlite.exec(readFileSync(`drizzle-d1/${file}`, 'utf8'));
  sqlite.exec("INSERT INTO users(id,openId) VALUES(1,'fixture-owner')");
  for (const suffix of ['a','b']) {
    sqlite.prepare(`INSERT INTO merchantAccounts(id,marketplaceId,externalSellerId,ownerUserId,displayName,receivingAddress,status,walletVerifiedAt)
      VALUES (?,'fixture-market',?,1,'Fixture','0x1111111111111111111111111111111111111111','active',1)`).run(`merchant-${suffix}`, `seller-${suffix}`);
    sqlite.prepare(`INSERT INTO apiKeys(id,ownerUserId,name,prefix,lastFour,merchantAccountId,marketplaceId,sellerId,secretHash)
      VALUES (?,1,'Fixture','fixture','0000',?,'fixture-market',?,?)`).run(`key-${suffix}`, `merchant-${suffix}`, `seller-${suffix}`, hashApiKey(`fixture-api-${suffix}`));
  }
  vi.stubEnv('DRUTO_API_URL', 'https://druto.fixture.invalid');
  vi.stubEnv('DRUTO_WEBHOOK_ENCRYPTION_KEY', '11'.repeat(32));
  uniqueInsertFailures = 0; waitForInitialReads = undefined;
});
afterEach(() => { sqlite.close(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe('D1 checkout concurrency with real unique constraints', () => {
  it('returns the same persisted intent to twenty competing identical requests', async () => run(async () => {
    raceInitialReads(20);
    const results = await Promise.all(Array.from({ length: 20 }, () => caller().payments.createIntent(input())));
    expect(uniqueInsertFailures).toBe(19); // Proves the insert-race path was exercised.
    for (const result of results) expect(result).toEqual(results[0]);
    expect(sqlite.prepare('SELECT count(*) AS n FROM paymentIntents').get()?.n).toBe(1);
    expect(results[0]).toMatchObject({ amountAtomic: '2000000', platformFeeBps: 0 });
    expect(postWorkerWebhook).not.toHaveBeenCalled();
  }));
  it('rejects conflicting concurrent amounts without mutating the winning intent', async () => run(async () => {
    raceInitialReads(2);
    const results = await Promise.allSettled([caller().payments.createIntent(input()), caller().payments.createIntent(input('seller-a','3'))]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.code).toBe('CONFLICT');
    const winner = (results.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<any>).value;
    expect(sqlite.prepare('SELECT amountAtomic FROM paymentIntents').get()?.amountAtomic).toBe(winner.amountAtomic);
    expect(uniqueInsertFailures).toBe(1);
  }));
  it('isolates identical keys by seller and forbids cross-seller credentials', async () => run(async () => {
    raceInitialReads(2);
    const [a,b] = await Promise.all([caller().payments.createIntent(input()), caller('fixture-api-b').payments.createIntent(input('seller-b'))]);
    expect(a.id).not.toBe(b.id);
    await expect(caller().payments.createIntent(input('seller-b'))).rejects.toMatchObject({ code:'FORBIDDEN' });
    expect(sqlite.prepare('SELECT count(*) AS n FROM paymentIntents').get()?.n).toBe(2);
  }));
});

describe('D1 webhook lease and retry with real conditional updates', () => {
  it('allows one sender while twenty calls overlap during an active lease', async () => run(async () => {
    seedDelivery();
    let finish!: (value: any) => void;
    vi.mocked(postWorkerWebhook).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const sends = Array.from({ length:20 }, () => sendD1Webhook('delivery'));
    // Let the sole claimant reach the held transport before releasing it.
    await vi.waitFor(() => expect(postWorkerWebhook).toHaveBeenCalledOnce());
    finish({ ok:true, status:200 });
    const results = await Promise.all(sends);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.filter(result => result.skipped)).toHaveLength(19);
    expect(delivery()).toMatchObject({ attempts:1, status:'succeeded' });
    expect((await sendD1Webhook('delivery', true)).skipped).toBe(true);
    expect(postWorkerWebhook).toHaveBeenCalledOnce();
  }));
  it('honors retry due time and keeps event identity/payload stable after HTTP failure', async () => run(async () => {
    seedDelivery(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T00:00:00Z'));
    vi.mocked(postWorkerWebhook).mockResolvedValueOnce({ok:false,status:503,error:'Fixture unavailable'}).mockResolvedValue({ok:true,status:200});
    expect((await sendD1Webhook('delivery')).ok).toBe(false);
    const retryAt = Number(delivery().nextAttemptAt);
    vi.setSystemTime(retryAt - 1);
    expect((await sendD1Webhook('delivery')).skipped).toBe(true);
    vi.setSystemTime(retryAt);
    expect((await sendD1Webhook('delivery')).ok).toBe(true);
    expect(postWorkerWebhook).toHaveBeenCalledTimes(2);
    expect(vi.mocked(postWorkerWebhook).mock.calls[1]).toEqual(vi.mocked(postWorkerWebhook).mock.calls[0]);
    expect(delivery()).toMatchObject({attempts:2,status:'succeeded',nextAttemptAt:null});
  }));
  it('fences a stale claimant after lease expiry and reclamation', async () => run(async () => {
    seedDelivery(); const now = new Date('2026-10-11T00:00:00Z');
    const old = (await claimD1Webhook(binding, 'delivery', now))!;
    expect(await claimD1Webhook(binding, 'delivery', new Date(old.leaseUntil - 1), true)).toBeNull();
    const newer = (await claimD1Webhook(binding, 'delivery', new Date(old.leaseUntil)))!;
    expect(await finishD1Webhook(binding, old, {ok:true}, new Date(old.leaseUntil + 1))).toBe(false);
    expect(delivery()).toMatchObject({status:'pending',attempts:2});
    expect(await finishD1Webhook(binding, newer, {ok:true}, new Date(old.leaseUntil + 2))).toBe(true);
  }));
  it('retries with the same event after remote acceptance but failed local acknowledgement', async () => run(async () => {
    seedDelivery(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T00:00:00Z'));
    vi.mocked(postWorkerWebhook).mockResolvedValue({ok:true,status:200});
    sqlite.exec(`CREATE TRIGGER fail_ack BEFORE UPDATE OF status ON webhookDeliveries
      WHEN NEW.status='succeeded' BEGIN SELECT RAISE(ABORT,'Injected acknowledgement failure'); END`);
    await expect(sendD1Webhook('delivery')).rejects.toThrow();
    expect(delivery()).toMatchObject({status:'pending',attempts:1});
    const leaseEnd = Number(delivery().nextAttemptAt);
    sqlite.exec('DROP TRIGGER fail_ack'); vi.setSystemTime(leaseEnd);
    expect((await sendD1Webhook('delivery')).ok).toBe(true);
    expect(postWorkerWebhook).toHaveBeenCalledTimes(2);
    expect(vi.mocked(postWorkerWebhook).mock.calls[1]).toEqual(vi.mocked(postWorkerWebhook).mock.calls[0]);
  }));
  it('caps automatic retries at ten and requires explicit manual retry after exhaustion', async () => run(async () => {
    seedDelivery(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T00:00:00Z'));
    vi.mocked(postWorkerWebhook).mockResolvedValue({ok:false,status:503,error:'Fixture unavailable'});
    for (let n=1;n<=10;n++) {
      expect((await sendD1Webhook('delivery')).ok).toBe(false);
      expect(delivery().attempts).toBe(n);
      if (n<10) vi.setSystemTime(Number(delivery().nextAttemptAt));
    }
    expect(delivery()).toMatchObject({status:'failed',nextAttemptAt:null});
    expect(await drainD1WebhookOutbox()).toEqual({selected:0,delivered:0});
    expect((await sendD1Webhook('delivery')).skipped).toBe(true);
    vi.mocked(postWorkerWebhook).mockResolvedValue({ok:true,status:200});
    expect((await sendD1Webhook('delivery',true)).ok).toBe(true);
    expect(delivery()).toMatchObject({status:'succeeded',attempts:11});
  }));
});
