import { describe, expect, it } from "vitest";
import { dashboardAccessState, isPrivySession, isPublicProductRoute, isWalletSession } from "./access";

describe("Druto product access contract", () => {
  it("keeps the landing, Developer Hub, checkout, and receipt routes public", () => {
    expect(isPublicProductRoute("/")).toBe(true);
    expect(isPublicProductRoute("/developers")).toBe(true);
    expect(isPublicProductRoute("/checkout/pi_demo")).toBe(true);
    expect(isPublicProductRoute("/receipt/pi_demo")).toBe(true);
    expect(isPublicProductRoute("/dashboard")).toBe(false);
  });

  it("accepts wallet, Privy, and account sessions for the dashboard", () => {
    expect(isWalletSession(null)).toBe(false);
    expect(isPrivySession(null)).toBe(false);
    expect(dashboardAccessState(null)).toBe("connect_wallet");
    expect(dashboardAccessState({ openId: "oauth-user-1" })).toBe("workspace");
    expect(isWalletSession({ openId: "wallet:0xabc" })).toBe(true);
    expect(dashboardAccessState({ openId: "wallet:0xabc" })).toBe("workspace");
    expect(isPrivySession({ openId: "privy:did:privy:abc123" })).toBe(true);
    expect(dashboardAccessState({ openId: "privy:did:privy:abc123" })).toBe("workspace");
  });
});
