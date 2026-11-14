import { timingSafeEqual } from "node:crypto";
import type { Express } from "express";
import { checkDatabaseReadiness, getDb } from "./db";
import { drainWebhookOutbox } from "./webhook-delivery";
import { assertWebhookEncryptionConfigured } from "./webhooks";

export const WEBHOOK_DRAIN_PATH = "/api/internal/webhook-outbox/drain";
type DrainResult = { selected: number; delivered: number };

function validToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-fA-F0-9]{64}$/.test(value);
}

function authorized(header: string | undefined, configured: string): boolean {
  const match = /^Bearer ([a-fA-F0-9]{64})$/.exec(header ?? "");
  if (!match) return false;
  return timingSafeEqual(Buffer.from(match[1], "hex"), Buffer.from(configured, "hex"));
}

async function drainConfiguredOutbox(): Promise<DrainResult> {
  await checkDatabaseReadiness();
  assertWebhookEncryptionConfigured();
  if (!process.env.DRUTO_WEBHOOK_ALLOWED_ORIGINS) throw new Error("Webhook origins are not configured");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // Two serial deliveries leave headroom under the configured 60-second Vercel limit.
  return drainWebhookOutbox(db, 2);
}

/** A deliberately disabled-by-default endpoint for an external scheduler. */
export function registerWebhookDrainRoute(app: Express, drain: () => Promise<DrainResult> = drainConfiguredOutbox) {
  app.post(WEBHOOK_DRAIN_PATH, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const configured = process.env.DRUTO_OUTBOX_DRAIN_TOKEN;
    if (!validToken(configured)) return res.status(503).json({ ok: false });
    if (!authorized(req.header("authorization"), configured)) return res.status(401).json({ ok: false });
    try {
      const result = await drain();
      const failedOrSkipped = result.selected - result.delivered;
      console.info("[webhook outbox drain]", { selected: result.selected, delivered: result.delivered, failedOrSkipped });
      return res.status(200).json({ ok: true, selected: result.selected, delivered: result.delivered, failedOrSkipped });
    } catch {
      console.error("[webhook outbox drain] failed; inspect database and worker configuration");
      return res.status(503).json({ ok: false });
    }
  });
}
