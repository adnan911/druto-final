import { createServer } from "node:http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerWebhookDrainRoute, WEBHOOK_DRAIN_PATH } from "./webhook-drain-route";

const token = "ab".repeat(32);
const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

async function route(drain: () => Promise<{ selected: number; delivered: number }>) {
  const app = express();
  registerWebhookDrainRoute(app, drain);
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return `http://127.0.0.1:${address.port}${WEBHOOK_DRAIN_PATH}`;
}

describe("external webhook drain trigger", () => {
  it("is disabled without an explicit 32-byte token", async () => {
    vi.stubEnv("DRUTO_OUTBOX_DRAIN_TOKEN", "");
    const drain = vi.fn().mockResolvedValue({ selected: 0, delivered: 0 });
    const url = await route(drain);
    const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(drain).not.toHaveBeenCalled();
  });

  it("rejects missing, malformed and incorrect credentials before draining", async () => {
    vi.stubEnv("DRUTO_OUTBOX_DRAIN_TOKEN", token);
    const drain = vi.fn().mockResolvedValue({ selected: 0, delivered: 0 });
    const url = await route(drain);
    for (const authorization of [undefined, `Bearer ${"cd".repeat(32)}`, `Basic ${token}`, `Bearer ${token} extra`]) {
      const response = await fetch(url, { method: "POST", headers: authorization ? { authorization } : {} });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ ok: false });
    }
    expect(drain).not.toHaveBeenCalled();
  });

  it("only accepts POST and returns bounded aggregate results to an authorized scheduler", async () => {
    vi.stubEnv("DRUTO_OUTBOX_DRAIN_TOKEN", token);
    const drain = vi.fn().mockResolvedValue({ selected: 2, delivered: 1 });
    const url = await route(drain);
    expect((await fetch(url)).status).toBe(404);
    const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, selected: 2, delivered: 1, failedOrSkipped: 1 });
    expect(drain).toHaveBeenCalledTimes(1);
  });

  it("does not expose internal errors or credentials", async () => {
    vi.stubEnv("DRUTO_OUTBOX_DRAIN_TOKEN", token);
    const url = await route(async () => { throw new Error(`database failed with ${token}`); });
    const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"ok":false}');
  });
});
