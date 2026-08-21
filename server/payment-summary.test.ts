import { describe, expect, it } from "vitest";
import { summarizeVerifiedRows } from "./payment-summary";

describe("verified payment summary", () => {
  it("aggregates only joined verified payment rows", () => {
    expect(summarizeVerifiedRows([{ amountAtomic: "1000000" }, { amountAtomic: "2500000" }])).toEqual({ totalAtomic: BigInt("3500000"), count: 2 });
  });

  it("returns zero for no verified rows", () => {
    expect(summarizeVerifiedRows([])).toEqual({ totalAtomic: BigInt("0"), count: 0 });
  });
});
