// Run against an extracted ZIP AFTER npm ci, outside the Druto repository.
// Uses that installation's Miniflare/workerd, real local D1 and static assets.
// Only the remote payment provider is a deterministic fixture; no live RPC/funds.
import assert from 'node:assert/strict';
import { readFile, realpath, mkdtemp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
const root=await realpath(process.argv[2] ?? '');
assert.ok(process.argv[2], 'Pass the extracted starter directory');
const require=createRequire(path.join(root,'package.json'));
const runtime=await realpath(require.resolve('miniflare'));
assert.ok(runtime.startsWith(root+path.sep),'Runtime must be installed inside the extracted package');
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const meta=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
assert.equal(meta.dependencies,undefined,'No parent repository runtime dependency');
const origin='https://store.fixture.invalid',provider='https://druto.fixture.invalid';
const recipient=`0x${'1'.repeat(40)}`,transaction=`0x${'a'.repeat(64)}`;
const token='A'.repeat(43),secret='local-fixture-only';
const persist=await mkdtemp(path.join(os.tmpdir(),'druto-starter-d1-'));
const requests=[];let outage=true;
const options={
  name:'independent-starter',
  compatibilityDate:'2026-10-05',modulesRoot:root,
  modules:['src/worker.js','src/catalog.js','vendor/druto-sdk/index.js'].map(file=>({type:'ESModule',path:path.join(root,file)})),
  d1Databases:{DB:'independent-starter-db'},
  ratelimits:{REQUEST_LIMITER:{namespace_id:'50420101',simple:{limit:60,period:60}}},
  assets:{directory:path.join(root,'public'),binding:'ASSETS',run_worker_first:true,routerConfig:{has_user_worker:true}},
  bindings:{APP_URL:origin,DRUTO_BASE_URL:provider,DRUTO_API_KEY:'fixture-key',DRUTO_WEBHOOK_SECRET:secret,
    DRUTO_MARKETPLACE_ID:'market',DRUTO_SELLER_ID:'seller',DRUTO_MERCHANT_ACCOUNT_ID:'merchant',DRUTO_RECEIVING_ADDRESS:recipient},
  outboundService:async request=>{
    assert.equal(request.url,`${provider}/api/trpc/payments.createIntent`,'Unexpected outbound network request');
    assert.equal(request.headers.get('authorization'),'Bearer fixture-key');
    const input=(await request.json()).json;requests.push(input);
    if(outage){outage=false;return Response.json({error:{data:{code:'UNAVAILABLE'}}},{status:503});}
    return Response.json({result:{data:{json:{id:'pi_independent',externalOrderId:input.externalOrderId,...input.seller,
      amountAtomic:'4000000',asset:'USDC',network:'arc-testnet',platformFeeBps:0,status:'requires_payment',merchantAddress:recipient,
      expiresAt:new Date(Date.now()+3600000).toISOString(),redirectUrl:`${provider}/checkout/pi_independent`}}}});
  },
};
let mf=new Miniflare({...convertV4MiniflareOptions(options),resourcePersistencePath:persist}),passed=0;
const pass=label=>{passed++;console.log(`PASS ${label}`);};
const send=(url,init={})=>mf.dispatchFetch(origin+url,init);
const buy=()=>send('/api/orders',{method:'POST',headers:{origin,'content-type':'application/json',authorization:`Bearer ${token}`},
  body:JSON.stringify({productId:'orbit',quantity:2,amount:'0.01',recipient:'attacker'})});
const status=id=>send(`/api/orders/${id}`,{headers:{authorization:`Bearer ${token}`}});
const postEvent=(event,tamper=false)=>{
  const raw=JSON.stringify(event),timestamp=Math.floor(Date.now()/1000);
  const signature=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex');
  return send('/api/webhooks/druto',{method:'POST',headers:{'druto-signature':`t=${timestamp},v1=${signature}`,'x-druto-event-id':event.id},body:raw+(tamper?' ':'')});
};
try {
  let db=await mf.getD1Database('DB');
  const sql=await readFile(path.join(root,'migrations/0001_orders.sql'),'utf8');
  const statements=sql.match(/CREATE TABLE[\s\S]*?\);|CREATE TRIGGER[\s\S]*?END;/g);
  assert.equal(statements.length,5);await db.batch(statements.map(s=>db.prepare(s)));
  pass('packaged migration installs three tables and two triggers in local D1');
  const home=await send('/');assert.equal(home.status,200,await home.clone().text());assert.match(await home.text(),/Forma/);
  assert.match(home.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal((await send('/setup')).status,200);
  assert.equal((await send('/app.js')).status,200);
  pass('packaged storefront, setup and assets served with security headers');
  assert.equal((await (await send('/api/catalog')).json()).checkoutEnabled,true);
  assert.equal((await buy()).status,503);
  const before=await db.prepare('SELECT id,status FROM orders').first();assert.equal(before.status,'pending');
  pass('provider outage leaves a durable pending order');
  const response=await buy();assert.equal(response.status,200,JSON.stringify({body:await response.clone().text(),requests}));const order=await response.json();
  assert.equal(order.id,before.id);assert.equal(order.amount,'4.000000');assert.equal(order.status,'pending');
  assert.equal(order.checkoutUrl,`${provider}/checkout/pi_independent`);
  assert.equal(requests[0].amount,'4.000000');assert.equal(requests[0].idempotencyKey,requests[1].idempotencyKey);
  assert.deepEqual(requests[1].seller,{marketplaceId:'market',sellerId:'seller',merchantAccountId:'merchant'});
  assert.equal(requests[1].returnUrl,`${origin}/orders/${order.id}`);
  pass('same order recovered with server pricing, fixed seller and stable gateway idempotency');
  assert.equal((await send(`/api/orders/${order.id}`)).status,401);
  assert.equal((await send(`/api/orders/${order.id}`,{headers:{authorization:`Bearer ${'B'.repeat(43)}`}})).status,404);
  const returned=await send(`/orders/${order.id}?paid=true`);assert.equal(returned.status,200);
  assert.match(await returned.text(),/Forma/);assert.equal((await (await status(order.id)).json()).status,'pending');
  pass('private order access and browser return cannot mark payment successful');
  const event={id:'evt_independent',type:'payment.verified',version:'2026-08-23',createdAt:new Date().toISOString(),data:{
    externalOrderId:order.id,paymentIntentId:'pi_independent',marketplaceId:'market',sellerId:'seller',merchantAccountId:'merchant',
    status:'succeeded',amount:'4.000000',amountAtomic:'4000000',asset:'USDC',network:'arc-testnet',merchantAddress:recipient,
    transactionHash:transaction,buyerAddress:null,orderContext:null}};
  assert.equal((await postEvent(event,true)).status,401);
  assert.equal((await postEvent({...event,data:{...event.data,amountAtomic:'1'}})).status,409);
  assert.equal((await (await status(order.id)).json()).status,'pending');
  pass('tampered and signed-but-mismatched webhooks cannot settle');
  for(const r of await Promise.all(Array.from({length:10},()=>postEvent(event))))assert.equal(r.status,200);
  const counts=await db.prepare('SELECT (SELECT count(*) FROM orders) orders,(SELECT count(*) FROM acceptedEvents) events,(SELECT count(*) FROM fulfillmentJobs) jobs').first();
  assert.deepEqual(counts,{orders:1,events:1,jobs:1});
  assert.equal((await (await status(order.id)).json()).fulfillment,'queued');
  pass('ten duplicate webhooks yield one payment event and one queued job');
  await mf.dispose();mf=new Miniflare({...convertV4MiniflareOptions(options),resourcePersistencePath:persist});db=await mf.getD1Database('DB');
  const recovered=await (await status(order.id)).json();assert.equal(recovered.status,'paid',JSON.stringify(recovered));assert.equal(recovered.transactionHash,transaction);
  assert.equal((await postEvent(event)).status,200);assert.equal((await db.prepare('SELECT count(*) n FROM fulfillmentJobs').first()).n,1);
  pass('fresh runtime recovers paid order from persisted D1 and safely accepts replay');
  console.log(JSON.stringify({version:meta.version,checks:passed,provider:'fixture',database:'local D1',chainPayment:false}));
} finally {await mf.dispose();}
