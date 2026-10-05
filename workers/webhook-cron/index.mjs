// Scheduler only: Druto retains database and webhook encryption credentials.
const DRAIN_PATH = "/api/internal/webhook-outbox/drain";

export default {
  fetch() {
    return new Response("Not found", { status: 404 });
  },

  async scheduled(_controller, env) {
    if (!/^[a-fA-F0-9]{64}$/.test(env.DRUTO_OUTBOX_DRAIN_TOKEN ?? "")) {
      throw new Error("Druto drain token is not configured");
    }
    const url = new URL(env.DRUTO_DRAIN_URL);
    if (url.protocol !== "https:" || url.pathname !== DRAIN_PATH || url.search || url.hash || url.username || url.password) {
      throw new Error("Druto drain URL must be the exact HTTPS endpoint");
    }
    const headers = { authorization: `Bearer ${env.DRUTO_OUTBOX_DRAIN_TOKEN}` };
    if (env.VERCEL_AUTOMATION_BYPASS_SECRET) {
      headers["x-vercel-protection-bypass"] = env.VERCEL_AUTOMATION_BYPASS_SECRET;
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw new Error(`Druto drain returned HTTP ${response.status}`);
    const result = await response.json();
    if (result.ok !== true || !Number.isInteger(result.selected) || !Number.isInteger(result.delivered) || !Number.isInteger(result.failedOrSkipped)) {
      throw new Error("Druto drain returned an invalid response");
    }
    console.log("Druto webhook outbox drain", { selected: result.selected, delivered: result.delivered, failedOrSkipped: result.failedOrSkipped });
    if (result.failedOrSkipped > 0) throw new Error("One or more webhook deliveries failed or were skipped");
  },
};
