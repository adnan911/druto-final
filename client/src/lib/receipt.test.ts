import { describe, expect, it, vi } from "vitest";
import { buildReceiptSummary, copyReceiptValue } from "./receipt";

describe("buyer receipt utilities", () => {
  it("builds a structured marketplace receipt summary", () => {
    const summary = buildReceiptSummary({
      amountAtomic: "1250000",
      status: "succeeded",
      itemName: "Fallback item",
      buyerLabel: "fallback@example.com",
      orderContext: JSON.stringify({
        items: [{ productId: "p1", name: "API Pro", seller: "Druto Labs", unitPrice: 1, quantity: 2 }],
        delivery: "Priority delivery",
        shippingAddress: { name: "Alex Rivera", line1: "1 Market St", city: "Dhaka", postalCode: "1214", country: "BD" },
        buyerEmail: "buyer@example.com",
      }),
    });
    expect(summary).toMatchObject({ amount: "1.25", isSucceeded: true, buyerEmail: "buyer@example.com", orderContext: { delivery: "Priority delivery" } });
    expect(summary.lineItems).toHaveLength(1);
    expect(summary.lineItems[0]).toMatchObject({ name: "API Pro", quantity: 2 });
    expect(summary.shipping?.city).toBe("Dhaka");
  });

  it("falls back safely for malformed order context", () => {
    const summary = buildReceiptSummary({ amountAtomic: 1000000, status: "requires_payment", itemName: "Starter", buyerLabel: null, orderContext: "not-json" });
    expect(summary).toMatchObject({ amount: "1.00", isSucceeded: false, buyerEmail: "Wallet buyer" });
    expect(summary.lineItems[0]).toMatchObject({ name: "Starter", quantity: 1, seller: "Merchant" });
  });

  it("reports clipboard success and failure accurately", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyReceiptValue("0xabc", { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("0xabc");
    await expect(copyReceiptValue("0xabc", { writeText: vi.fn().mockRejectedValue(new Error("blocked")) })).resolves.toBe(false);
    await expect(copyReceiptValue("0xabc", undefined)).resolves.toBe(false);
  });
});
