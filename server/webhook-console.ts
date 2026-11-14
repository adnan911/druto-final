import { z } from "zod";
export const webhookConsoleInput = z.object({
  endpointId: z.string().min(1).max(32).optional(),
  status: z.enum(["pending", "succeeded", "failed"]).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(50).default(25),
  cursor: z.object({ createdAt: z.number().int().nonnegative(), id: z.string().min(1).max(32) }).optional(),
});
type Delivery = {
  id: string; endpointId: string; eventId: string; eventType: string; paymentIntentId: string;
  status: string; attempts: number; nextAttemptAt: Date | null; deliveredAt: Date | null;
  createdAt: Date; updatedAt: Date; endpointActive: number; url: string;
  sellerName: string; externalOrderId: string | null; payload?: string;
};
export function safeWebhookPayload(raw?: string) {
  try {
    if (!raw || raw.length > 262144) return null;
    const value = JSON.parse(raw);
    const data = value?.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const pick = (source: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys
      .filter(key => typeof source[key] === "string" || typeof source[key] === "number")
      .map(key => [key, source[key]]));
    return { ...pick(value, ["id", "type", "version", "createdAt"]), data: pick(data,
      ["paymentIntentId", "externalOrderId", "marketplaceId", "sellerId", "merchantAccountId",
       "status", "amount", "amountAtomic", "asset", "network", "merchantAddress", "transactionHash"]) };
  } catch { return null; }
}
export function webhookDeliveryView(row: Delivery, detail = false) {
  return {
    id: row.id, endpointId: row.endpointId, eventId: row.eventId, eventType: row.eventType,
    paymentIntentId: row.paymentIntentId, externalOrderId: row.externalOrderId,
    sellerName: row.sellerName, status: row.status, attempts: row.attempts,
    nextAttemptAt: row.nextAttemptAt, deliveredAt: row.deliveredAt,
    createdAt: row.createdAt, updatedAt: row.updatedAt, endpointActive: row.endpointActive === 1,
    retryAvailable: row.endpointActive === 1 && row.status !== "succeeded"
      && (!row.nextAttemptAt || row.nextAttemptAt.getTime() <= Date.now()),
    payload: detail ? safeWebhookPayload(row.payload) : null,
  };
}