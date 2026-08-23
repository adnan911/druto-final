import { describe, expect, it, vi } from "vitest";

const getDbMock = vi.hoisted(() => vi.fn());
const verifyPrivyTokenMock = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getDb: getDbMock }));
vi.mock("./privy-auth", () => ({
  privyOpenId: (userId: string) => `privy:${userId}`,
  verifyPrivyToken: verifyPrivyTokenMock,
}));

import { appRouter } from "./routers";

describe("Privy login router contract", () => {
  it("upserts the verified Privy identity and creates a Druto cookie session", async () => {
    const inserted: any[] = [];
    const db = {
      insert: vi.fn(() => ({ values: vi.fn((value: any) => ({ onDuplicateKeyUpdate: vi.fn(async () => { inserted.push(value); }) })) })),
    };
    getDbMock.mockResolvedValue(db);
    verifyPrivyTokenMock.mockResolvedValue({ user_id: "did:privy:abc123" });
    const res = { cookie: vi.fn() };
    const caller = appRouter.createCaller({ user: null, req: { protocol: "https", headers: {} }, res } as never);

    const result = await caller.auth.privyLogin({ accessToken: "privy-access-token-that-is-long-enough" });

    expect(result).toMatchObject({ authenticated: true, openId: "privy:did:privy:abc123" });
    expect(inserted[0]).toMatchObject({ openId: "privy:did:privy:abc123", loginMethod: "privy" });
    expect(res.cookie).toHaveBeenCalled();
  });

  it("rejects invalid Privy tokens before touching the database", async () => {
    const db = { insert: vi.fn() };
    getDbMock.mockResolvedValue(db);
    verifyPrivyTokenMock.mockRejectedValue(new Error("invalid"));
    const caller = appRouter.createCaller({ user: null, req: { protocol: "https", headers: {} }, res: { cookie: vi.fn() } } as never);

    await expect(caller.auth.privyLogin({ accessToken: "privy-access-token-that-is-long-enough" })).rejects.toThrow("Privy authentication could not be verified");
    expect(db.insert).not.toHaveBeenCalled();
  });
});
