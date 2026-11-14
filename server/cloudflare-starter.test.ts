import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import worker from '../starter-templates/cloudflare/src/worker.js';
const {DatabaseSync:SQLite}=createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
let db:DatabaseSync,env:any,requests:any[];
const store='https://store.fixture.invalid';
const recipient=`0x${'1'.repeat(40)}`,hash=`0x${'a'.repeat(64)}`;
const key='A'.repeat(43);
const headers={origin:store,'content-type':'application/json',authorization:`Bearer ${key}`};
const send=(path:string,init:RequestInit={})=>worker.fetch(new Request(`${store}${path}`,init),env);
const create=(input:any={productId:'orbit'},token=key)=>send('/api/orders',{method:'POST',headers:{...headers,authorization:`Bearer ${token}`},body:JSON.stringify(input)});
const count=(table:string)=>Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n);
function event(order:any){return {id:'evt_fixture',type:'payment.verified',version:'2026-08-23',createdAt:new Date().toISOString(),data:{
  externalOrderId:order.id,paymentIntentId:order.intentId,marketplaceId:'market',sellerId:'seller',merchantAccountId:'merchant',status:'succeeded',
  amountAtomic:order.amountAtomic,amount:'2.000000',asset:'USDC',network:'arc-testnet',merchantAddress:recipient,transactionHash:hash,buyerAddress:null,orderContext:null}};}
const row=()=>db.prepare('SELECT * FROM orders').get()!;
function webhook(value:any,timestamp=Math.floor(Date.now()/1000),tamper=false){
  const raw=JSON.stringify(value);const signature=createHmac('sha256','fixture-secret').update(`${timestamp}.${raw}`).digest('hex');
  return send('/api/webhooks/druto',{method:'POST',headers:{'content-type':'application/json','druto-signature':`t=${timestamp},v1=${signature}`,'x-druto-event-id':value.id},body:raw+(tamper?' ':'')});
}
beforeEach(()=>{
  db=new SQLite(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(readFileSync('starter-templates/cloudflare/migrations/0001_orders.sql','utf8'));requests=[];
  env={APP_URL:store,DRUTO_BASE_URL:'https://druto.fixture.invalid',DRUTO_API_KEY:'fixture-key',DRUTO_WEBHOOK_SECRET:'fixture-secret',DRUTO_MARKETPLACE_ID:'market',DRUTO_SELLER_ID:'seller',DRUTO_MERCHANT_ACCOUNT_ID:'merchant',DRUTO_RECEIVING_ADDRESS:recipient,
    REQUEST_LIMITER:{limit:async()=>({success:true})},DB:{prepare:(sql:string)=>({bind:(...values:any[])=>({
      run:async()=>({meta:{changes:db.prepare(sql).run(...values).changes}}),first:async()=>db.prepare(sql).get(...values)??null,
    })})},ASSETS:{fetch:async()=>new Response('asset')}};
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
    const request=JSON.parse(init.body).json;requests.push(request);
    const saved=db.prepare('SELECT rowid,* FROM orders WHERE id=?').get(request.externalOrderId)!;
    const id=`pi_fixture${saved.rowid}`;
    return Response.json({result:{data:{json:{id,externalOrderId:request.externalOrderId,...request.seller,amountAtomic:saved.amountAtomic,
      asset:'USDC',network:'arc-testnet',platformFeeBps:0,status:'requires_payment',merchantAddress:recipient,
      expiresAt:new Date(Date.now()+3600000).toISOString(),redirectUrl:`https://druto.fixture.invalid/checkout/${id}`}}}});
  }));
});
afterEach(()=>{db.close();vi.unstubAllGlobals();});
describe('Cloudflare storefront durable order and webhook boundaries',()=>{
  it('prices on the server and persists one order/intent binding under concurrent retries',async()=>{
    const responses=await Promise.all(Array.from({length:20},()=>create({productId:'orbit',quantity:2,amount:'0.01',recipient:'attacker'})));
    for(const response of responses)expect(response.status).toBe(200);
    expect(count('orders')).toBe(1);expect(row()).toMatchObject({amountAtomic:'4000000',recipient,intentId:'pi_fixture1',status:'pending'});
    expect(new Set(requests.map(r=>r.idempotencyKey)).size).toBe(1);
    expect(requests[0]).toMatchObject({amount:'4.000000',externalOrderId:row().id});
    expect(JSON.stringify(await responses[0].json())).not.toContain(key);
    expect((await create({productId:'terrain'},key)).status).toBe(409);
  });
  it('keeps a recoverable pending order after provider failure',async()=>{
    vi.mocked(fetch).mockRejectedValueOnce(new Error('private upstream details'));
    const failed=await create();expect(failed.status).toBe(503);expect(await failed.text()).not.toContain('private');
    const id=row().id;expect(row().intentId).toBeNull();
    expect((await create()).status).toBe(200);expect(row().id).toBe(id);expect(count('orders')).toBe(1);
  });
  it('requires the order capability for status and never trusts a return URL as payment',async()=>{
    const order=await (await create()).json();
    expect((await send(`/api/orders/${order.id}`)).status).toBe(401);
    expect((await send(`/api/orders/${order.id}`,{headers:{authorization:`Bearer ${'B'.repeat(43)}`}})).status).toBe(404);
    const response=await send(`/api/orders/${order.id}`,{headers:{authorization:`Bearer ${key}`}});
    expect(await response.json()).toMatchObject({status:'pending',transactionHash:null});
    await send(`/orders/${order.id}?paid=true&transactionHash=${hash}`);expect(row().status).toBe('pending');
  });
  it('accepts twenty duplicate signed events once and enqueues only one fulfillment job',async()=>{
    await create();const value=event(row());const outcomes=await Promise.all(Array.from({length:20},()=>webhook(value)));
    expect(outcomes.every(r=>r.status===200)).toBe(true);expect(count('acceptedEvents')).toBe(1);expect(count('fulfillmentJobs')).toBe(1);
    expect(row()).toMatchObject({status:'paid',transactionHash:hash});
    expect((await webhook({...value,id:'evt_other_delivery'})).status).toBe(200);expect(count('fulfillmentJobs')).toBe(1);
  });
  it('rolls back paid state and event when fulfillment enqueue fails, then retries safely',async()=>{
    await create();const value=event(row());db.exec("CREATE TRIGGER inject_failure BEFORE INSERT ON fulfillmentJobs BEGIN SELECT RAISE(ABORT,'fixture'); END");
    expect((await webhook(value)).status).toBe(409);expect(row().status).toBe('pending');expect(count('acceptedEvents')).toBe(0);
    db.exec('DROP TRIGGER inject_failure');expect((await webhook(value)).status).toBe(200);expect(count('fulfillmentJobs')).toBe(1);
  });
  it.each(['externalOrderId','paymentIntentId','marketplaceId','sellerId','merchantAccountId','amountAtomic','merchantAddress'])(
    'rejects valid signatures with mismatched %s',async field=>{
      await create();const value=event(row());(value.data as any)[field]=field==='merchantAddress'?`0x${'2'.repeat(40)}`:field==='amountAtomic'?'1':'wrong';
      expect((await webhook(value)).status).toBe(409);expect(row().status).toBe('pending');expect(count('acceptedEvents')).toBe(0);
    });
  it('rejects tampering, stale signatures and unsupported versions',async()=>{
    await create();const value=event(row());expect((await webhook(value,Math.floor(Date.now()/1000),true)).status).toBe(401);
    expect((await webhook(value,1)).status).toBe(401);expect((await webhook({...value,version:'unknown'})).status).toBe(400);
    expect(row().status).toBe('pending');
  });
  it('rejects reuse of a transaction or event identity for a second order',async()=>{
    await create();const first=row();expect((await webhook(event(first))).status).toBe(200);
    await create({productId:'orbit'},'B'.repeat(43));const second=db.prepare('SELECT * FROM orders WHERE id<>?').get(first.id)!;
    expect((await webhook(event(second))).status).toBe(409);
    expect((await webhook({...event(second),id:'evt_new'})).status).toBe(409);
    expect(db.prepare('SELECT status FROM orders WHERE id=?').get(second.id)!.status).toBe('pending');
    expect(count('fulfillmentJobs')).toBe(1);
  });
  it('blocks unset configuration, missing limiter and cross-origin order creation',async()=>{
    env.DRUTO_API_KEY='';expect((await create()).status).toBe(503);env.DRUTO_API_KEY='fixture-key';
    const limiter=env.REQUEST_LIMITER;delete env.REQUEST_LIMITER;expect((await create()).status).toBe(503);env.REQUEST_LIMITER=limiter;
    expect((await send('/api/orders',{method:'POST',headers:{...headers,origin:'https://foreign.invalid'},body:'{}'})).status).toBe(403);
    env.REQUEST_LIMITER={limit:async()=>({success:false})};expect((await create()).status).toBe(429);expect(count('orders')).toBe(0);
  });
  it('rejects invalid quantities and oversized bodies before persistence',async()=>{
    for(const quantity of [0,11,-1,1.1,'2'])expect((await create({productId:'orbit',quantity})).status).toBe(400);
    expect((await send('/api/orders',{method:'POST',headers,body:'x'.repeat(65537)})).status).toBe(413);expect(count('orders')).toBe(0);
  });
  it('reports expiry without changing financial state',async()=>{
    await create();db.exec('UPDATE orders SET expiresAt=1');const response=await create();
    expect(await response.json()).toMatchObject({status:'expired',checkoutUrl:null});expect(row().status).toBe('pending');
  });
});
