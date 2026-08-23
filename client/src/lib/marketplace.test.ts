import { describe, expect, it, vi } from "vitest";
import { appendMarketplacePayment, buildMarketplaceCheckoutPayload, buildMarketplaceOrderContext, calculateMarketplaceTotals, getNextMarketplaceCheckout, MarketplacePaymentQueueError, parseMarketplaceOrderContext, prepareMarketplaceSellerPayments, splitMarketplaceCartBySeller, updateMarketplaceQuantity } from "./marketplace";

const products = [{ id: "api", price: 1 }, { id: "kit", price: 2.5 }];

describe("marketplace cart helpers", () => {
  it("calculates subtotal, shipping, and total", () => {
    expect(calculateMarketplaceTotals([{ productId: "api", quantity: 2 }, { productId: "kit", quantity: 1 }], products, "Digital delivery")).toMatchObject({ subtotal: 4.5, shipping: 0, total: 4.5 });
    expect(calculateMarketplaceTotals([{ productId: "api", quantity: 1 }], products, "Priority delivery")).toMatchObject({ subtotal: 1, shipping: 0.25, total: 1.25 });
  });

  it("builds structured checkout order context", () => {
    expect(buildMarketplaceOrderContext([{ productId: "api", quantity: 2 }], [{ id: "api", name: "API Pro", seller: "Druto Labs", price: 1 }], "Priority delivery", { name: "Alex", line1: "1 Main St", city: "Arc City", postalCode: "10001", country: "United States" }, "buyer@example.com")).toEqual({ items: [{ productId: "api", name: "API Pro", seller: "Druto Labs", unitPrice: 1, quantity: 2 }], delivery: "Priority delivery", shippingAddress: { name: "Alex", line1: "1 Main St", city: "Arc City", postalCode: "10001", country: "United States" }, buyerEmail: "buyer@example.com" });
  });

  it("splits a mixed cart into seller-specific groups and preserves the total", () => {
    const catalog = [
      { id: "api", name: "API Pro", seller: "Druto Labs", sellerId: "druto", price: 1 },
      { id: "kit", name: "Ledger Kit", seller: "Mosaic Works", sellerId: "mosaic", price: 2.5 },
      { id: "starter", name: "Arc Starter", seller: "Druto Labs", sellerId: "druto", price: 0.75 },
    ];
    const groups = splitMarketplaceCartBySeller([{ productId: "api", quantity: 2 }, { productId: "kit", quantity: 1 }, { productId: "starter", quantity: 1 }], catalog, "Priority delivery", { name: "Alex", line1: "1 Main St", city: "Arc City", postalCode: "10001", country: "United States" }, "buyer@example.com");
    expect(groups).toHaveLength(2);
    expect(groups.map(group => group.sellerId)).toEqual(["druto", "mosaic"]);
    expect(groups[0]).toMatchObject({ subtotal: 2.75, shipping: 0.13, total: 2.88 });
    expect(groups[1]).toMatchObject({ subtotal: 2.5, shipping: 0.12, total: 2.62 });
    expect(groups.reduce((sum, group) => sum + group.total, 0)).toBe(5.5);
    expect(groups[0].context.items).toHaveLength(2);
    expect(groups[1].context.items[0]).toMatchObject({ seller: "Mosaic Works", quantity: 1 });
  });

  it("persists seller one when seller two intent creation fails", async () => {
    const catalog = [
      { id: "api", name: "API Pro", seller: "Druto Labs", sellerId: "druto-labs", price: 1 },
      { id: "kit", name: "Ledger Kit", seller: "Mosaic Works", sellerId: "mosaic-works", price: 2.5 },
    ];
    const groups = splitMarketplaceCartBySeller([{ productId: "api", quantity: 1 }, { productId: "kit", quantity: 1 }], catalog, "Digital delivery", { name: "Alex", line1: "1 Main St", city: "Arc City", postalCode: "10001", country: "United States" }, "buyer@example.com");
    const createIntent = vi.fn().mockResolvedValueOnce({ id: "pi-a", checkoutUrl: "/checkout/pi-a" }).mockRejectedValueOnce(new Error("Mosaic is temporarily unavailable"));
    const persisted: unknown[] = [];
    const operation = prepareMarketplaceSellerPayments("DR-FAILURE", groups, "druto-demo-marketplace", createIntent, queue => persisted.push(queue));
    await expect(operation).rejects.toBeInstanceOf(MarketplacePaymentQueueError);
    const error = await operation.catch(value => value as MarketplacePaymentQueueError);
    expect(createIntent).toHaveBeenCalledTimes(2);
    expect(persisted).toHaveLength(2);
    expect(persisted[1]).toMatchObject({ intentIds: ["pi-a"], checkoutUrls: ["/checkout/pi-a"], sellerNames: ["Druto Labs"] });
    expect(error.queue).toMatchObject({ intentIds: ["pi-a"], checkoutUrls: ["/checkout/pi-a"] });
    expect(error.message).toContain("Mosaic is temporarily unavailable");
  });

  it("preserves a partial seller-payment queue for recovery after a later creation failure", () => {
    const initial = { orderId: "DR-1", intentIds: [], checkoutUrls: [], sellerNames: [] };
    const partial = appendMarketplacePayment(initial, { id: "pi-a", checkoutUrl: "/checkout/pi-a", sellerName: "Druto Labs" });
    expect(partial).toEqual({ orderId: "DR-1", intentIds: ["pi-a"], checkoutUrls: ["/checkout/pi-a"], sellerNames: ["Druto Labs"] });
    expect(getNextMarketplaceCheckout(partial, "pi-a")).toBeNull();
  });

  it("returns the next seller checkout and stops after the final payment", () => {
    const queue = { orderId: "DR-1", intentIds: ["pi-a", "pi-b"], checkoutUrls: ["/checkout/pi-a", "/checkout/pi-b"], sellerNames: ["Druto Labs", "Mosaic Works"] };
    expect(getNextMarketplaceCheckout(queue, "pi-a")).toMatchObject({ index: 1, sellerName: "Mosaic Works", checkoutUrl: "/checkout/pi-b" });
    expect(getNextMarketplaceCheckout(queue, "pi-b")).toBeNull();
    expect(getNextMarketplaceCheckout(queue, "pi-missing")).toBeNull();
  });

  it("parses receipt order context and safely rejects malformed context", () => {
    const serialized = JSON.stringify({ items: [{ productId: "api", name: "API Pro", seller: "Druto Labs", unitPrice: 1, quantity: 2 }], delivery: "Priority delivery", shippingAddress: { name: "Alex", line1: "1 Main St", city: "Arc City", postalCode: "10001", country: "United States" }, buyerEmail: "buyer@example.com" });
    expect(parseMarketplaceOrderContext(serialized)?.items?.[0]).toMatchObject({ name: "API Pro", quantity: 2 });
    expect(parseMarketplaceOrderContext(serialized)?.shippingAddress).toMatchObject({ line1: "1 Main St", postalCode: "10001" });
    expect(parseMarketplaceOrderContext("not-json")).toBeNull();
  });

  it("builds the exact Druto checkout handoff payload", () => {
    const context = { items: [{ productId: "api", name: "API Pro", seller: "Druto Labs", unitPrice: 1, quantity: 2 }], delivery: "Digital delivery", shippingAddress: { name: "Alex", line1: "1 Main St", city: "Arc City", postalCode: "10001", country: "United States" }, buyerEmail: "buyer@example.com" };
    expect(buildMarketplaceCheckoutPayload("DR-123", "API Pro × 2", 2, context)).toEqual({ externalOrderId: "DR-123", idempotencyKey: "marketplace-DR-123", itemName: "API Pro × 2", buyerLabel: "buyer@example.com", returnUrl: "/marketplace", amount: "2.00", orderContext: context });
  });

  it("updates quantities and removes lines below one", () => {
    const lines = [{ productId: "api", quantity: 1 }, { productId: "kit", quantity: 1 }];
    expect(updateMarketplaceQuantity(lines, "api", 3)).toEqual([{ productId: "api", quantity: 3 }, { productId: "kit", quantity: 1 }]);
    expect(updateMarketplaceQuantity(lines, "api", 0)).toEqual([{ productId: "kit", quantity: 1 }]);
  });
});
