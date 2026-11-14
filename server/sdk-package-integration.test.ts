import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Server } from 'node:http';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import express from 'express';
import { createD1App } from '../api/d1-app';
import { withD1 } from './d1-db';
import { hashApiKey } from './api-keys';
import { encryptWebhookSecret, signWebhookPayload, buildWebhookHeaders } from './webhooks';
import { sendD1Webhook } from './d1-webhook-drain';
import { verifyArcUsdcTransfer } from './arc';

// Exercise the installed compiled SDK, real HTTP/tRPC, SQL, outbox, signing and
// merchant deduplication. Only chain evidence is synthetic. HTTPS origins are
// mapped to loopback HTTP by the harness, never by a production SDK exception.
vi.mock('./arc', async original=>({...await original<typeof import('./arc')>(),verifyArcUsdcTransfer:vi.fn()}));
const { DatabaseSync: SQLiteDatabase } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
let sdk: typeof import('../sdk/druto-sdk/src/index');
let sqlite: DatabaseSync, orders: DatabaseSync;
let server: Server, origin: string;
let loseAcknowledgement: boolean;
let received: Array<{raw:string;headers:Record<string,string>}>;
const actualFetch=fetch;
const recipient=`0x${'1'.repeat(40)}`, buyer=`0x${'2'.repeat(40)}`, hash=`0x${'a'.repeat(64)}`;
const secret='synthetic-integration-secret';
const publicOrigin='https://druto.fixture.invalid';
function statement(sql:string,values:SQLInputValue[]=[]):any {
  return {
    bind:(...parameters:SQLInputValue[])=>statement(sql,parameters),
    execute:()=>({success:true,meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}}),
    run:async()=>statement(sql,values).execute(),
    raw:async()=>sqlite.prepare(sql).all(...values).map(row=>Object.values(row)),
    all:async()=>({results:sqlite.prepare(sql).all(...values)}),
    first:async()=>sqlite.prepare(sql).get(...values)??null,
  };
}
const binding={prepare:statement,async batch(items:any[]){
  sqlite.exec('BEGIN');
  try {const result=items.map(item=>item.execute());sqlite.exec('COMMIT');return result;}
  catch(error){sqlite.exec('ROLLBACK');throw error;}
}};
const run=<T>(work:()=>Promise<T>)=>withD1(binding as never,work);
const input={externalOrderId:'order-1',idempotencyKey:'order-1-v1',itemName:'Fixture item',amount:'2.00',
  seller:{marketplaceId:'market',sellerId:'seller',merchantAccountId:'merchant'},returnUrl:'https://shop.fixture.invalid/order-1'};
const apiFetch:typeof fetch=async(url,init)=>{
  const target=new URL(String(url));
  if(target.origin!==publicOrigin) throw new Error('Unexpected SDK origin');
  return actualFetch(`${origin}${target.pathname}${target.search}`,init);
};
beforeAll(async()=>{
  // Load compiled JS, not SDK TypeScript. Override with a fresh installed package.
  const entry=resolve(process.env.DRUTO_SDK_TEST_MODULE??'sdk/druto-sdk/dist/index.js');
  sdk=await import(/* @vite-ignore */ entry.replace(/\\/g,'/'));
});
beforeEach(async()=>{
  sqlite=new SQLiteDatabase(':memory:'); orders=new SQLiteDatabase(':memory:');
  for(const name of ['0000_cool_tempest','0001_dashboard_sessions','0002_reconciliation_indexes','0003_reconciliation_checkpoint']) {
    sqlite.exec(readFileSync(`drizzle-d1/${name}.sql`,'utf8'));
  }
  vi.stubEnv('DRUTO_API_URL',publicOrigin); vi.stubEnv('DRUTO_WEBHOOK_ENCRYPTION_KEY','11'.repeat(32));
  vi.stubEnv('DRUTO_WEBHOOK_ALLOWED_ORIGINS','https://shop.fixture.invalid');
  sqlite.exec(`INSERT INTO users(id,openId) VALUES(1,'fixture');
    INSERT INTO merchantAccounts(id,marketplaceId,externalSellerId,ownerUserId,displayName,receivingAddress,status,walletVerifiedAt)
      VALUES('merchant','market','seller',1,'Fixture','${recipient}','active',1);`);
  sqlite.prepare(`INSERT INTO apiKeys(id,ownerUserId,name,prefix,lastFour,merchantAccountId,marketplaceId,sellerId,secretHash)
    VALUES ('key',1,'Fixture','fixture','0000','merchant','market','seller',?)`).run(hashApiKey('fixture-api-key'));
  sqlite.prepare(`INSERT INTO webhookEndpoints(id,marketplaceId,merchantAccountId,ownerUserId,url,urlHash,secretCiphertext,active)
    VALUES ('endpoint','market','merchant',1,'https://shop.fixture.invalid/hook','fixture',?,1)`).run(encryptWebhookSecret(secret));
  orders.exec(`CREATE TABLE orders(id TEXT PRIMARY KEY,intent TEXT,status TEXT NOT NULL DEFAULT 'pending');
    CREATE TABLE events(id TEXT PRIMARY KEY);
    CREATE TABLE fulfillment(id TEXT PRIMARY KEY);
    INSERT INTO orders(id) VALUES('order-1');`);
  loseAcknowledgement=false; received=[];
  const app=express();
  app.post('/hook',express.text({type:'application/json'}),async(req,res)=>{
    const headers={'druto-signature':String(req.headers['druto-signature']??''),'x-druto-event-id':String(req.headers['x-druto-event-id']??'')};
    const raw=String(req.body);received.push({raw,headers});
    const event=await sdk.verifyPaymentWebhook({secret,rawBody:raw,signature:headers['druto-signature'],eventId:headers['x-druto-event-id']});
    if(!event){res.sendStatus(401);return;}
    const order=orders.prepare('SELECT * FROM orders WHERE id=?').get(event.data.externalOrderId);
    if(!order || order.intent!==event.data.paymentIntentId || event.data.marketplaceId!=='market' ||
      event.data.sellerId!=='seller' || event.data.merchantAccountId!=='merchant' || event.data.amountAtomic!=='2000000' ||
      event.data.merchantAddress.toLowerCase()!==recipient || event.data.transactionHash!==hash) {res.sendStatus(409);return;}
    orders.exec('BEGIN');
    try {
      orders.prepare('INSERT INTO events(id) VALUES(?) ON CONFLICT(id) DO NOTHING').run(event.id);
      const changed=orders.prepare("UPDATE orders SET status='paid' WHERE id=? AND status='pending'").run(order.id);
      if(changed.changes) orders.prepare('INSERT INTO fulfillment(id) VALUES(?)').run(order.id);
      orders.exec('COMMIT');
    }catch{orders.exec('ROLLBACK');res.sendStatus(500);return;}
    if(loseAcknowledgement){loseAcknowledgement=false;res.sendStatus(503);return;}
    res.sendStatus(200);
  });
  app.use((_req,_res,next)=>{run(async()=>next());});app.use(createD1App());
  server=await new Promise<Server>(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
  origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  vi.stubGlobal('fetch',async(url:any,init:RequestInit)=>{
    if(String(url)!=='https://shop.fixture.invalid/hook') throw new Error('Unexpected outbound request');
    return actualFetch(`${origin}/hook`,init);
  });
  vi.mocked(verifyArcUsdcTransfer).mockResolvedValue({transactionHash:hash,fromAddress:buyer,toAddress:recipient,
    amountAtomic:'2000000',platformFeeAmount:'0',isSplit:false} as any);
});
afterEach(async()=>{
  server?.closeAllConnections();if(server) await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  sqlite.close();orders.close();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.resetAllMocks();
});
const client=()=>new sdk.Druto({apiKey:'fixture-api-key',baseUrl:publicOrigin,fetcher:apiFetch});
async function settle() {
  const payment=await client().createPayment(input);
  orders.prepare("UPDATE orders SET intent=? WHERE id='order-1'").run(payment.id);
  const response=await actualFetch(`${origin}/api/trpc/payments.verifyTransfer`,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({json:{paymentIntentId:payment.id,transactionHash:hash}})});
  expect(response.status).toBe(200);
  return {payment,delivery:sqlite.prepare('SELECT * FROM webhookDeliveries').get()!};
}
describe('compiled SDK marketplace HTTP integration',()=>{
  it('creates a seller-scoped checkout, retries idempotently and reads actual tRPC status',async()=>{
    const first=await client().createPayment(input);expect(await client().createPayment(input)).toEqual(first);
    expect(first.checkoutUrl).toBe(`${publicOrigin}/checkout/${first.id}`);
    expect(first.merchantAddress).toBe(recipient);
    expect(await client().getPayment(first.id)).toMatchObject({id:first.id,status:'requires_payment',amountAtomic:'2000000'});
    await expect(client().createPayment({...input,amount:'3.00'})).rejects.toMatchObject({status:409});
    await expect(client().createPayment({...input,seller:{...input.seller,sellerId:'foreign'}})).rejects.toMatchObject({status:403});
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM paymentIntents').get()!.n).toBe(1);
  });
  it('settles once and accepts a real outbox signature; lost merchant acknowledgement does not duplicate fulfillment',async()=>{
    const {payment,delivery}=await settle();loseAcknowledgement=true;
    expect(await run(()=>sendD1Webhook(String(delivery.id)))).toMatchObject({ok:false,status:503});
    expect(orders.prepare('SELECT status FROM orders').get()!.status).toBe('paid');
    sqlite.exec('UPDATE webhookDeliveries SET nextAttemptAt=0'); // Fixture retry is now due.
    expect(await run(()=>sendD1Webhook(String(delivery.id)))).toMatchObject({ok:true,status:200});
    expect(orders.prepare('SELECT COUNT(*) AS n FROM events').get()!.n).toBe(1);
    expect(orders.prepare('SELECT COUNT(*) AS n FROM fulfillment').get()!.n).toBe(1);
    expect(received).toHaveLength(2);expect(received[0].raw).toBe(received[1].raw);
    expect(await client().getPayment(payment.id)).toMatchObject({status:'succeeded',transactionHash:hash});
    expect(sqlite.prepare('SELECT status,attempts FROM webhookDeliveries').get()).toMatchObject({status:'succeeded',attempts:2});
  });
  it('rejects tampered, expired and validly signed wrong-order events without marking an order paid',async()=>{
    const {delivery}=await settle();const raw=String(delivery.payload);
    const signed=signWebhookPayload(secret,raw);
    const submit=(body:string,headers:Record<string,string>)=>actualFetch(`${origin}/hook`,{method:'POST',headers,body});
    const headers=buildWebhookHeaders(String(delivery.eventId),signed);
    expect((await submit(raw+' ',headers)).status).toBe(401);
    const old=signWebhookPayload(secret,raw,Math.floor(Date.now()/1000)-301);
    expect((await submit(raw,buildWebhookHeaders(String(delivery.eventId),old))).status).toBe(401);
    const altered=JSON.parse(raw);altered.data.amountAtomic='3000000';const wrong=JSON.stringify(altered);
    expect((await submit(wrong,buildWebhookHeaders(String(delivery.eventId),signWebhookPayload(secret,wrong)))).status).toBe(409);
    expect(orders.prepare('SELECT status FROM orders').get()!.status).toBe('pending');
    expect(orders.prepare('SELECT COUNT(*) AS n FROM fulfillment').get()!.n).toBe(0);
  });
});
