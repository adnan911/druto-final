import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../api/index.src";
import trpcHandler from "../api/trpc/[...path].src";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      server => new Promise<void>(resolve => {
        if (!server.listening) return resolve();
        server.close(() => resolve());
      }),
    ),
  );
  vi.unstubAllEnvs();
});

function listen(handlerFn: (req: any, res: any) => unknown) {
  const server = createServer((req, res) => {
    void handlerFn(req, res);
  });
  servers.push(server);
  return new Promise<{ server: ReturnType<typeof createServer>; port: number }>(resolve => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Probe server did not bind");
      resolve({ server, port: address.port });
    });
  });
}

describe("Vercel API handlers", () => {
  it("serves a JSON health response through the serverless adapter", async () => {
    const { port } = await listen(handler);
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ ok: true, service: "druto" });
  });

  it("reports not ready when the durable database is not configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { port } = await listen(handler);
    const response = await fetch(`http://127.0.0.1:${port}/api/ready`);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ready: false });
  });

  it("keeps the source serverless drain route disabled without its own token", async () => {
    vi.stubEnv("DRUTO_OUTBOX_DRAIN_TOKEN", "");
    const { port } = await listen(handler);
    const response = await fetch(`http://127.0.0.1:${port}/api/internal/webhook-outbox/drain`, { method: "POST" });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: false });
  });

  it("serves the wallet tRPC catch-all as JSON without requiring a wallet signature", async () => {
    const { port } = await listen(trpcHandler);
    const response = await fetch(`http://127.0.0.1:${port}/api/trpc/auth.me?batch=1&input=%7B%7D`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual([{ result: { data: { json: null } } }]);
  });
});
