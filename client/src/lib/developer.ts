export const developerSdkSnippet = `import { Druto } from "@druto/sdk";

// Server or Cloudflare Worker only; keep the API key out of browser code.
const druto = new Druto({ apiKey: process.env.DRUTO_API_KEY! });
const session = await druto.createPayment({
  externalOrderId: "order_123",
  idempotencyKey: "order_123_seller_456_v1",
  itemName: "Arc Testnet order",
  amount: "1.00",
  seller: { marketplaceId: "your-marketplace", sellerId: "seller_456" },
  returnUrl: "https://shop.example/orders/order_123"
});

// Redirect the buyer to session.checkoutUrl from your browser.`;

export const developerIntegrationSteps = ["Register the seller", "Request the ownership challenge", "Sign the message with the seller wallet", "Create a seller-routed intent", "Open Druto wallet/QR checkout", "Verify and fulfill"] as const;

export function getDeveloperContractSummary() {
  return { network: "Arc Testnet", asset: "USDC", buyerMethods: ["wallet", "QR"], sellerOwnership: "offchain personal-signature challenge; no transaction required", requiredFields: ["externalOrderId", "idempotencyKey", "amount", "seller.marketplaceId", "seller.sellerId", "returnUrl"] };
}
