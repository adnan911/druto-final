import { describe, expect, it } from "vitest";
import { getDashboardDateRangeStart, isWithinDashboardDateRange } from "./dashboardFilters";

describe("isWithinDashboardDateRange", () => {
  const now = new Date(2026, 9, 22, 12, 30);

  it("matches the current local calendar day", () => {
    expect(isWithinDashboardDateRange(new Date(2026, 9, 22, 0, 1).getTime(), "Today", now)).toBe(true);
    expect(isWithinDashboardDateRange(new Date(2026, 9, 21, 23, 59).getTime(), "Today", now)).toBe(false);
  });

  it("includes exactly the last seven calendar dates through now", () => {
    expect(isWithinDashboardDateRange(new Date(2026, 9, 16, 8).getTime(), "Last 7 days", now)).toBe(true);
    expect(isWithinDashboardDateRange(new Date(2026, 9, 15, 23, 59).getTime(), "Last 7 days", now)).toBe(false);
    expect(isWithinDashboardDateRange(new Date(2026, 9, 22, 13).getTime(), "Last 7 days", now)).toBe(false);
  });

  it("matches the current month and preserves the all-dates option", () => {
    expect(isWithinDashboardDateRange(new Date(2026, 9, 1, 0).getTime(), "This month", now)).toBe(true);
    expect(isWithinDashboardDateRange(new Date(2026, 8, 30, 23, 59).getTime(), "This month", now)).toBe(false);
    expect(isWithinDashboardDateRange(Number.NaN, "All dates", now)).toBe(true);
  });

  it("produces filter start times from the current local calendar", () => {
    expect(getDashboardDateRangeStart("Today", now)).toBe(new Date(2026, 9, 22).getTime());
    expect(getDashboardDateRangeStart("Last 7 days", now)).toBe(new Date(2026, 9, 16).getTime());
    expect(getDashboardDateRangeStart("This month", now)).toBe(new Date(2026, 9, 1).getTime());
    expect(getDashboardDateRangeStart("All dates", now)).toBeUndefined();
  });
});
