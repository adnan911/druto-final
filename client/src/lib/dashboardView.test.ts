import { describe, expect, it } from "vitest";
import { dashboardAmount, dashboardCsvCell, dashboardPaymentStatus } from "./dashboardView";

describe("dashboard payment presentation invariants", () => {
  it("never labels success without transfer evidence as verified, and does not expire submitted transfers", () => {
    expect(dashboardPaymentStatus({ status: "succeeded" }, false)).toBe("Needs review");
    expect(dashboardPaymentStatus({ status: "requires_payment", expiresAt: new Date(100) }, false, 101)).toBe("Expired");
    expect(dashboardPaymentStatus({ status: "verifying", expiresAt: new Date(100) }, false, 101)).toBe("Pending");
    expect(dashboardPaymentStatus({ status: "expired" }, true)).toBe("Verified");
  });
  it("formats ERC-20 amounts without Number precision loss", () => {
    expect(dashboardAmount("9007199254740993")).toBe("9,007,199,254.740993");
    expect(dashboardAmount("1")).toBe("0.000001");
    expect(dashboardAmount("915000000")).toBe("915.00");
  });
  it("escapes CSV cells and neutralizes spreadsheet formulas", () => {
    expect(dashboardCsvCell('=SUM(1,2)')).toBe('"\'=SUM(1,2)"');
    expect(dashboardCsvCell('  @cmd')).toBe('"\'  @cmd"');
    expect(dashboardCsvCell('A "quoted" store')).toBe('"A ""quoted"" store"');
    expect(dashboardCsvCell('\n=1')).toBe('"\'\n=1"');
  });
});