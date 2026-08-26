import { verifyAccessToken } from "@privy-io/node";
import { createRemoteJWKSet } from "jose";
import { ENV } from "./_core/env";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getPrivyJwks() {
  if (!ENV.privyAppId || !ENV.privyAppSecret) throw new Error("Privy authentication is not configured");
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://auth.privy.io/v1/apps/${encodeURIComponent(ENV.privyAppId)}/jwks.json`), {
      headers: { Authorization: `Basic ${Buffer.from(`${ENV.privyAppId}:${ENV.privyAppSecret}`).toString("base64")}` },
    });
  }
  return jwks;
}

export async function verifyPrivyToken(accessToken: string) {
  if (!accessToken.trim()) throw new Error("Privy access token is missing");
  return verifyAccessToken({ access_token: accessToken, app_id: ENV.privyAppId, verification_key: getPrivyJwks() });
}

export function privyOpenId(userId: string) {
  return `privy:${userId}`;
}
