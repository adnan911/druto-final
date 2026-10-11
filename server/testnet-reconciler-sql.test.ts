import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { reconcileTestnet } from '../workers/testnet-reconciler/index';

const { DatabaseSync: SQLiteDatabase } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const now = Date.UTC(2026, 9, 11, 12);
const settled = now - 20 * 60_000;
const recipient = `0x${'1'.repeat(40)}`;
const buyer = `0x${'2'.repeat(40)}`;
const hash = `0x${'a'.repeat(64)}`;
const token = '0x3600000000000000000000000000000000000000';
const transfer = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
let sqlite: DatabaseSync;
const database = { prepare(sql: string) {
  if (!/^SELECT\s/i.test(sql)) throw new Error('Reconciler attempted a write');
  return { bind: (...values: SQLInputValue[]) => ({ all: async <T>() => ({
    results: sqlite.prepare(sql).all(...values) as T[],
  }) }) };
} };
const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
  const request = JSON.parse(String(init?.body));
  const answer = (item: {id:number;method:string}) => ({ jsonrpc:'2.0',id:item.id,
    result: item.method === 'eth_chainId' ? '0x4cef52' : {
      status:'0x1',transactionHash:hash,logs:[{address:token,
        topics:[transfer,`0x${buyer.slice(2).padStart(64,'0')}`,`0x${recipient.slice(2).padStart(64,'0')}`],data:'0x1e8480'}],
    },
  });
  return Response.json(Array.isArray(request) ? request.map(answer) : answer(request));
}) as unknown as typeof fetch;
function endpoint(id = 'endpoint', createdAt = settled - 1000, active = 1) {
  sqlite.prepare(`INSERT INTO webhookEndpoints(id,marketplaceId,merchantAccountId,ownerUserId,url,urlHash,secretCiphertext,active,createdAt)
    VALUES (?,'market','merchant',1,'https://fixture.invalid/hook',?,'fixture',?,?)`).run(id,id,active,createdAt);
}
function delivery(status = 'succeeded', attempts = 1) {
  sqlite.prepare(`INSERT INTO webhookDeliveries(id,endpointId,eventId,eventType,paymentIntentId,payload,signature,status,attempts)
    VALUES ('delivery','endpoint','evt_fixture','payment.verified','pi_fixture','{}','fixture',?,?)`).run(status,attempts);
}
async function audit() {
  const snapshot = () => ['paymentIntents','paymentTransactions','webhookEndpoints','webhookDeliveries']
    .map(table => sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
  const before = snapshot();
  const report = await reconcileTestnet({DRUTO_D1:database},fetcher,now);
  expect(snapshot()).toEqual(before);
  return report;
}
beforeEach(() => {
  sqlite = new SQLiteDatabase(':memory:');
  sqlite.exec(readFileSync('drizzle-d1/0000_cool_tempest.sql','utf8'));
  sqlite.exec(`INSERT INTO users(id,openId) VALUES(1,'fixture');
    INSERT INTO merchantAccounts(id,marketplaceId,externalSellerId,ownerUserId,displayName,receivingAddress,status,walletVerifiedAt)
      VALUES('merchant','market','seller',1,'Fixture','${recipient}','active',1);
    INSERT INTO paymentIntents(id,externalOrderId,merchantAccountId,marketplaceId,sellerId,itemName,amountAtomic,merchantAddress,expiresAt)
      VALUES('pi_fixture','order','merchant','market','seller','Fixture','2000000','${recipient}',${now});
    INSERT INTO paymentTransactions(paymentIntentId,transactionHash,fromAddress,toAddress,tokenAddress,amountAtomic,platformFeeAmount,merchantPayoutAmount,chainId,finalizedAt,createdAt)
      VALUES('pi_fixture','${hash}','${buyer}','${recipient}','${token}','2000000','0','2000000',5042002,${settled},${settled});
    UPDATE paymentIntents SET updatedAt=${settled};`);
});
afterEach(() => {sqlite.close();vi.clearAllMocks();});

describe('read-only reconciliation against real SQL and inconsistent fixtures', () => {
  it('accepts a complete settlement and delivery', async () => {
    endpoint();delivery();expect(await audit()).toMatchObject({status:'PASS',exceptionCodes:[]});
  });
  it.each(['no endpoints','new endpoint','disabled endpoint'])('does not invent a missing historical obligation: %s', async scenario => {
    if (scenario === 'new endpoint') endpoint('endpoint',settled + 1);
    if (scenario === 'disabled endpoint') endpoint('endpoint',settled - 1,0);
    expect(await audit()).toMatchObject({status:'PASS',exceptionCodes:[]});
  });
  it('flags a missing delivery for an existing active endpoint for operator review', async () => {
    endpoint();
    expect(await audit()).toMatchObject({status:'FAIL',webhookCoverageGaps:1,
      exceptionCodes:expect.arrayContaining(['WEBHOOK_COVERAGE_REVIEW_REQUIRED'])});
  });
  it('detects partial fan-out instead of treating one delivery as coverage for every endpoint', async () => {
    endpoint();delivery();endpoint('second');
    expect(await audit()).toMatchObject({status:'FAIL',webhookCoverageGaps:1});
  });
  it('flags exhausted retries immediately even within normal delivery grace', async () => {
    endpoint();delivery('failed',10);
    sqlite.exec(`UPDATE paymentTransactions SET finalizedAt=${now-1000}; UPDATE paymentIntents SET updatedAt=${now-1000};`);
    expect(await audit()).toMatchObject({status:'FAIL',exhaustedWebhooks:1,
      exceptionCodes:expect.arrayContaining(['WEBHOOK_RETRIES_EXHAUSTED'])});
  });
  it('allows the final in-flight lease, then flags exhaustion exactly when it expires', async () => {
    endpoint();delivery('pending',10);
    sqlite.exec(`UPDATE paymentTransactions SET finalizedAt=${now-1000}; UPDATE paymentIntents SET updatedAt=${now-1000};
      UPDATE webhookDeliveries SET nextAttemptAt=${now+1};`);
    expect(await audit()).toMatchObject({status:'PASS',exhaustedWebhooks:0});
    sqlite.exec(`UPDATE webhookDeliveries SET nextAttemptAt=${now};`);
    expect(await audit()).toMatchObject({status:'FAIL',exhaustedWebhooks:1});
  });
  it('does not flag a successful delivery merely because it needed ten attempts', async () => {
    endpoint();delivery('succeeded',10);
    expect(await audit()).toMatchObject({status:'PASS',exhaustedWebhooks:0});
  });
  it('preserves retry grace and flags stale undelivered work after grace', async () => {
    endpoint();delivery('failed',9);
    sqlite.exec(`UPDATE paymentTransactions SET finalizedAt=${now-1000}; UPDATE paymentIntents SET updatedAt=${now-1000};`);
    expect(await audit()).toMatchObject({status:'PASS',withinGrace:1});
    sqlite.exec(`UPDATE paymentTransactions SET finalizedAt=${settled}; UPDATE paymentIntents SET updatedAt=${settled};`);
    expect(await audit()).toMatchObject({status:'FAIL',exceptionCodes:['WEBHOOK_UNDELIVERED']});
  });
  it.each(['missing','amount','hash','recipient'])('detects a transaction mismatch: %s', async variant => {
    if (variant === 'missing') sqlite.exec('DELETE FROM paymentTransactions');
    if (variant === 'amount') sqlite.exec("UPDATE paymentTransactions SET amountAtomic='1000000'");
    if (variant === 'hash') sqlite.prepare('UPDATE paymentTransactions SET transactionHash=?').run(`0x${'b'.repeat(64)}`);
    if (variant === 'recipient') sqlite.prepare('UPDATE paymentTransactions SET toAddress=?').run(buyer);
    expect((await audit()).exceptionCodes).toContain('DRUTO_TRANSACTION_MISMATCH');
  });
  it.each(['missing','pending'])('detects a transaction whose intent is %s instead of silently ignoring it', async variant => {
    if (variant === 'missing') sqlite.exec('DELETE FROM paymentIntents');
    else sqlite.exec("UPDATE paymentIntents SET status='requires_payment'");
    expect(await audit()).toMatchObject({status:'FAIL',unsettledTransactions:1,
      exceptionCodes:expect.arrayContaining(['DRUTO_UNSETTLED_TRANSACTION'])});
  });
  it('caps reverse-integrity anomaly reporting and fails incomplete above one hundred', async () => {
    // Seed through normal settlement triggers, then simulate later data corruption.
    for (let index=0;index<100;index++) {
      const id = `pi_extra_${index}`;
      sqlite.prepare(`INSERT INTO paymentIntents(id,externalOrderId,itemName,amountAtomic,merchantAddress,expiresAt)
        VALUES (?,?,'Fixture','2000000',?,?)`).run(id,id,recipient,now);
      sqlite.prepare(`INSERT INTO paymentTransactions(paymentIntentId,transactionHash,fromAddress,toAddress,tokenAddress,amountAtomic,chainId)
        VALUES (?,?,?,?,?,'2000000',5042002)`).run(id,`0x${index.toString(16).padStart(64,'0')}`,buyer,recipient,token);
    }
    sqlite.exec('DELETE FROM paymentIntents');
    expect(await audit()).toMatchObject({status:'INCOMPLETE',unsettledTransactions:101,
      exceptionCodes:expect.arrayContaining(['AUDIT_TRANSACTION_LIMIT'])});
    expect(fetcher).not.toHaveBeenCalled();
  });
});
