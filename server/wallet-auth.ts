import { createHash, randomBytes } from "node:crypto";
import { getAddress } from "viem";

export const WALLET_LOGIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function buildWalletLoginMessage(input: { walletAddress: string; nonce: string; origin: string }) {
  return [
    "Druto dashboard wallet login",
    "",
    `Domain: ${input.origin}`,
    `Wallet: ${getAddress(input.walletAddress as `0x${string}`)}`,
    "Network: Arc Testnet",
    `Nonce: ${input.nonce}`,
    "",
    "Signing this message creates a Druto session only. It does not send a transaction or move funds.",
  ].join("\n");
}

export function createWalletLoginChallenge(input: { walletAddress: string; origin: string }, now = new Date()) {
  const nonce = randomBytes(24).toString("hex");
  return {
    nonce,
    nonceHash: createHash("sha256").update(nonce).digest("hex"),
    message: buildWalletLoginMessage({ ...input, nonce }),
    expiresAt: new Date(now.getTime() + WALLET_LOGIN_CHALLENGE_TTL_MS),
  };
}

export function isWalletLoginChallengeUsable(input: { usedAt: Date | null; expiresAt: Date }, now = new Date()) {
  return input.usedAt === null && input.expiresAt.getTime() > now.getTime();
}

export function walletOpenId(walletAddress: string) {
  return `wallet:${getAddress(walletAddress as `0x${string}`).toLowerCase()}`;
}

export function hashWalletLoginNonce(nonce: string) {
  return createHash("sha256").update(nonce).digest("hex");
}
