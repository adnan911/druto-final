import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import handler from "../api/index";

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
});

describe("Vercel API handler", () => {
  it("serves a JSON health response through the serverless adapter", async () => {
    const server = createServer((req, res) => {
      void handler(req as never, res as never);
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Probe server did not bind");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ ok: true, service: "druto" });
  });
});
