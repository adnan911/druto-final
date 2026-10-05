// One bounded drain. Explicit environment; never implicitly load admin credentials.
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { drainWebhookOutbox } from "../server/webhook-delivery";

async function main() {
  if (!process.env.DATABASE_URL || !/^[a-fA-F0-9]{64}$/.test(process.env.DRUTO_WEBHOOK_ENCRYPTION_KEY ?? "") || !process.env.DRUTO_WEBHOOK_ALLOWED_ORIGINS) {
    throw new Error("Set an explicit app DATABASE_URL, dedicated DRUTO_WEBHOOK_ENCRYPTION_KEY and trusted DRUTO_WEBHOOK_ALLOWED_ORIGINS");
  }
  const url = new URL(process.env.DATABASE_URL);
  if (url.protocol !== "mysql:" || url.pathname !== "/druto_testnet" || !url.hostname.endsWith(".tidbcloud.com") || !decodeURIComponent(url.username).endsWith(".druto_app")) throw new Error("Worker requires the limited druto_testnet app identity");
  const pool = mysql.createPool({ uri: url.toString(), ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }, connectionLimit: 2, connectTimeout: 15000 });
  try {
    const result = await drainWebhookOutbox(drizzle(pool));
    console.log(JSON.stringify({ selected: result.selected, delivered: result.delivered, failedOrSkipped: result.selected - result.delivered }));
  } finally { await pool.end(); }
}
main().catch(() => { console.error("Webhook worker failed. Check database access and worker configuration; no secrets are logged."); process.exitCode = 1; });
