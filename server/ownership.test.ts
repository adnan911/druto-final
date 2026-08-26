import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { buildOwnershipMessage, canApproveSeller, createOwnershipChallenge, hashOwnershipNonce, isOwnershipChallengeUsable, OWNERSHIP_CHALLENGE_TTL_MS, verifyOwnershipSignature } from "./ownership";

const account = privateKeyToAccount("0x0123456789012345678901234567890123456789012345678901234567890123");

describe("seller wallet ownership verification", () => {
  it("binds the domain, seller, wallet, network, and nonce", () => {
    const message = buildOwnershipMessage({ marketplaceId: "marketplace-a", sellerId: "seller-1", walletAddress: account.address, nonce: "abc123", origin: "https://shop.example" });
    expect(message).toContain("Domain: https://shop.example");
    expect(message).toContain(`Wallet: ${account.address}`);
    expect(message).toContain("Network: Arc Testnet");
    expect(message).toContain("Nonce: abc123");
    expect(hashOwnershipNonce("abc123")).toBe(hashOwnershipNonce("abc123"));
    expect(hashOwnershipNonce("abc123")).not.toBe(hashOwnershipNonce("abc124"));
  });

  it("creates a ten-minute challenge expiry", () => {
    const now = new Date("2026-08-23T00:00:00.000Z");
    const challenge = createOwnershipChallenge({ marketplaceId: "m", sellerId: "s", walletAddress: account.address, origin: "https://shop.example" }, now);
    expect(challenge.expiresAt.getTime() - now.getTime()).toBe(OWNERSHIP_CHALLENGE_TTL_MS);
    expect(challenge.nonceHash).toBe(hashOwnershipNonce(challenge.nonce));
  });

  it("rejects expired and replayed challenges", () => {
    const expiresAt = new Date("2026-08-23T00:00:00.000Z");
    expect(isOwnershipChallengeUsable({ usedAt: null, expiresAt }, new Date("2026-08-22T23:59:59.000Z"))).toBe(true);
    expect(isOwnershipChallengeUsable({ usedAt: null, expiresAt }, expiresAt)).toBe(false);
    expect(isOwnershipChallengeUsable({ usedAt: new Date("2026-08-22T23:59:00.000Z"), expiresAt }, new Date("2026-08-22T23:59:30.000Z"))).toBe(false);
  });

  it("blocks approval before verification and allows it after verification", () => {
    expect(canApproveSeller({ walletVerifiedAt: null })).toBe(false);
    expect(canApproveSeller({ walletVerifiedAt: new Date("2026-08-23T00:00:00.000Z") })).toBe(true);
  });

  it("recovers the signer and rejects a different wallet", async () => {
    const message = buildOwnershipMessage({ marketplaceId: "m", sellerId: "s", walletAddress: account.address, nonce: "nonce", origin: "https://shop.example" });
    const signature = await account.signMessage({ message });
    await expect(verifyOwnershipSignature({ walletAddress: account.address, message, signature })).resolves.toBe(true);
    await expect(verifyOwnershipSignature({ walletAddress: "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217", message, signature })).resolves.toBe(false);
    await expect(verifyOwnershipSignature({ walletAddress: account.address, message: `${message}\nTampered domain`, signature })).resolves.toBe(false);
  });
});
