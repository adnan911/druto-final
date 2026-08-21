import { describe, expect, it } from "vitest";
import { buildMarketplaceCheckoutPayload, buildMarketplaceOrderContext, calculateMarketplaceTotals, parseMarketplaceOrderContext, updateMarketplaceQuantity } from "./marketplace";

const products = [{ id: "api", price: 1 }, { id: "kit", price: 2.5 }];

describe("marketplace cart helpers", () => {
  it("calculates subtotal, shipping, and total", () => {
    expect(calculateMarketplaceTotals([{ productId: "api", quantity: 2 }, { productId: "kit", quantity: 1 }], products, "Digital delivery")).toMatchObject({ subtotal: 4.5, shipping: 0, total: 4.5 });
    expect(calculateMarketplaceTotals([{ productId: "api", quantity: 1 }], products, "Priority delivery")).toMatchObject({ subtotal: 1, shipping: 0.25, total: 1.25 });
  });

  it("builds structured checkout order context", () => {
    expect(buildMarketplaceOrderContext([{ productId: "api", quantity: 2 }], [{ id: "api", name: "API Pro", seller: "Northstar Labs", price: 1 }], "Priority delivery", { name: "Alex", line1: "1 Main St", city: "Arc City", postalCode: "10001", country: "United States" }, "buyer@example.com")).toEqual({ items: [{ productId: "api", name: "API Pro", seller: "Northstar Labs", unitPrice: 1, quantity: 2 }], delivery: "Priority delivery", shippingAddress: { name: "Alex", line1: "1 Main St", city: "Arc City", postalCode: "10001", country: "United States" }, buyerEmail: "buyer@example.com" });
  });

  it("parses receipt order context and safely rejects malformed context", () => {
    const serialized = JSON.stringify({ items: [{ productId: "api", name: "API Pro", seller: "Northstar Labs", unitPrice: 1, quantity: 2 }], delivery: "Priority delivery", shippingAddress: { name: "Alex", line1: "1 Main St", city: "Arc City", postalCode: "10001", country: "United States" }, buyerEmail: "buyer@example.com" });
    expect(parseMarketplaceOrderContext(serialized)?.items?.[0]).toMatchObject({ name: "API Pro", quantity: 2 });
    expect(parseMarketplaceOrderContext(serialized)?.shippingAddress).toMatchObject({ line1: "1 Main St", postalCode: "10001" });
    expect(parseMarketplaceOrderContext("not-json")).toBeNull();
  });

  it("builds the exact Druto checkout handoff payload", () => {
    const context = { items: [{ productId: "api", name: "API Pro", seller: "Northstar Labs", unitPrice: 1, quantity: 2 }], delivery: "Digital delivery", shippingAddress: { name: "Alex", line1: "1 Main St", city: "Arc City", postalCode: "10001", country: "United States" }, buyerEmail: "buyer@example.com" };
    expect(buildMarketplaceCheckoutPayload("NS-123", "API Pro × 2", 2, context)).toEqual({ externalOrderId: "NS-123", idempotencyKey: "marketplace-NS-123", itemName: "API Pro × 2", buyerLabel: "buyer@example.com", returnUrl: "/marketplace", amount: "2.00", orderContext: context });
  });

  it("updates quantities and removes lines below one", () => {
    const lines = [{ productId: "api", quantity: 1 }, { productId: "kit", quantity: 1 }];
    expect(updateMarketplaceQuantity(lines, "api", 3)).toEqual([{ productId: "api", quantity: 3 }, { productId: "kit", quantity: 1 }]);
    expect(updateMarketplaceQuantity(lines, "api", 0)).toEqual([{ productId: "kit", quantity: 1 }]);
  });
});
