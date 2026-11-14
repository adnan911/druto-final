import { Druto, verifyPaymentWebhook } from '../vendor/druto-sdk/index.js';
import { catalog, decimal } from './catalog.js';

const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
class Problem extends Error { constructor(status,message){super(message);this.status=status;} }
async function body(request) {
  if(Number(request.headers.get('content-length')??0)>65536) throw new Problem(413,'Request is too large.');
  const reader=request.body?.getReader(); if(!reader) throw new Problem(400,'Request body is required.');
  const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done) break;size+=value.length;
    if(size>65536){await reader.cancel();throw new Problem(413,'Request is too large.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder().decode(bytes);
}
function configured(env){
  try {const url=new URL(env.APP_URL);return url.protocol==='https:' && !url.hostname.includes('your-') && !url.username && !url.password && url.pathname==='/' && !url.search && !url.hash &&
    Boolean(env.DB && env.DRUTO_API_KEY && env.DRUTO_WEBHOOK_SECRET && env.DRUTO_MARKETPLACE_ID && env.DRUTO_SELLER_ID && env.DRUTO_MERCHANT_ACCOUNT_ID) &&
    /^0x[\da-fA-F]{40}$/.test(env.DRUTO_RECEIVING_ADDRESS??'');}catch{return false;}
}
async function accessHash(request){
  const token=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if(!token) throw new Problem(401,'Open this order in the browser where you created it.');
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
function safeOrder(order){return {id:order.id,title:order.title,quantity:order.quantity,amount:decimal(order.amountAtomic),
  status:order.status==='paid'?'paid':order.expiresAt && order.expiresAt<=Date.now()?'expired':'pending',
  checkoutUrl:order.status==='pending' && order.expiresAt>Date.now()?order.checkoutUrl:null,
  expiresAt:order.expiresAt,transactionHash:order.transactionHash,fulfillment:order.status==='paid'?'queued':null};}
async function createOrder(request,env){
  const url=new URL(request.url);
  if(request.headers.get('origin')!==url.origin) throw new Problem(403,'Please start checkout from this store.');
  if(!request.headers.get('content-type')?.startsWith('application/json')) throw new Problem(415,'Send JSON.');
  const access=await accessHash(request);let input;try{input=JSON.parse(await body(request));}catch(error){if(error instanceof Problem)throw error;throw new Problem(400,'Invalid request.');}
  const product=catalog.find(p=>p.id===input?.productId),quantity=input?.quantity??1;
  if(!product || !Number.isInteger(quantity) || quantity<1 || quantity>10) throw new Problem(400,'Choose a product and a quantity between 1 and 10.');
  const id=`ord_${crypto.randomUUID()}`;
  const amount=(BigInt(product.amountAtomic)*BigInt(quantity)).toString();
  await env.DB.prepare(`INSERT INTO orders(id,accessHash,productId,quantity,title,amountAtomic,marketplaceId,sellerId,merchantAccountId,recipient,createdAt)
    VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(accessHash) DO NOTHING`).bind(id,access,product.id,quantity,product.title,amount,
    env.DRUTO_MARKETPLACE_ID,env.DRUTO_SELLER_ID,env.DRUTO_MERCHANT_ACCOUNT_ID,env.DRUTO_RECEIVING_ADDRESS.toLowerCase(),Date.now()).run();
  let order=await env.DB.prepare('SELECT * FROM orders WHERE accessHash=?').bind(access).first();
  if(!order || order.productId!==product.id || order.quantity!==quantity) throw new Problem(409,'This checkout belongs to a different selection. Start a new order.');
  // Saved price and routing survive retries even if configuration/catalog changes.
  if(!order.intentId){
    const druto=new Druto({apiKey:env.DRUTO_API_KEY,baseUrl:env.DRUTO_BASE_URL});
    let session;
    try {session=await druto.createPayment({externalOrderId:order.id,idempotencyKey:order.id,itemName:order.title,
      amount:decimal(order.amountAtomic),seller:{marketplaceId:order.marketplaceId,sellerId:order.sellerId,merchantAccountId:order.merchantAccountId},
      returnUrl:`${new URL(env.APP_URL).origin}/orders/${order.id}`});}
    catch {throw new Problem(503,'Checkout is temporarily unavailable. Retry to recover this same order.');}
    if(session.merchantAddress.toLowerCase()!==order.recipient || !Number.isFinite(Date.parse(session.expiresAt))) throw new Problem(503,'Seller configuration needs review. Please contact the store.');
    await env.DB.prepare(`UPDATE orders SET intentId=?,checkoutUrl=?,expiresAt=? WHERE id=? AND (intentId IS NULL OR intentId=?)`)
      .bind(session.id,session.checkoutUrl,Date.parse(session.expiresAt),order.id,session.id).run();
    order=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(order.id).first();
    if(order?.intentId!==session.id) throw new Problem(409,'Order needs review. Please contact the store.');
  }
  return json(safeOrder(order));
}
async function webhook(request,env){
  const rawBody=await body(request);
  const event=await verifyPaymentWebhook({secret:env.DRUTO_WEBHOOK_SECRET,rawBody,
    signature:request.headers.get('druto-signature')??'',eventId:request.headers.get('x-druto-event-id')??undefined});
  if(!event) throw new Problem(401,'Invalid event.');
  const d=event.data;
  if(event.version!=='2026-08-23')throw new Problem(400,'Unsupported event version.');
  try {
    await env.DB.prepare(`INSERT INTO acceptedEvents(id,orderId,intentId,amountAtomic,marketplaceId,sellerId,merchantAccountId,recipient,transactionHash,acceptedAt)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(event.id,d.externalOrderId,d.paymentIntentId,d.amountAtomic,
      d.marketplaceId,d.sellerId,d.merchantAccountId,d.merchantAddress.toLowerCase(),d.transactionHash.toLowerCase(),Date.now()).run();
  }catch{throw new Problem(409,'Event could not be accepted. Retry after order review.');}
  const stored=await env.DB.prepare('SELECT orderId,intentId,transactionHash FROM acceptedEvents WHERE id=?').bind(event.id).first();
  if(!stored || stored.orderId!==d.externalOrderId || stored.intentId!==d.paymentIntentId || stored.transactionHash!==d.transactionHash.toLowerCase()) throw new Problem(409,'Event identity conflict.');
  return json({accepted:true});
}
export default { async fetch(request,env){
  const url=new URL(request.url);let response;
  try {
    if(url.pathname.startsWith('/api/')){
      if(url.pathname==='/api/catalog' && request.method==='GET') response=json({products:catalog.map(p=>({...p,price:decimal(p.amountAtomic)})),checkoutEnabled:configured(env)});
      else {
        if(!configured(env)) throw new Problem(503,'Store setup is not complete. Please try again later.');
        if(!env.REQUEST_LIMITER) throw new Problem(503,'Checkout protection is not configured.');
        const ip=request.headers.get('cf-connecting-ip')??'unknown';
        if(!(await env.REQUEST_LIMITER.limit({key:`${url.pathname==='/api/webhooks/druto'?'webhook':'buyer'}:${ip}`})).success) throw new Problem(429,'Too many requests. Please wait a minute.');
        if(url.pathname==='/api/orders' && request.method==='POST') response=await createOrder(request,env);
        else if(url.pathname==='/api/webhooks/druto' && request.method==='POST') response=await webhook(request,env);
        else if(/^\/api\/orders\/ord_[\da-f-]{36}$/.test(url.pathname) && request.method==='GET'){
          const access=await accessHash(request);
          const order=await env.DB.prepare('SELECT * FROM orders WHERE id=? AND accessHash=?').bind(url.pathname.split('/').pop(),access).first();
          if(!order) throw new Problem(404,'Order not found in this browser session.');
          response=json(safeOrder(order));
        }else throw new Problem(404,'Not found.');
      }
    }else {
      const path=/^\/orders\/ord_[\da-f-]{36}$/.test(url.pathname)?'/':url.pathname;
      response=await env.ASSETS.fetch(new Request(new URL(path,url),request));
    }
  }catch(error){response=json({error:error instanceof Problem?error.message:'Something went wrong. Please retry; your existing order will be recovered.'},error instanceof Problem?error.status:503);}
  const headers=new Headers(response.headers);
  headers.set('x-content-type-options','nosniff');headers.set('referrer-policy','no-referrer');
  headers.set('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  headers.set('permissions-policy','camera=(), microphone=(), geolocation=()');
  return new Response(response.body,{status:response.status,headers});
}};
