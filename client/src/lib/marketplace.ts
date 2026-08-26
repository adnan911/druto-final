export type MarketplaceCartProduct = { id: string; price: number };
export type MarketplaceCartLine = { productId: string; quantity: number };
export type MarketplaceOrderContext = { items: Array<{ productId: string; name: string; seller: string; unitPrice: number; quantity: number }>; delivery: string; shippingAddress: { name: string; line1: string; city: string; postalCode: string; country: string }; buyerEmail: string };
export type MarketplaceCatalogProduct = { id: string; name: string; seller: string; sellerId: string; price: number };
export type MarketplaceSellerGroup = { sellerId: string; seller: string; lines: MarketplaceCartLine[]; context: MarketplaceOrderContext; subtotal: number; shipping: number; total: number };
export type MarketplacePaymentQueue = { orderId: string; intentIds: string[]; checkoutUrls: string[]; sellerNames: string[] };
export class MarketplacePaymentQueueError extends Error {
  constructor(public readonly queue: MarketplacePaymentQueue, message: string) {
    super(message);
    this.name = "MarketplacePaymentQueueError";
  }
}

export function calculateMarketplaceTotals(lines: MarketplaceCartLine[], products: MarketplaceCartProduct[], delivery: string) {
  const details = lines.map(line => ({ ...line, product: products.find(product => product.id === line.productId) })).filter(line => line.product);
  const subtotal = details.reduce((sum, line) => sum + line.product!.price * line.quantity, 0);
  const shipping = delivery === "Digital delivery" ? 0 : 0.25;
  return { subtotal, shipping, total: subtotal + shipping, details };
}

export function buildMarketplaceOrderContext(lines: MarketplaceCartLine[], products: Array<{ id: string; name: string; seller: string; price: number }>, delivery: string, shippingAddress: MarketplaceOrderContext["shippingAddress"], buyerEmail: string): MarketplaceOrderContext {
  return { items: lines.flatMap(line => { const product = products.find(item => item.id === line.productId); return product ? [{ productId: product.id, name: product.name, seller: product.seller, unitPrice: product.price, quantity: line.quantity }] : []; }), delivery, shippingAddress, buyerEmail };
}

export function splitMarketplaceCartBySeller(lines: MarketplaceCartLine[], products: MarketplaceCatalogProduct[], delivery: string, shippingAddress: MarketplaceOrderContext["shippingAddress"], buyerEmail: string): MarketplaceSellerGroup[] {
  const grouped = new Map<string, { seller: string; lines: MarketplaceCartLine[] }>();
  for (const line of lines) {
    const product = products.find(item => item.id === line.productId);
    if (!product) continue;
    const group = grouped.get(product.sellerId) ?? { seller: product.seller, lines: [] };
    group.lines.push(line);
    grouped.set(product.sellerId, group);
  }
  const entries = Array.from(grouped.entries());
  const shippingCents = delivery === "Digital delivery" ? 0 : 25;
  const baseShippingCents = entries.length ? Math.floor(shippingCents / entries.length) : 0;
  const remainderCents = entries.length ? shippingCents % entries.length : 0;
  return entries.map(([sellerId, group], index) => {
    const context = buildMarketplaceOrderContext(group.lines, products, delivery, shippingAddress, buyerEmail);
    const subtotal = group.lines.reduce((sum, line) => { const product = products.find(item => item.id === line.productId); return sum + (product?.price ?? 0) * line.quantity; }, 0);
    const shipping = (baseShippingCents + (index < remainderCents ? 1 : 0)) / 100;
    return { sellerId, seller: group.seller, lines: group.lines, context, subtotal, shipping, total: subtotal + shipping };
  });
}

export async function prepareMarketplaceSellerPayments(orderId: string, groups: MarketplaceSellerGroup[], marketplaceId: string, createIntent: (payload: ReturnType<typeof buildMarketplaceCheckoutPayload>) => Promise<{ id: string; checkoutUrl: string }>, persistQueue: (queue: MarketplacePaymentQueue) => void) {
  let queue: MarketplacePaymentQueue = { orderId, intentIds: [], checkoutUrls: [], sellerNames: [] };
  persistQueue(queue);
  try {
    for (const group of groups) {
      const itemName = group.context.items.map(item => `${item.name} × ${item.quantity}`).join(", ");
      const result = await createIntent(buildMarketplaceCheckoutPayload(`${orderId}-${group.sellerId}`, itemName, group.total, group.context, { marketplaceId, sellerId: group.sellerId }));
      queue = appendMarketplacePayment(queue, { id: result.id, checkoutUrl: result.checkoutUrl, sellerName: group.seller });
      persistQueue(queue);
    }
    return queue;
  } catch (error) {
    throw new MarketplacePaymentQueueError(queue, error instanceof Error ? error.message : "Unable to prepare seller payment");
  }
}

export function appendMarketplacePayment(queue: MarketplacePaymentQueue, payment: { id: string; checkoutUrl: string; sellerName: string }) {
  return { ...queue, intentIds: [...queue.intentIds, payment.id], checkoutUrls: [...queue.checkoutUrls, payment.checkoutUrl], sellerNames: [...queue.sellerNames, payment.sellerName] };
}

export function getNextMarketplaceCheckout(queue: MarketplacePaymentQueue, intentId: string) {
  const index = queue.intentIds.indexOf(intentId);
  if (index < 0 || index >= queue.checkoutUrls.length - 1) return null;
  return { index: index + 1, sellerName: queue.sellerNames[index + 1] ?? "next seller", checkoutUrl: queue.checkoutUrls[index + 1] };
}

export function parseMarketplaceOrderContext(serialized: string | null | undefined) {
  if (!serialized) return null;
  try {
    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as MarketplaceOrderContext;
  } catch {
    return null;
  }
}

export type SellerRouting = { marketplaceId: string; sellerId: string; merchantAccountId?: string };

export function buildMarketplaceCheckoutPayload(orderId: string, itemName: string, amount: number, context: MarketplaceOrderContext, seller?: SellerRouting) {
  return { externalOrderId: orderId, idempotencyKey: `marketplace-${orderId}`, itemName, buyerLabel: context.buyerEmail, returnUrl: "/marketplace", amount: amount.toFixed(2), orderContext: context, seller };
}

export function updateMarketplaceQuantity(lines: MarketplaceCartLine[], productId: string, quantity: number) {
  if (quantity < 1) return lines.filter(line => line.productId !== productId);
  return lines.map(line => line.productId === productId ? { ...line, quantity } : line);
}
