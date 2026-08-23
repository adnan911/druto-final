import { describe, expect, it } from "vitest";
import { WALLET_LOGIN_CHALLENGE_TTL_MS, buildWalletLoginMessage, createWalletLoginChallenge, hashWalletLoginNonce, isWalletLoginChallengeUsable, walletOpenId } from "./wallet-auth";

const wallet = "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217";

describe("wallet login helpers", () => {
  it("binds the login message to origin, wallet, network, and nonce", () => {
    const message = buildWalletLoginMessage({ walletAddress: wallet, nonce: "nonce-123", origin: "https://druto.example" });
    expect(message).toContain("Druto dashboard wallet login");
    expect(message).toContain("Domain: https://druto.example");
    expect(message).toContain("Wallet: 0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217");
    expect(message).toContain("Network: Arc Testnet");
    expect(message).toContain("Nonce: nonce-123");
    expect(message).toContain("does not send a transaction");
  });

  it("creates a hashed one-time challenge with the configured TTL", () => {
    const now = new Date("2026-08-23T00:00:00.000Z");
    const challenge = createWalletLoginChallenge({ walletAddress: wallet, origin: "https://druto.example" }, now);
    expect(challenge.nonceHash).toBe(hashWalletLoginNonce(challenge.nonce));
    expect(challenge.expiresAt.getTime()).toBe(now.getTime() + WALLET_LOGIN_CHALLENGE_TTL_MS);
    expect(isWalletLoginChallengeUsable({ usedAt: null, expiresAt: challenge.expiresAt }, new Date(now.getTime() + 1000))).toBe(true);
    expect(isWalletLoginChallengeUsable({ usedAt: null, expiresAt: challenge.expiresAt }, challenge.expiresAt)).toBe(false);
    expect(isWalletLoginChallengeUsable({ usedAt: new Date(now.getTime() + 1000), expiresAt: challenge.expiresAt }, new Date(now.getTime() + 2000))).toBe(false);
  });

  it("uses a normalized wallet-scoped openId", () => {
    expect(walletOpenId(wallet)).toBe("wallet:0xa32c7bbb2fb634bed4dfc812c15af87a0c727217");
  });
});
