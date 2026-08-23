export type MarketplaceCartProduct = { id: string; price: number };
export type MarketplaceCartLine = { productId: string; quantity: number };
export type MarketplaceOrderContext = { items: Array<{ productId: string; name: string; seller: string; unitPrice: number; quantity: number }>; delivery: string; shippingAddress: { name: string; line1: string; city: string; postalCode: string; country: string }; buyerEmail: string };

export function calculateMarketplaceTotals(lines: MarketplaceCartLine[], products: MarketplaceCartProduct[], delivery: string) {
  const details = lines.map(line => ({ ...line, product: products.find(product => product.id === line.productId) })).filter(line => line.product);
  const subtotal = details.reduce((sum, line) => sum + line.product!.price * line.quantity, 0);
  const shipping = delivery === "Digital delivery" ? 0 : 0.25;
  return { subtotal, shipping, total: subtotal + shipping, details };
}

export function buildMarketplaceOrderContext(lines: MarketplaceCartLine[], products: Array<{ id: string; name: string; seller: string; price: number }>, delivery: string, shippingAddress: MarketplaceOrderContext["shippingAddress"], buyerEmail: string): MarketplaceOrderContext {
  return { items: lines.flatMap(line => { const product = products.find(item => item.id === line.productId); return product ? [{ productId: product.id, name: product.name, seller: product.seller, unitPrice: product.price, quantity: line.quantity }] : []; }), delivery, shippingAddress, buyerEmail };
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
