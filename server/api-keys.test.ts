import { describe, expect, it } from "vitest";
import { API_KEY_PREFIX, apiKeyStatus, createApiKeyMaterial, hashApiKey } from "./api-keys";

describe("API key material", () => {
  it("creates unique server credentials with safe display metadata", () => {
    const first = createApiKeyMaterial(" Marketplace backend ");
    const second = createApiKeyMaterial("Marketplace backend");
    expect(first.name).toBe("Marketplace backend");
    expect(first.secret.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(first.secretHash).toBe(hashApiKey(first.secret));
    expect(first.lastFour).toBe(first.secret.slice(-4));
    expect(first.secretHash).not.toBe(first.secret);
    expect(second.secret).not.toBe(first.secret);
  });

  it("rejects empty or oversized key names and exposes lifecycle status only", () => {
    expect(() => createApiKeyMaterial("   ")).toThrow();
    expect(() => createApiKeyMaterial("x".repeat(121))).toThrow();
    expect(apiKeyStatus(null)).toBe("active");
    expect(apiKeyStatus(new Date())).toBe("revoked");
  });
});
