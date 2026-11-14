import { createServer } from "node:http";
import { httpServerHandler } from "cloudflare:node";
import { createApp } from "../../api/index.src";
import { checkDatabaseReadiness, getDb, withTiDbHttp } from "../../server/db";
import { assertWebhookEncryptionConfigured } from "../../server/webhooks";
import { drainWebhookOutbox } from "../../server/webhook-delivery";
import { assertCloudflareRuntimeConfiguration } from "../../server/public-origin";

type WorkerEnv = {
  ASSETS: Fetcher;
  TIDB_DATABASE_URL?: string;
};

let apiHandler: ReturnType<typeof httpServerHandler> | undefined;

async function getApiHandler() {
  if (!apiHandler) {
    const app = await createApp();
    apiHandler = httpServerHandler(createServer(app));
  }
  return apiHandler;
}

export default {
  async fetch(request, env, context) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/") || path.startsWith("/trpc/") || path.startsWith("/manus-storage/")) {
      const handler = await getApiHandler();
      if (!env.TIDB_DATABASE_URL) {
        if (path === "/api/health") return handler.fetch(request, env, context);
        return new Response(JSON.stringify({ ready: false }), {
          status: 503,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      }
      if (path !== "/api/health" && path !== "/api/ready") {
        try {
          assertCloudflareRuntimeConfiguration();
          assertWebhookEncryptionConfigured();
        } catch {
          return new Response(JSON.stringify({ ready: false }), {
            status: 503,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });
        }
      }
      return withTiDbHttp(env.TIDB_DATABASE_URL, () => handler.fetch(request, env, context));
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env) {
    if (!env.TIDB_DATABASE_URL) throw new Error("Druto TiDB HTTP credential is not configured");
    await withTiDbHttp(env.TIDB_DATABASE_URL, async () => {
      await checkDatabaseReadiness();
      assertWebhookEncryptionConfigured();
      assertCloudflareRuntimeConfiguration();
      if (!process.env.DRUTO_WEBHOOK_ALLOWED_ORIGINS) throw new Error("Webhook origins are not configured");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { selected, delivered } = await drainWebhookOutbox(db, 2);
      console.info("[webhook outbox drain]", { selected, delivered, failedOrSkipped: selected - delivered });
      if (selected !== delivered) throw new Error("One or more webhook deliveries failed or were skipped");
    });
  },
} satisfies ExportedHandler<WorkerEnv>;
