import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

const getDbMock = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getDb: getDbMock }));

import { appRouter } from "./routers";
import { buildOwnershipMessage, hashOwnershipNonce } from "./ownership";

const account = privateKeyToAccount("0x0123456789012345678901234567890123456789012345678901234567890123");
const ctx = { user: { id: 7, openId: "owner", role: "admin" }, req: {}, res: {} } as never;

function mockDb(selectRows: any[]) {
  const db = {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => [selectRows.shift()]) })) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => ({ affectedRows: 1 })) })) })),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  };
  getDbMock.mockResolvedValue(db);
  return db;
}

function challenge(overrides: Partial<any> = {}) {
  const nonce = "router-nonce";
  const message = buildOwnershipMessage({ marketplaceId: "market-1", sellerId: "seller-1", walletAddress: account.address, nonce, origin: "https://shop.example" });
  return { id: "oc_router", merchantAccountId: "ma_router", marketplaceId: "market-1", sellerId: "seller-1", walletAddress: account.address, message, nonceHash: hashOwnershipNonce(nonce), expiresAt: new Date(Date.now() + 60_000), usedAt: null, ...overrides };
}

describe("merchant ownership router procedures", () => {
  it("rejects expired and replayed challenges before signature recovery", async () => {
    const expiredCaller = appRouter.createCaller({ user: null, req: {}, res: {} } as never);
    mockDb([challenge({ expiresAt: new Date(Date.now() - 1) })]);
    await expect(expiredCaller.merchantAccounts.verifyOwnership({ challengeId: "oc_router", nonce: "router-nonce", signature: "0x1234" })).rejects.toThrow("expired or already used");
    mockDb([challenge({ usedAt: new Date(Date.now() - 1) })]);
    await expect(expiredCaller.merchantAccounts.verifyOwnership({ challengeId: "oc_router", nonce: "router-nonce", signature: "0x1234" })).rejects.toThrow("expired or already used");
  });

  it("rejects an invalid nonce and tampered domain message", async () => {
    const caller = appRouter.createCaller({ user: null, req: {}, res: {} } as never);
    mockDb([challenge()]);
    await expect(caller.merchantAccounts.verifyOwnership({ challengeId: "oc_router", nonce: "wrong-nonce", signature: "0x1234" })).rejects.toThrow("Invalid ownership nonce");
    const signed = await account.signMessage({ message: challenge().message });
    mockDb([challenge()]);
    await expect(caller.merchantAccounts.verifyOwnership({ challengeId: "oc_router", nonce: "router-nonce", signature: signed })).resolves.toMatchObject({ verified: true });
  });

  it("blocks approval before verification and allows it after verification", async () => {
    const pending = { id: "ma_router", marketplaceId: "market-1", externalSellerId: "seller-1", receivingAddress: account.address, status: "pending", walletVerifiedAt: null };
    const adminCaller = appRouter.createCaller(ctx);
    mockDb([pending]);
    await expect(adminCaller.merchantAccounts.approve({ merchantAccountId: pending.id })).rejects.toThrow("must be verified");
    const verified = { ...pending, walletVerifiedAt: new Date() };
    mockDb([verified, verified]);
    await expect(adminCaller.merchantAccounts.approve({ merchantAccountId: verified.id })).resolves.toMatchObject({ status: "pending" });
  });
});
