// Run on your marketplace server. Set DRUTO_API_KEY in its secret store.
import { Druto } from "@druto/sdk";

const druto = new Druto({ apiKey: process.env.DRUTO_API_KEY });
export async function createCheckoutForTrustedOrder(order) {
  return druto.createPayment({
    externalOrderId: order.id,
    idempotencyKey: `${order.id}_${order.sellerId}_v1`,
    itemName: order.title,
    amount: order.usdcAmount, // calculate on the server; never trust buyer input
    seller: { marketplaceId: order.marketplaceId, sellerId: order.sellerId },
    returnUrl: `https://shop.example/orders/${encodeURIComponent(order.id)}`,
  });
}
