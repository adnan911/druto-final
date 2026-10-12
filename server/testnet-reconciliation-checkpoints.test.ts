import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { runReconciliationBatch, RECONCILIATION_LEASE_MS, type BatchReport } from '../workers/testnet-reconciler/checkpoints';
import scheduledWorker from '../workers/testnet-reconciler/index';

const { DatabaseSync: SQLiteDatabase } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const now = Date.UTC(2026,9,12,12);
const settled = now-1_200_000;
const recipient = `0x${'1'.repeat(40)}`, buyer = `0x${'2'.repeat(40)}`;
const token = '0x3600000000000000000000000000000000000000';
const transfer = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
let sqlite: DatabaseSync;
let fault: 'before' | 'after' | undefined;
let hashes: string[];
const database = { prepare(sql: string) {
  if (!/^SELECT\s/i.test(sql) && !/^(INSERT INTO|UPDATE) reconciliationCheckpoint\b/.test(sql)) {
    throw new Error('Attempt to mutate business data');
  }
  return { bind: (...values: SQLInputValue[]) => ({ all: async <T>() => {
    const checkpointWrite = sql.startsWith('UPDATE reconciliationCheckpoint SET phase=');
    if (checkpointWrite && fault==='before') {fault=undefined; throw new Error('write unavailable');}
    const results = sqlite.prepare(sql).all(...values) as T[];
    if (checkpointWrite && fault==='after') {fault=undefined; throw new Error('lost acknowledgement');}
    return { results };
  } }) };
} };
const fetcher: typeof fetch = async (_url, init) => {
  const request = JSON.parse(String(init?.body));
  const answer = (item: {id:number;method:string;params:string[]}) => {
    if (item.method==='eth_chainId') return {id:item.id,result:'0x4cef52'};
    hashes.push(item.params[0]);
    return {id:item.id,result:{status:'0x1',transactionHash:item.params[0],logs:[{address:token,
      topics:[transfer,`0x${buyer.slice(2).padStart(64,'0')}`,`0x${recipient.slice(2).padStart(64,'0')}`],data:'0x1e8480'}]}};
  };
  return Response.json(Array.isArray(request)?request.map(answer):answer(request));
};
const run = (rpc=fetcher, clock=()=>now) => runReconciliationBatch({DRUTO_D1:database},rpc,clock);
const checkpoint = () => sqlite.prepare('SELECT * FROM reconciliationCheckpoint').get()!;
const counts = () => JSON.parse(String(checkpoint().report));
const snapshot = () => ['users','merchantAccounts','paymentIntents','paymentTransactions','webhookEndpoints','webhookDeliveries']
  .map(table=>sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
function seed(count: number, prefix='pi_', timestamp=settled) {
  for (let index=0; index<count; index++) {
    const id = `${prefix}${String(index).padStart(4,'0')}`;
    const hash = `0x${(Number(sqlite.prepare('SELECT COUNT(*) AS n FROM paymentTransactions').get()!.n)+1).toString(16).padStart(64,'0')}`;
    sqlite.prepare(`INSERT INTO paymentIntents(id,externalOrderId,merchantAccountId,marketplaceId,sellerId,itemName,amountAtomic,merchantAddress,expiresAt)
      VALUES (?,?,'merchant','market','seller','Fixture','2000000',?,?)`).run(id,id,recipient,now+10_000);
    sqlite.prepare(`INSERT INTO paymentTransactions(paymentIntentId,transactionHash,fromAddress,toAddress,tokenAddress,amountAtomic,platformFeeAmount,merchantPayoutAmount,chainId,finalizedAt,createdAt)
      VALUES (?,?,?,?,?,'2000000','0','2000000',5042002,?,?)`).run(id,hash,buyer,recipient,token,timestamp,timestamp);
    sqlite.prepare('UPDATE paymentIntents SET updatedAt=? WHERE id=?').run(timestamp,id);
  }
}
async function finish(): Promise<BatchReport> {
  for (let index=0;index<100;index++) {const report=await run(); if(report.cycleComplete) return report;}
  throw new Error('Cycle did not finish');
}
beforeEach(()=>{
  sqlite=new SQLiteDatabase(':memory:'); fault=undefined; hashes=[];
  for(const name of ['0000_cool_tempest','0001_dashboard_sessions','0002_reconciliation_indexes','0003_reconciliation_checkpoint']) {
    sqlite.exec(readFileSync(`drizzle-d1/${name}.sql`,'utf8'));
  }
  sqlite.exec(`INSERT INTO users(id,openId) VALUES(1,'fixture');
    INSERT INTO merchantAccounts(id,marketplaceId,externalSellerId,ownerUserId,displayName,receivingAddress,status,walletVerifiedAt)
      VALUES('merchant','market','seller',1,'Fixture','${recipient}','active',1);`);
});
afterEach(()=>{sqlite.close();vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('persistent bounded reconciliation against real SQLite',()=>{
  it('checks 123 payments across fresh invocations, never passes a partial cycle, and never modifies business data',async()=>{
    seed(123); const before=snapshot(); const reports:BatchReport[]=[];
    do {reports.push(await run());} while(!reports.at(-1)!.cycleComplete && reports.length<40);
    expect(reports).toHaveLength(26);
    expect(reports.slice(0,-1).every(r=>r.status==='IN_PROGRESS')).toBe(true);
    expect(reports.at(-1)).toMatchObject({status:'PASS',drutoSucceeded:123,transactionsChecked:123,pagesChecked:13});
    expect(hashes).toHaveLength(123); expect(new Set(hashes).size).toBe(123);
    expect(snapshot()).toEqual(before);
  });
  it('keeps partial stored totals from claiming PASS',async()=>{
    seed(12); expect((await run()).status).toBe('IN_PROGRESS'); expect(counts().status).toBe('INCOMPLETE');
  });
  it('does not advance on RPC failure, retries the page and retains previous anomalies',async()=>{
    seed(12); sqlite.exec("UPDATE paymentIntents SET platformFeeBps=200 WHERE id='pi_0000'");
    expect(await run()).toMatchObject({status:'FAIL',cycleComplete:false}); const cursor=checkpoint().intentCursor;
    const failed=await run(async()=>new Response('',{status:500}));
    expect(failed.status).toBe('INCOMPLETE'); expect(checkpoint().intentCursor).toBe(cursor);
    expect(counts().drutoSucceeded).toBe(10);
    expect(await finish()).toMatchObject({status:'FAIL',drutoSucceeded:12,
      exceptionCodes:expect.arrayContaining(['DRUTO_PAYMENT_POLICY_MISMATCH'])});
  });
  it('grants only one of 20 overlapping invocations the lease',async()=>{
    seed(12); let release!:()=>void; let entered!:()=>void;
    const waiting=new Promise<void>(resolve=>{entered=resolve});
    const gate=new Promise<void>(resolve=>{release=resolve});
    const pending=run(async(...args)=>{entered();await gate;return fetcher(...args)});
    await waiting;
    const overlaps=await Promise.all(Array.from({length:19},()=>run()));
    expect(overlaps.every(report=>report.status==='SKIPPED')).toBe(true);
    release(); expect((await pending).drutoSucceeded).toBe(10); expect(counts().drutoSucceeded).toBe(10);
  });
  it('reclaims an expired lease and fences a stale invocation from overwriting the newer checkpoint',async()=>{
    seed(21); let release!:()=>void; let entered!:()=>void;
    const waiting=new Promise<void>(resolve=>{entered=resolve});
    const gate=new Promise<void>(resolve=>{release=resolve});
    const stale=run(async(...args)=>{entered();await gate;return fetcher(...args)});
    await waiting;
    expect((await run(fetcher,()=>now+RECONCILIATION_LEASE_MS+1)).drutoSucceeded).toBe(10);
    release(); expect((await stale).status).toBe('INCOMPLETE');
    expect(counts().drutoSucceeded).toBe(10); expect(checkpoint().intentCursor).toBe('pi_0009');
    expect((await finish()).drutoSucceeded).toBe(21);
  });
  it.each(['before','after'] as const)('recovers a checkpoint failure %s commit without double counting',async failure=>{
    seed(12); fault=failure;
    expect(await run()).toMatchObject({status:'INCOMPLETE',drutoSucceeded:0,cycleComplete:false});
    expect(counts().drutoSucceeded).toBe(failure==='before'?0:10);
    expect(await finish()).toMatchObject({status:'PASS',drutoSucceeded:12,transactionsChecked:12});
  });
  it('defers a newly settled lexically earlier random ID to the next cycle',async()=>{
    seed(12); await run(); seed(1,'aaa_',now);
    expect(await finish()).toMatchObject({status:'PASS',drutoSucceeded:12,transactionsChecked:12});
    const next=await run(fetcher,()=>now+1000);
    expect(next.drutoSucceeded).toBe(10);
    const result=await finish(); expect(result).toMatchObject({status:'PASS',drutoSucceeded:13,transactionsChecked:13});
  });
  it('fails when a counted intent disappears before the cycle finishes',async()=>{
    seed(12); await run(); sqlite.exec("DELETE FROM paymentIntents WHERE id='pi_0011'");
    const report=await finish(); expect(report.status).toBe('FAIL');
    expect(report.exceptionCodes).toContain('AUDIT_CYCLE_MEMBERSHIP_CHANGED');
    expect(report.exceptionCodes).toContain('DRUTO_UNSETTLED_TRANSACTION');
  });
  it('checks more than 100 orphan transactions in bounded reverse pages',async()=>{
    seed(105); sqlite.exec('DELETE FROM paymentIntents');
    expect(await finish()).toMatchObject({status:'FAIL',drutoSucceeded:0,transactionsChecked:105,unsettledTransactions:105,cycleComplete:true});
  });
  it('fails closed on corrupted checkpoint data',async()=>{
    seed(12); await run(); sqlite.exec("UPDATE reconciliationCheckpoint SET report='broken'");
    expect(await run()).toMatchObject({status:'INCOMPLETE',cycleComplete:false,exceptionCodes:['AUDIT_CHECKPOINT_INCOMPLETE']});
    expect(checkpoint().intentCursor).toBe('pi_0009');
  });
  it('fails closed on a missing D1 binding without logging credentials',async()=>{
    const report=await runReconciliationBatch({DRUTO_D1:undefined!},fetcher,()=>now);
    expect(report).toMatchObject({status:'INCOMPLETE',exceptionCodes:['AUDIT_CHECKPOINT_INCOMPLETE']});
  });
  it('passes an empty cycle only after both phases complete',async()=>{
    expect(await run()).toMatchObject({status:'IN_PROGRESS',cycleComplete:false});
    expect(await run()).toMatchObject({status:'PASS',cycleComplete:true,drutoSucceeded:0,transactionsChecked:0});
  });
  it('scheduled handler accepts progress and busy, but throws for incomplete or failed audits',async()=>{
    vi.spyOn(Date,'now').mockReturnValue(now);
    seed(12); vi.stubGlobal('fetch',fetcher); vi.spyOn(console,'info').mockImplementation(()=>{});
    await expect(scheduledWorker.scheduled({}, {DRUTO_D1:database})).resolves.toBeUndefined();
    sqlite.exec(`UPDATE reconciliationCheckpoint SET leaseUntil=${Date.now()+60000}`);
    await expect(scheduledWorker.scheduled({}, {DRUTO_D1:database})).resolves.toBeUndefined();
    sqlite.exec("UPDATE reconciliationCheckpoint SET leaseUntil=0,report='broken'");
    await expect(scheduledWorker.scheduled({}, {DRUTO_D1:database})).rejects.toThrow('INCOMPLETE');
    sqlite.exec("UPDATE reconciliationCheckpoint SET phase='complete'; UPDATE paymentIntents SET platformFeeBps=200");
    await expect(scheduledWorker.scheduled({}, {DRUTO_D1:database})).rejects.toThrow('FAIL');
  });
});
