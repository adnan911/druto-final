import { createHash, randomBytes } from "node:crypto";
import { getAddress, verifyMessage } from "viem";

export const OWNERSHIP_CHALLENGE_TTL_MS = 10 * 60 * 1000;

export function buildOwnershipMessage(input: { marketplaceId: string; sellerId: string; walletAddress: string; nonce: string; origin: string }) {
  return [
    "Druto seller wallet ownership verification",
    "",
    `Domain: ${input.origin}`,
    `Marketplace: ${input.marketplaceId}`,
    `Seller: ${input.sellerId}`,
    `Wallet: ${getAddress(input.walletAddress as `0x${string}`)}`,
    "Network: Arc Testnet",
    `Nonce: ${input.nonce}`,
    "",
    "Signing this message does not send a transaction or move funds.",
  ].join("\n");
}

export function createOwnershipChallenge(input: { marketplaceId: string; sellerId: string; walletAddress: string; origin: string }, now = new Date()) {
  const nonce = randomBytes(24).toString("hex");
  const message = buildOwnershipMessage({ ...input, nonce });
  return { nonce, nonceHash: createHash("sha256").update(nonce).digest("hex"), message, expiresAt: new Date(now.getTime() + OWNERSHIP_CHALLENGE_TTL_MS) };
}

export function isOwnershipChallengeUsable(input: { usedAt: Date | null; expiresAt: Date }, now = new Date()) {
  return input.usedAt === null && input.expiresAt.getTime() > now.getTime();
}

export function canApproveSeller(input: { walletVerifiedAt: Date | null }) {
  return input.walletVerifiedAt !== null;
}

export async function verifyOwnershipSignature(input: { walletAddress: string; message: string; signature: `0x${string}` }) {
  try { return await verifyMessage({ address: getAddress(input.walletAddress as `0x${string}`), message: input.message, signature: input.signature }); } catch { return false; }
}

export function hashOwnershipNonce(nonce: string) { return createHash("sha256").update(nonce).digest("hex"); }
