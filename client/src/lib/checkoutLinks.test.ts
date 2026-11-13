import { describe, expect, it } from "vitest";
import { safeMarketplaceReturnUrl } from "./checkoutLinks";

describe("safeMarketplaceReturnUrl", () => {
  it("allows marketplace paths and absolute HTTP(S) URLs", () => {
    expect(safeMarketplaceReturnUrl("/orders/123?status=unpaid")).toBe("/orders/123?status=unpaid");
    expect(safeMarketplaceReturnUrl("https://shop.example/orders/123")).toBe("https://shop.example/orders/123");
    expect(safeMarketplaceReturnUrl("http://localhost:3000/orders/123")).toBe("http://localhost:3000/orders/123");
  });

  it("rejects protocol-relative, invalid, and non-HTTP(S) destinations", () => {
    expect(safeMarketplaceReturnUrl("//phishing.example/path")).toBeNull();
    expect(safeMarketplaceReturnUrl("javascript:alert(1)")).toBeNull();
    expect(safeMarketplaceReturnUrl("mailto:help@example.com")).toBeNull();
    expect(safeMarketplaceReturnUrl(undefined)).toBeNull();
  });
});
