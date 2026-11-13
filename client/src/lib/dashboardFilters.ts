export type DashboardDateRange = "All dates" | "Today" | "Last 7 days" | "This month";

export function getDashboardDateRangeStart(range: DashboardDateRange, now = new Date()): number | undefined {
  if (range === "All dates") return undefined;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === "Last 7 days") start.setDate(start.getDate() - 6);
  if (range === "This month") start.setDate(1);
  return start.getTime();
}

export function isWithinDashboardDateRange(
  timestamp: number,
  range: DashboardDateRange,
  now = new Date(),
): boolean {
  if (range === "All dates") return true;
  if (!Number.isFinite(timestamp)) return false;

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (range === "Today") {
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return timestamp >= start.getTime() && timestamp < end.getTime();
  }

  if (range === "Last 7 days") {
    start.setDate(start.getDate() - 6);
    return timestamp >= start.getTime() && timestamp <= now.getTime();
  }

  start.setDate(1);
  return timestamp >= start.getTime() && timestamp <= now.getTime();
}
