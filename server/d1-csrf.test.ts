import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createD1App } from "../api/d1-app";

describe("D1 cookie mutation origin guard", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = await new Promise<Server>(resolve => {
      const running = createD1App().listen(0, "127.0.0.1", () => resolve(running));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  it("rejects cookie-backed POSTs without a trusted same-origin source", async () => {
    const post = (headers: Record<string, string>) => fetch(`${baseUrl}/__csrf_probe`, {
      method: "POST", headers: { cookie: "druto_session=test", ...headers },
    });

    expect((await post({})).status).toBe(403);
    expect((await post({ origin: "null" })).status).toBe(403);
    expect((await post({ origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ referer: "https://evil.example/page" })).status).toBe(403);
    expect((await post({ origin: `${baseUrl}/unexpected-path` })).status).toBe(403);
    expect((await post({ origin: baseUrl })).status).toBe(404);
    expect((await post({ referer: `${baseUrl}/dashboard` })).status).toBe(404);
  });

  it("keeps server-to-server requests without cookies available", async () => {
    const response = await fetch(`${baseUrl}/__csrf_probe`, { method: "POST" });
    expect(response.status).toBe(404);
  });
});
