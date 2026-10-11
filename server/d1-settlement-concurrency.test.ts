import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { withD1 } from './d1-db';
import { d1Router } from './d1-router';
import { verifyArcUsdcTransfer } from './arc';

// Exercise the real router, SQL, triggers and outbox builder. Chain evidence is
// synthetic: these tests do not assert receipt/signature verification correctness.
vi.mock('./arc', async original => ({
  ...await original<typeof import('./arc')>(), verifyArcUsdcTransfer: vi.fn(),
}));
const { DatabaseSync: SQLiteDatabase } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const recipient = '0x1111111111111111111111111111111111111111';
const buyer = '0x2222222222222222222222222222222222222222';
const hashA = `0x${'a'.repeat(64)}`;
const hashB = `0x${'b'.repeat(64)}`;
let sqlite: DatabaseSync;
let batchFailures: number;
let loseCommitAcknowledgement: boolean;
function statement(sql: string, values: SQLInputValue[] = []): any {
  return {
    bind: (...parameters: SQLInputValue[]) => statement(sql, parameters),
    execute: () => ({ success: true, meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
    run: async () => statement(sql, values).execute(),
    raw: async () => sqlite.prepare(sql).all(...values).map(row => Object.values(row)),
    all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
    first: async () => sqlite.prepare(sql).get(...values) ?? null,
  };
}
const binding = {
  prepare: statement,
  async batch(items: any[]) {
    // Execute synchronously inside BEGIN/COMMIT. No other request can see a
    // partially executed batch through this single-connection SQLite adapter.
    sqlite.exec('BEGIN');
    let results;
    try { results = items.map(item => item.execute()); sqlite.exec('COMMIT'); }
    catch (error) { sqlite.exec('ROLLBACK'); batchFailures++; throw error; }
    if (loseCommitAcknowledgement) {
      loseCommitAcknowledgement = false;
      throw new Error('Injected lost response after durable commit');
    }
    return results;
  },
};
const run = <T>(work: () => Promise<T>) => withD1(binding as never, work);
const verify = (id = 'pi_fixture_a', hash = hashA) => d1Router.createCaller({
  req: { headers: {} }, res: {}, user: null,
} as never).payments.verifyTransfer({ paymentIntentId: id, transactionHash: hash });
const rows = (table: string) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
const state = () => ({ intents: rows('paymentIntents'), transactions: rows('paymentTransactions'), outbox: rows('webhookDeliveries') });
const verified = (transactionHash = hashA) => ({ transactionHash, fromAddress: buyer,
  toAddress: recipient, amountAtomic: '2000000', platformFeeAmount: '0', isSplit: false,
});
function raceVerification(count: number) {
  let arrived = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  vi.mocked(verifyArcUsdcTransfer).mockImplementation(async hash => {
    if (++arrived === count) release();
    await gate;
    return verified(hash) as any;
  });
}
function seedIntent(id: string) {
  sqlite.prepare(`INSERT INTO paymentIntents(id,externalOrderId,merchantAccountId,marketplaceId,sellerId,
    itemName,amountAtomic,merchantAddress,expiresAt) VALUES (?,?,'merchant','market','seller','Fixture','2000000',?,?)`)
    .run(id, id, recipient, Date.now() + 60000);
}
beforeEach(() => {
  sqlite = new SQLiteDatabase(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  for (const migration of ['0000_cool_tempest.sql', '0001_dashboard_sessions.sql']) {
    sqlite.exec(readFileSync(`drizzle-d1/${migration}`, 'utf8'));
  }
  sqlite.exec(`INSERT INTO users(id,openId) VALUES(1,'fixture-owner');
    INSERT INTO merchantAccounts(id,marketplaceId,externalSellerId,ownerUserId,displayName,receivingAddress,status,walletVerifiedAt)
      VALUES('merchant','market','seller',1,'Fixture','${recipient}','active',1);`);
  seedIntent('pi_fixture_a');
  for (const [id, active, merchant] of [['endpoint-a',1,'merchant'],['endpoint-b',1,'merchant'],
    ['endpoint-inactive',0,'merchant'],['endpoint-foreign',1,'other-merchant']] as const) {
    sqlite.prepare(`INSERT INTO webhookEndpoints(id,marketplaceId,merchantAccountId,ownerUserId,url,urlHash,secretCiphertext,active)
      VALUES (?,'market',?,1,'https://fixture.invalid/hook',?,'unused-local-fixture',?)`).run(id, merchant, id, active);
  }
  vi.stubEnv('DRUTO_API_URL', 'https://druto.fixture.invalid');
  vi.mocked(verifyArcUsdcTransfer).mockImplementation(async hash => verified(hash) as any);
  batchFailures = 0; loseCommitAcknowledgement = false;
});
afterEach(() => { sqlite.close(); vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe('D1 settlement concurrency and durable state recovery', () => {
  it('settles twenty overlapping submissions once, fan-outs only to active seller endpoints, and replays without writes', async () => run(async () => {
    raceVerification(20);
    const responses = await Promise.all(Array.from({length:20}, () => verify()));
    expect(verifyArcUsdcTransfer).toHaveBeenCalledTimes(20);
    expect(batchFailures).toBe(19); // Every request reached the commit race.
    for (const response of responses) expect(response).toEqual(responses[0]);
    expect(responses[0]).toMatchObject({status:'succeeded',transactionHash:hashA,amountAtomic:'2000000'});
    expect(rows('paymentTransactions')).toHaveLength(1);
    const outbox = rows('webhookDeliveries');
    expect(outbox.map(row => row.endpointId).sort()).toEqual(['endpoint-a','endpoint-b']);
    expect(new Set(outbox.map(row => row.eventId)).size).toBe(1);
    for (const row of outbox) {
      expect(row).toMatchObject({status:'pending',attempts:0});
      expect(JSON.parse(String(row.payload))).toMatchObject({id:row.eventId,type:'payment.verified',
        data:{paymentIntentId:'pi_fixture_a',transactionHash:hashA,amountAtomic:'2000000'}});
    }
    const beforeReplay = state();
    expect(await verify('pi_fixture_a', `0x${'A'.repeat(64)}`)).toEqual(responses[0]);
    expect(state()).toEqual(beforeReplay);
    expect(verifyArcUsdcTransfer).toHaveBeenCalledTimes(20);
  }));
  it('does not credit the same hash to two intents even when both pass the synthetic verifier', async () => run(async () => {
    seedIntent('pi_fixture_b'); raceVerification(2);
    const results = await Promise.allSettled([verify(), verify('pi_fixture_b')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('CONFLICT');
    expect(batchFailures).toBe(1);
    const [tx] = rows('paymentTransactions');
    expect(rows('paymentIntents').filter(row => row.status === 'succeeded').map(row => row.id)).toEqual([tx.paymentIntentId]);
    expect(rows('paymentIntents').filter(row => row.status === 'requires_payment')).toHaveLength(1);
    expect(rows('webhookDeliveries')).toHaveLength(2);
    for (const row of rows('webhookDeliveries')) expect(row.paymentIntentId).toBe(tx.paymentIntentId);
  }));
  it('rejects a competing different hash for the same intent and preserves the winner on later retry', async () => run(async () => {
    raceVerification(2);
    const results = await Promise.allSettled([verify(), verify('pi_fixture_a', hashB)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('CONFLICT');
    const before = state();
    expect(before.transactions).toHaveLength(1); expect(before.outbox).toHaveLength(2);
    const losingHash = before.transactions[0].transactionHash === hashA ? hashB : hashA;
    await expect(verify('pi_fixture_a', losingHash)).rejects.toMatchObject({code:'CONFLICT'});
    expect(state()).toEqual(before);
  }));
  it('rolls back ledger, intent trigger and partial outbox fan-out when the second delivery insert fails; retry recovers', async () => run(async () => {
    sqlite.exec(`CREATE TRIGGER fail_second_delivery BEFORE INSERT ON webhookDeliveries
      WHEN (SELECT count(*) FROM webhookDeliveries) = 1
      BEGIN SELECT RAISE(ABORT,'Injected second outbox insert failure'); END;`);
    const before = state();
    await expect(verify()).rejects.toMatchObject({code:'CONFLICT'});
    expect(batchFailures).toBe(1); expect(state()).toEqual(before);
    sqlite.exec('DROP TRIGGER fail_second_delivery');
    expect(await verify()).toMatchObject({status:'succeeded'});
    expect(rows('paymentTransactions')).toHaveLength(1); expect(rows('webhookDeliveries')).toHaveLength(2);
  }));
  it('does not create an event or success state when the ledger insert fails', async () => run(async () => {
    sqlite.exec(`CREATE TRIGGER fail_ledger BEFORE INSERT ON paymentTransactions
      BEGIN SELECT RAISE(ABORT,'Injected ledger write failure'); END;`);
    const before = state();
    await expect(verify()).rejects.toMatchObject({code:'CONFLICT'});
    expect(state()).toEqual(before);
    sqlite.exec('DROP TRIGGER fail_ledger');
    expect(await verify()).toMatchObject({status:'succeeded'});
  }));
  it('recovers a lost batch acknowledgement by reading committed state without duplicate events', async () => run(async () => {
    loseCommitAcknowledgement = true;
    expect(await verify()).toMatchObject({status:'succeeded',transactionHash:hashA});
    const before = state();
    expect(before.transactions).toHaveLength(1); expect(before.outbox).toHaveLength(2);
    expect(await verify()).toMatchObject({status:'succeeded'}); expect(state()).toEqual(before);
  }));
  it('refuses a succeeded intent with a missing ledger record', async () => run(async () => {
    sqlite.prepare("UPDATE paymentIntents SET status='succeeded',transactionHash=?").run(hashA);
    const before = state();
    await expect(verify()).rejects.toMatchObject({code:'CONFLICT',message:'Payment ledger requires review'});
    expect(state()).toEqual(before); expect(verifyArcUsdcTransfer).not.toHaveBeenCalled();
  }));
  it('allows settlement with no subscribed endpoint without inventing an outbox delivery', async () => run(async () => {
    sqlite.exec('UPDATE webhookEndpoints SET active=0');
    expect(await verify()).toMatchObject({status:'succeeded'});
    expect(rows('paymentTransactions')).toHaveLength(1); expect(rows('webhookDeliveries')).toHaveLength(0);
  }));
  it.each([
    ['No matching USDC transfer or payment split found on Arc', 'BAD_REQUEST'],
    ['Injected upstream RPC outage', 'SERVICE_UNAVAILABLE'],
  ])('leaves persistence unchanged on verifier failure: %s', async (message, code) => run(async () => {
    vi.mocked(verifyArcUsdcTransfer).mockRejectedValue(new Error(message));
    const before = state();
    await expect(verify()).rejects.toMatchObject({code});
    expect(state()).toEqual(before); expect(batchFailures).toBe(0);
  }));
  it('guards against an intent amount changing while chain verification is in flight', async () => run(async () => {
    vi.mocked(verifyArcUsdcTransfer).mockImplementation(async () => {
      sqlite.exec("UPDATE paymentIntents SET amountAtomic='3000000'");
      return verified() as any;
    });
    await expect(verify()).rejects.toMatchObject({code:'CONFLICT'});
    expect(rows('paymentIntents')[0]).toMatchObject({status:'requires_payment',amountAtomic:'3000000',transactionHash:null});
    expect(rows('paymentTransactions')).toHaveLength(0); expect(rows('webhookDeliveries')).toHaveLength(0);
  }));
});
