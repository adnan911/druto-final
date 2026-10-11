import { cleanupD1Sessions } from "./d1-sessions";
import { drainD1WebhookOutbox } from "./d1-webhook-drain";

export const D1_SESSION_CLEANUP_CRON = "17 * * * *";
export const D1_WEBHOOK_CRON = "*/2 * * * *";

export async function runD1Scheduled(cron: string) {
  if (cron === D1_SESSION_CLEANUP_CRON) {
    const result = await cleanupD1Sessions();
    // Aggregate-only diagnostics: never log session identifiers or user data.
    console.info("[D1 session cleanup]", result);
    if (result.limitReached) console.warn("[D1 session cleanup] Batch limit reached; further rows may remain");
    return;
  }
  if (cron !== D1_WEBHOOK_CRON) throw new Error("Unknown D1 maintenance schedule");
  const result = await drainD1WebhookOutbox(2);
  console.info("[D1 webhook drain]", result);
  if (result.selected !== result.delivered) throw new Error("One or more webhook deliveries need retry or review");
}
