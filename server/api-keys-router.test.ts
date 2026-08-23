import { describe, expect, it, vi } from "vitest";

const getDbMock = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getDb: getDbMock }));

import { appRouter } from "./routers";

describe("API key router contract", () => {
  it("creates a key, lists only safe metadata, and revokes it for the owner", async () => {
    const stored: any[] = [];
    let revokeAllowed = true;
    const db = {
      insert: vi.fn(() => ({ values: vi.fn(async (value: any) => { stored.push(value); }) })),
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => stored.map(({ secretHash, ...safe }) => safe)) })) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => [{ affectedRows: revokeAllowed ? 1 : 0 }]) })) })),
    };
    getDbMock.mockResolvedValue(db);
    const caller = appRouter.createCaller({ user: { id: 42, openId: "wallet:owner", role: "user" }, req: {}, res: {} } as never);

    const created = await caller.apiKeys.create({ name: "Marketplace backend" });
    expect(created.secret).toMatch(/^druto_test_/);
    expect(stored[0]).toMatchObject({ ownerUserId: 42, name: "Marketplace backend" });
    expect(stored[0].secretHash).not.toBe(created.secret);

    const listed = await caller.apiKeys.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: created.id, name: "Marketplace backend", lastFour: created.lastFour });
    expect((listed[0] as any).secret).toBeUndefined();

    await expect(caller.apiKeys.revoke({ id: created.id })).resolves.toEqual({ success: true });
    revokeAllowed = false;
    await expect(caller.apiKeys.revoke({ id: created.id })).rejects.toThrow("Active API key not found");
  });

  it("rejects anonymous API-key management", async () => {
    getDbMock.mockResolvedValue({});
    const caller = appRouter.createCaller({ user: null, req: {}, res: {} } as never);
    await expect(caller.apiKeys.list()).rejects.toThrow();
    await expect(caller.apiKeys.create({ name: "Unauthorized" })).rejects.toThrow();
  });
});
