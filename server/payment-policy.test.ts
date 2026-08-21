import { describe, expect, it } from "vitest";
import { assertIdempotentMatch, assertTransactionOwnership } from "./payment-policy";

describe("payment safety policies", () => {
  it("accepts an exact idempotent retry", () => {
    expect(() => assertIdempotentMatch(
      { externalOrderId: "order-1", itemName: "Demo item", amountAtomic: "1000000" },
      { externalOrderId: "order-1", itemName: "Demo item", amountAtomic: "1000000" },
    )).not.toThrow();
  });

  it("rejects an idempotency key reused with different details", () => {
    expect(() => assertIdempotentMatch(
      { externalOrderId: "order-1", itemName: "Demo item", amountAtomic: "1000000" },
      { externalOrderId: "order-1", itemName: "Different item", amountAtomic: "1000000" },
    )).toThrow("different payment details");
  });

  it("accepts a transaction retry for the same intent", () => {
    expect(() => assertTransactionOwnership("pi_1", "pi_1")).not.toThrow();
  });

  it("rejects a transaction hash attached to another intent", () => {
    expect(() => assertTransactionOwnership("pi_1", "pi_2")).toThrow("another Payment Intent");
  });
});
