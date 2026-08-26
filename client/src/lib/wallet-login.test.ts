import { describe, expect, it } from "vitest";
import { getWalletLoginMode, walletLoginMessage, walletProviderAvailable } from "./wallet-login";

describe("wallet login mode", () => {
  it("uses direct signing when an injected provider is available", () => {
    const provider = { request: async () => [] };
    expect(walletProviderAvailable(provider)).toBe(true);
    expect(getWalletLoginMode(provider, true)).toBe("injected");
  });

  it("falls back to hosted wallet login when Privy is ready without an extension", () => {
    expect(walletProviderAvailable(undefined)).toBe(false);
    expect(getWalletLoginMode(undefined, true)).toBe("hosted");
    expect(walletLoginMessage("hosted")).toContain("hosted wallet login");
  });

  it("reports unavailable only while hosted wallet configuration is not ready", () => {
    expect(getWalletLoginMode(undefined, false)).toBe("unavailable");
    expect(walletLoginMessage("unavailable")).toContain("MetaMask or Rabby");
  });
});
