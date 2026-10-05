import { afterEach, describe, expect, it, vi } from "vitest";

const connections: Array<{ end: ReturnType<typeof vi.fn>; user: string }> = [];
vi.mock("mysql2/promise", () => ({
  default: {
    createConnection: vi.fn(async ({ user }: { user: string }) => {
      const connection = { user, end: vi.fn(async () => {}), query: vi.fn() };
      connections.push(connection);
      return connection;
    }),
    createPool: vi.fn(),
  },
}));

import { getDb, withHyperdrive } from "./db";

const credentials = (user: string) => ({
  host: "hyperdrive.local", user, password: "fixture-password", database: "druto_testnet", port: 3306,
});

afterEach(() => { connections.length = 0; });

describe("Cloudflare request-scoped database", () => {
  it("rejects a nonrestricted identity before any connection", async () => {
    await expect(withHyperdrive(credentials("root"), async () => {})).rejects.toThrow("restricted");
    expect(connections).toHaveLength(0);
  });

  it("reuses only within one invocation and closes every connection", async () => {
    await Promise.all([
      withHyperdrive(credentials("seller_a.druto_app"), async () => { await getDb(); await getDb(); }),
      withHyperdrive(credentials("seller_b.druto_app"), async () => { await getDb(); }),
    ]);
    expect(connections.map(connection => connection.user).sort()).toEqual(["seller_a.druto_app", "seller_b.druto_app"]);
    expect(connections.every(connection => connection.end.mock.calls.length === 1)).toBe(true);
  });
});
