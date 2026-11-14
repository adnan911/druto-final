import { describe, expect, it } from "vitest";
import { developerIntegrationSteps, developerSdkSnippet, getDeveloperContractSummary } from "./developer";

describe("developer integration kit content", () => {
  it("documents the minimal hosted checkout flow", () => {
    expect(developerSdkSnippet).toContain("@druto/sdk");
    expect(developerSdkSnippet).toContain("process.env.DRUTO_API_KEY");
    expect(developerSdkSnippet).toContain("idempotencyKey:");
    expect(developerSdkSnippet).toContain("session.checkoutUrl");
    expect(developerSdkSnippet).toContain("await bindIntentToOrder(order.id, session.id)");
  });

  it("exposes the required Arc Testnet contract fields", () => {
    expect(getDeveloperContractSummary()).toMatchObject({ network: "Arc Testnet", asset: "USDC", requiredFields: expect.arrayContaining(["externalOrderId", "idempotencyKey", "amount", "returnUrl"]) });
    expect(getDeveloperContractSummary().qrSupport).toContain("QR opens the hosted checkout URL");
    expect(developerIntegrationSteps).toEqual(["Register the seller", "Request the ownership challenge", "Sign the message with the seller wallet", "Create and bind a seller-routed intent", "Return the hosted checkout URL to the buyer", "Scan or open the checkout on the buyer device", "Verify the signed event and fulfill once"]);
  });
});
