import { describe, expect, it } from "vitest";
import { buildPaymentVerifiedEvent, decryptWebhookSecret, encryptWebhookSecret, isReplaySafe, nextRetryAt, signWebhookPayload, verifyWebhookSignature } from "./webhooks";

describe("signed fulfillment webhooks", () => {
  it("round-trips encrypted endpoint secrets", () => {
    const secret = "whsec_test_secret";
    expect(decryptWebhookSecret(encryptWebhookSecret(secret))).toBe(secret);
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
