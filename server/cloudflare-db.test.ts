import { afterEach, describe, expect, it, vi } from "vitest";

const clients: Array<{ url: string; execute: ReturnType<typeof vi.fn> }> = [];
vi.mock("@tidbcloud/serverless", () => ({
  connect: vi.fn(({ url }: { url: string }) => {
    const client = { url, execute: vi.fn(async () => []) };
    clients.push(client);
    return client;
  }),
}));

import { getDb, withTiDbHttp } from "./db";

const url = (user: string) =>
  `mysql://${user}:fixture-password@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/druto_testnet`;

afterEach(() => { clients.length = 0; });

describe("Cloudflare request-scoped TiDB HTTP database", () => {
  it("rejects a nonrestricted identity before connecting", async () => {
    await expect(withTiDbHttp(url("root"), async () => {})).rejects.toThrow("restricted");
    expect(clients).toHaveLength(0);
  });

  it("reuses a client within one invocation and isolates parallel requests", async () => {
    await Promise.all([
      withTiDbHttp(url("seller_a.druto_app"), async () => { await getDb(); await getDb(); }),
      withTiDbHttp(url("seller_b.druto_app"), async () => { await getDb(); }),
    ]);
    expect(clients.map(client => new URL(client.url).username).sort()).toEqual([
      "seller_a.druto_app", "seller_b.druto_app",
    ]);
  });
});
