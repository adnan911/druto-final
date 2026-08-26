import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

const getDbMock = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getDb: getDbMock }));

import { appRouter } from "./routers";

const account = privateKeyToAccount("0x0123456789012345678901234567890123456789012345678901234567890123");

describe("wallet login router contract", () => {
  it("issues a challenge, creates a session, and rejects replay", async () => {
    let challenge: any;
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn((value: any) => {
          if (value.id?.startsWith("wl_")) challenge = { ...value, usedAt: null };
          return { onDuplicateKeyUpdate: vi.fn(async () => undefined) };
        }),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(async () => challenge ? [challenge] : []) })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((value: any) => ({
          where: vi.fn(async () => { if (challenge) challenge = { ...challenge, ...value }; return [{ affectedRows: 1 }]; }),
        })),
      })),
    };
    getDbMock.mockResolvedValue(db);
    const res = { cookie: vi.fn(), clearCookie: vi.fn() };
    const caller = appRouter.createCaller({ user: null, req: { protocol: "https", headers: {} }, res } as never);
    const issued = await caller.auth.walletChallenge({ walletAddress: account.address, origin: "https://druto.example" });
    expect(issued.message).toContain("Druto dashboard wallet login");
    const signature = await account.signMessage({ message: issued.message });
    const loggedIn = await caller.auth.walletLogin({ challengeId: issued.challengeId, nonce: issued.nonce, signature });
    expect(loggedIn).toMatchObject({ authenticated: true, walletAddress: account.address });
    expect(res.cookie).toHaveBeenCalled();
    await expect(caller.auth.walletLogin({ challengeId: issued.challengeId, nonce: issued.nonce, signature })).rejects.toThrow("expired or already used");
  });
});
