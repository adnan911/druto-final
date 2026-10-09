import { createServer } from "node:http";
import { httpServerHandler } from "cloudflare:node";
import { createD1App, assertD1Configuration } from "../../api/d1-app";
import { withD1 } from "../../server/d1-db";
import { checkD1Readiness } from "../../server/d1-db";
import { drainD1WebhookOutbox } from "../../server/d1-webhook-drain";

type WorkerEnv = { ASSETS: Fetcher; DRUTO_D1: Parameters<typeof withD1>[0] };
let handler: ReturnType<typeof httpServerHandler> | undefined;
function getHandler() {
  handler ??= httpServerHandler(createServer(createD1App()));
  return handler;
}

export default {
  async fetch(request, env, context) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/") || path.startsWith("/trpc/")) {
      if (!env.DRUTO_D1) return new Response(JSON.stringify({ ready: false }), { status: 503,
        headers: { "content-type": "application/json", "cache-control": "no-store" } });
      if (path !== "/api/health" && path !== "/api/ready") {
        try { assertD1Configuration(); }
        catch { return new Response(JSON.stringify({ ready: false }), { status: 503,
          headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
      }
      return withD1(env.DRUTO_D1, () => getHandler().fetch(request, env, context));
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event, env) {
    if (!env.DRUTO_D1) throw new Error("D1 binding unavailable");
    await withD1(env.DRUTO_D1, async () => {
      assertD1Configuration();
      await checkD1Readiness();
      const result = await drainD1WebhookOutbox(2);
      console.info("[D1 webhook drain]", result);
      if (result.selected !== result.delivered) throw new Error("One or more webhook deliveries need retry or review");
    });
  },
} satisfies ExportedHandler<WorkerEnv>;
