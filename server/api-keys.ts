import { createHash, randomBytes } from "node:crypto";
import { nanoid } from "nanoid";

export const API_KEY_PREFIX = "druto_test_";

export function hashApiKey(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function createApiKeyMaterial(name: string) {
  const normalizedName = name.trim().replace(/\s+/g, " ");
  if (!normalizedName || normalizedName.length > 120) throw new Error("API key name must be between 1 and 120 characters");
  const secret = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    id: `key_${nanoid(14)}`,
    name: normalizedName,
    prefix: API_KEY_PREFIX,
    lastFour: secret.slice(-4),
    secretHash: hashApiKey(secret),
    secret,
  };
}

export function apiKeyStatus(revokedAt: Date | null) {
  return revokedAt ? "revoked" as const : "active" as const;
}
