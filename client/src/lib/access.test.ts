import { describe, expect, it } from "vitest";
import { dashboardAccessState, isPublicProductRoute, isWalletSession } from "./access";

describe("Druto product access contract", () => {
  it("keeps the landing, Developer Hub, checkout, and receipt routes public", () => {
    expect(isPublicProductRoute("/")).toBe(true);
    expect(isPublicProductRoute("/developers")).toBe(true);
    expect(isPublicProductRoute("/checkout/pi_demo")).toBe(true);
    expect(isPublicProductRoute("/receipt/pi_demo")).toBe(true);
    expect(isPublicProductRoute("/dashboard")).toBe(false);
  });

  it("requires a wallet session for the dashboard", () => {
    expect(isWalletSession(null)).toBe(false);
    expect(dashboardAccessState(null)).toBe("connect_wallet");
    expect(dashboardAccessState({ openId: "oauth-user-1" })).toBe("connect_wallet");
    expect(isWalletSession({ openId: "wallet:0xabc" })).toBe(true);
    expect(dashboardAccessState({ openId: "wallet:0xabc" })).toBe("workspace");
  });
});
