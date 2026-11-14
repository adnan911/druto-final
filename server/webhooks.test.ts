import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPaymentVerifiedEvent, decryptWebhookSecret, encryptWebhookSecret, isAllowedWebhookOrigin, isReplaySafe, isValidWebhookUrl, nextRetryAt, signWebhookPayload, verifyWebhookSignature } from "./webhooks";

afterEach(() => vi.unstubAllEnvs());

describe("signed fulfillment webhooks", () => {
  it("round-trips encrypted endpoint secrets", () => {
    const secret = "whsec_test_secret";
    expect(decryptWebhookSecret(encryptWebhookSecret(secret))).toBe(secret);
  });

  it("keeps webhook encryption independent of the session signing key", () => {
    vi.stubEnv("DRUTO_WEBHOOK_ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("JWT_SECRET", "first-session-key");
    const ciphertext = encryptWebhookSecret("whsec_test_secret");
    vi.stubEnv("JWT_SECRET", "second-session-key");
    expect(decryptWebhookSecret(ciphertext)).toBe("whsec_test_secret");
    expect(ciphertext.startsWith("v1.")).toBe(true);
  });

  it("fails closed on a missing or malformed production encryption key", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DRUTO_WEBHOOK_ENCRYPTION_KEY", "");
    expect(() => encryptWebhookSecret("secret")).toThrow("required in production");
    vi.stubEnv("DRUTO_WEBHOOK_ENCRYPTION_KEY", "too-short");
    expect(() => encryptWebhookSecret("secret")).toThrow("32 bytes");
    vi.stubEnv("DRUTO_WEBHOOK_ENCRYPTION_KEY", "cd".repeat(32));
    expect(decryptWebhookSecret(encryptWebhookSecret("secret"))).toBe("secret");
    expect(() => decryptWebhookSecret("old.unversioned.value")).toThrow("Invalid webhook secret ciphertext");
  });

  it("requires an exact operator-approved public HTTPS origin", () => {
    vi.stubEnv("DRUTO_WEBHOOK_ALLOWED_ORIGINS", "https://market.example");
    expect(isAllowedWebhookOrigin("https://market.example/hooks")).toBe(true);
    for (const url of ["http://localhost/hooks", "https://localhost/hooks", "https://127.0.0.1/hooks", "https://[::1]/hooks", "https://user:pass@market.example/hooks", "https://market.example/hooks#fragment", "https://internal.local/hooks"]) {
      expect(isValidWebhookUrl(url)).toBe(false);
      expect(isAllowedWebhookOrigin(url)).toBe(false);
    }
    expect(isValidWebhookUrl("https://market.example.evil/hooks")).toBe(true);
    expect(isAllowedWebhookOrigin("https://market.example.evil/hooks")).toBe(false);
  });

  it("accepts an untampered signature and rejects modified or stale payloads", () => {
    const signed = signWebhookPayload("secret", '{"ok":true}', 1_000);
    expect(verifyWebhookSignature("secret", '{"ok":true}', signed.header, 1_100)).toBe(true);
    expect(verifyWebhookSignature("secret", '{"ok":false}', signed.header, 1_100)).toBe(false);
    expect(verifyWebhookSignature("secret", '{"ok":true}', signed.header, 1_301)).toBe(false);
  });

  it("builds a fulfillment-ready payment.verified event", () => {
    const intent = { id: "pi_1", externalOrderId: "order_1", marketplaceId: "market", sellerId: "seller", merchantAccountId: "ma_1", buyerAddress: "0x1111111111111111111111111111111111111111", merchantAddress: "0x2222222222222222222222222222222222222222", orderContext: JSON.stringify({ items: [{ productId: "p1", name: "Item", seller: "Seller", unitPrice: 1, quantity: 2 }], delivery: "digital", shippingAddress: { name: "Buyer", line1: "1 Main", city: "Arc City", postalCode: "10001", country: "US" }, buyerEmail: "buyer@example.com" }) };
    const transaction = { transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", amountAtomic: "2000000" };
    const event = buildPaymentVerifiedEvent(intent as never, transaction as never, "evt_fixed");
    expect(event).toMatchObject({ id: "evt_fixed", type: "payment.verified", data: { paymentIntentId: "pi_1", externalOrderId: "order_1", amount: "2.000000", transactionHash: transaction.transactionHash, orderContext: { items: [{ quantity: 2 }] } } });
  });

  it("prevents duplicate event IDs and increases retry delay", () => {
    const seen = new Set<string>();
    expect(isReplaySafe("evt_1", seen)).toBe(true);
    expect(isReplaySafe("evt_1", seen)).toBe(false);
    expect(nextRetryAt(2, new Date(0)).getTime()).toBe(4_000);
  });
});
