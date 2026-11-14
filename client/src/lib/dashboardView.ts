import { formatAtomicUsdc } from "@shared/usdc-amount";

export type DashboardPaymentStatus = "Verified" | "Pending" | "Ready" | "Expired" | "Failed" | "Needs review";
export function dashboardPaymentStatus(intent: { status: string; expiresAt?: Date | string | null }, hasTransfer: boolean, now = Date.now()): DashboardPaymentStatus {
  if (hasTransfer) return "Verified";
  if (intent.status === "succeeded") return "Needs review";
  if (intent.status === "failed") return "Failed";
  const expiry = intent.expiresAt ? new Date(intent.expiresAt).getTime() : NaN;
  if (intent.status === "expired" || (intent.status === "requires_payment" && Number.isFinite(expiry) && expiry <= now)) return "Expired";
  return intent.status === "requires_payment" ? "Ready" : "Pending";
}
export function dashboardAmount(atomic: string | bigint): string {
  const [whole, decimals] = formatAtomicUsdc(String(atomic)).split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + decimals.replace(/0+$/, "").padEnd(2, "0");
}
export function dashboardCsvCell(value: unknown): string {
  const text = String(value ?? "");
  const safe = /^[\t\r\n]|^\s*[=+\-@]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}