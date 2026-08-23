export const developerSdkSnippet = `import { DrutoCheckout } from "@druto/sdk";

const checkout = new DrutoCheckout({
  environment: "testnet",
  network: "arc",
  asset: "USDC"
});

const session = await checkout.createPayment({
  orderId: "order_123",
  itemName: "Arc Testnet Starter × 1",
  amount: "1.00",
  buyerEmail: "buyer@example.com",
  seller: {
    marketplaceId: "your-marketplace",
    sellerId: "seller_456"
  },
  returnUrl: "https://shop.example/paid"
});

checkout.openCheckout(session);`;

export const developerIntegrationSteps = ["Onboard the seller", "Create a seller-routed intent", "Open Druto wallet/QR checkout", "Verify and fulfill"] as const;

export function getDeveloperContractSummary() {
  return { network: "Arc Testnet", asset: "USDC", buyerMethods: ["wallet", "QR"], requiredFields: ["externalOrderId", "idempotencyKey", "amount", "seller.marketplaceId", "seller.sellerId", "returnUrl"] };
}
