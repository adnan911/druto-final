export const developerSdkSnippet = `import { DrutoCheckout } from "@druto/sdk";

const checkout = new DrutoCheckout({
  environment: "testnet",
  network: "arc",
  asset: "USDC"
});

const session = await checkout.createPayment({
  orderId: "order_123",
  amount: "1.00",
  buyerEmail: "buyer@example.com",
  returnUrl: "https://shop.example/paid"
});

window.location.href = session.checkoutUrl;`;

export const developerIntegrationSteps = ["Create an intent", "Open Druto", "Verify transfer", "Fulfill and reconcile"] as const;

export function getDeveloperContractSummary() {
  return { network: "Arc Testnet", asset: "USDC", buyerMethods: ["wallet", "QR"], requiredFields: ["externalOrderId", "idempotencyKey", "amount", "returnUrl"] };
}
