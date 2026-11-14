export const developerSdkSnippet = `import { Druto } from "@druto/sdk";

// Node server. In a Worker use env.DRUTO_API_KEY and env.DRUTO_BASE_URL.
const druto = new Druto({ apiKey: process.env.DRUTO_API_KEY!, baseUrl: process.env.DRUTO_BASE_URL });
// Load an authenticated pending order and trusted amount from your database.
const session = await druto.createPayment({
  externalOrderId: order.id,
  idempotencyKey: order.idempotencyKey,
  itemName: order.title,
  amount: order.amountUsdc,
  seller: { marketplaceId: order.marketplaceId, sellerId: order.sellerId },
  returnUrl: "https://shop.example/orders/" + order.id
});

// Persist the intent/order binding before exposing the hosted checkout URL.
await bindIntentToOrder(order.id, session.id);
return Response.json({ checkoutUrl: session.checkoutUrl });`;

export const developerIntegrationSteps = ["Register the seller", "Request the ownership challenge", "Sign the message with the seller wallet", "Create and bind a seller-routed intent", "Return the hosted checkout URL to the buyer", "Scan or open the checkout on the buyer device", "Verify the signed event and fulfill once"] as const;

export function getDeveloperContractSummary() {
  return { network: "Arc Testnet", asset: "USDC", buyerMethods: ["hosted EVM wallet checkout", "QR link to hosted checkout"], qrSupport: "QR opens the hosted checkout URL; wallet support depends on browser or wallet app", sellerOwnership: "offchain personal-signature challenge; no transaction required", requiredFields: ["externalOrderId", "idempotencyKey", "amount", "seller.marketplaceId", "seller.sellerId", "returnUrl"] };
}
