import { describe, expect, it } from "vitest";
import { developerIntegrationSteps, developerSdkSnippet, getDeveloperContractSummary } from "./developer";

describe("developer integration kit content", () => {
  it("documents the minimal hosted checkout flow", () => {
    expect(developerSdkSnippet).toContain("@druto/sdk");
    expect(developerSdkSnippet).toContain('environment: "testnet"');
    expect(developerSdkSnippet).toContain("openCheckout");
    expect(developerSdkSnippet).toContain('sellerId: "seller_456"');
  });

  it("exposes the required Arc Testnet contract fields", () => {
    expect(getDeveloperContractSummary()).toMatchObject({ network: "Arc Testnet", asset: "USDC", requiredFields: expect.arrayContaining(["externalOrderId", "idempotencyKey", "amount", "returnUrl"]) });
    expect(developerIntegrationSteps).toEqual(["Onboard the seller", "Create a seller-routed intent", "Open Druto wallet/QR checkout", "Verify and fulfill"]);
  });
});
