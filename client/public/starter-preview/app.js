const $=id=>document.getElementById(id);
let products=[],enabled=false,selected,quantity=1,pollTimer,checks=0;
const money=value=>{const [whole,fraction='']=String(value).split('.');return `${whole}.${fraction.padEnd(2,'0').replace(/0+$/,'').padEnd(2,'0')}`;};
const make=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};
function notify(message){$('toast').textContent=message;$('toast').classList.remove('hidden');setTimeout(()=>$('toast').classList.add('hidden'),2400);}
function stored(key){try{return sessionStorage.getItem(key);}catch{return null;}}
function save(key,value){try{sessionStorage.setItem(key,value);}catch{throw new Error('Enable browser session storage to keep your order accessible, then retry.');}}
function capability(){const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function api(path,options={}){let response;try{response=await fetch(path,{...options,signal:AbortSignal.timeout(15000)});}catch{throw new Error('Connection interrupted. Retry to recover the same order.');}const data=await response.json();if(!response.ok)throw new Error(data.error??'Please try again.');return data;}
function updateTotal(){const units=BigInt(selected.amountAtomic)*BigInt(quantity);$('total').textContent=money(`${units/1000000n}.${(units%1000000n).toString().padStart(6,'0')}`);$('quantity').textContent=quantity;$('minus').disabled=quantity===1;$('plus').disabled=quantity===10;}
function choose(product){selected=product;quantity=1;$('checkout-title').textContent=product.title;$('summary-description').textContent=product.description;$('summary-art').className=`summary-art ${product.art}`;$('checkout-error').classList.add('hidden');$('checkout-pay').disabled=!enabled;$('checkout-hint').textContent=enabled?'Review and approve the transfer in your own wallet.':'Preview mode. The store owner needs to finish setup before payments can open.';updateTotal();$('checkout-dialog').showModal();}
for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>$(button.dataset.close).close());
$('setup-open').addEventListener('click',()=>$('setup-dialog').showModal());
$('minus').addEventListener('click',()=>{if(quantity>1)quantity--;updateTotal();});$('plus').addEventListener('click',()=>{if(quantity<10)quantity++;updateTotal();});
$('checkout-pay').addEventListener('click',async()=>{
  const button=$('checkout-pay');button.disabled=true;button.textContent='Preparing your checkout…';$('checkout-error').classList.add('hidden');
  try{
    const key=`druto-selection:${selected.id}:${quantity}`;let token=stored(key);if(!token){token=capability();save(key,token);}
    const order=await api('/api/orders',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({productId:selected.id,quantity})});
    save(`druto-order:${order.id}`,token);
    if(order.status==='expired'){sessionStorage.removeItem(key);throw new Error('That checkout expired. Click again to start a fresh order.');}
    if(order.status==='paid'){sessionStorage.removeItem(key);location.assign(`/orders/${order.id}`);return;}
    if(!order.checkoutUrl)throw new Error('Checkout is still being prepared. Please retry.');
    const destination=new URL(order.checkoutUrl);
    if(destination.protocol!=='https:')throw new Error('Checkout link needs review. Contact the store.');
    location.assign(destination.href);
  }catch(error){$('checkout-error').textContent=error.message;$('checkout-error').classList.remove('hidden');button.disabled=false;button.textContent='Try checkout again ↗';}
});
function details(order){const list=$('order-details');list.replaceChildren();for(const [label,value] of [['Item',`${order.title} × ${order.quantity}`],['Total',`${money(order.amount)} USDC`],['Order reference',order.id],...(order.transactionHash?[['Transaction',order.transactionHash]]:[])]){const row=make('div','detail-row');row.append(make('dt','',label),make('dd','',value));list.append(row);}}
async function showOrder(id){
  clearTimeout(pollTimer);const token=stored(`druto-order:${id}`);
  try{
    if(!token)throw new Error('This order is private to the browser session that created it. Reopen it in that session, or contact the store with your order reference.');
    const order=await api(`/api/orders/${id}`,{headers:{authorization:`Bearer ${token}`}});details(order);
    const paid=order.status==='paid',expired=order.status==='expired';
    if(paid || expired){try{for(const name of Object.keys(sessionStorage))if(name.startsWith('druto-selection:') && sessionStorage.getItem(name)===token)sessionStorage.removeItem(name);}catch{/* Order access stays available in the current tab. */}}
    $('status-badge').textContent=paid?'Payment confirmed':expired?'Checkout expired':'Awaiting confirmation';
    $('status-icon').textContent=paid?'✓':expired?'↻':'◷';
    $('order-title').textContent=paid?'All paid. Thank you.':expired?'Let’s start fresh.':'Your order is saved.';
    $('order-message').textContent=paid?'Your USDC payment is verified. The store has your order queued for fulfillment. This demo does not deliver a download.':expired?'This payment link has expired. Return to the collection to create a new checkout.':"If you’ve paid, confirmation can take a moment. Don’t send another payment while it’s being checked.";
    const actions=$('order-actions');actions.replaceChildren();
    if(!paid && !expired){const refresh=make('button','secondary','Check payment status');refresh.addEventListener('click',()=>{checks=0;showOrder(id);});actions.append(refresh);if(checks++<10)pollTimer=setTimeout(()=>showOrder(id),5000);}
    if(expired || paid){const back=make('a','primary full','Back to the collection ↗');back.href='/';actions.append(back);}
    const copy=make('button','secondary','Copy order reference');copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(id);notify('Order reference copied');}catch{notify('Copy the reference shown above');}});actions.append(copy);
  }catch(error){$('status-badge').textContent='Status unavailable';$('order-title').textContent='Your order stays private.';$('order-message').textContent=error.message;$('order-actions').replaceChildren();const retry=make('button','secondary','Try checking again');retry.addEventListener('click',()=>showOrder(id));$('order-actions').append(retry);const ref=make('p','muted',`Order reference: ${id}`);$('order-actions').append(ref);}
}
async function start(){
  const match=location.pathname.match(/^\/orders\/(ord_[\da-f-]{36})$/);
  if(match){for(const element of document.querySelectorAll('#store-hero,#collection,.how'))element.classList.add('hidden');$('order-view').classList.remove('hidden');await showOrder(match[1]);return;}
  try{const preview=document.body.dataset.preview==='true';const data=await api(preview?'./catalog.json':'/api/catalog');products=data.products;enabled=!preview && data.checkoutEnabled;$('products').replaceChildren();for(const product of products){const card=make('article','product');const art=make('button',`product-art ${product.art}`);art.setAttribute('aria-label',`View ${product.title}, ${money(product.price)} USDC`);art.append(make('span','art-number',`OBJECT / ${product.edition}`),make('span','art-arrow','↗'));art.addEventListener('click',()=>choose(product));const meta=make('div','product-meta');const name=make('button','product-link');name.append(make('h3','',product.title));name.addEventListener('click',()=>choose(product));const price=make('span','product-price',`${money(product.price)} `);price.append(make('small','','USDC'));meta.append(name,price);card.append(art,meta,make('p','product-category',product.category));$('products').append(card);}}
  catch{$('products').replaceChildren();$('catalog-error').textContent='The collection could not load. Please refresh in a moment.';$('catalog-error').classList.remove('hidden');}
}
start();
