import { beforeEach, describe, expect, it, vi } from "vitest";

const getDbMock = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getDb: getDbMock }));

import { appRouter } from "./routers";

function createDbMock(empty = false) {
  const intents = empty ? [] : [{ id: "pi_verified", externalOrderId: "order-1", itemName: "Demo item", amountAtomic: "2500000", merchantAccountId: "ma_wallet_owner", merchantAddress: "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217", status: "succeeded", createdAt: new Date(), expiresAt: new Date() }];
  const verified = empty ? [] : [{ id: "0xhash", paymentIntentId: "pi_verified", externalOrderId: "order-1", itemName: "Demo item", amountAtomic: "2500000", merchantAccountId: "ma_wallet_owner", transactionHash: "0xhash", fromAddress: "0xbuyer", toAddress: "0xmerchant", finalizedAt: new Date(), createdAt: new Date() }];
  let selectCalls = 0;
  return { select: vi.fn((shape?: unknown) => { selectCalls += 1; const selected = selectCalls === 1 ? [{ id: "ma_wallet_owner" }] : shape ? verified : intents; return { from: vi.fn(() => ({ innerJoin: vi.fn(() => ({ where: vi.fn().mockResolvedValue(selected) })), where: vi.fn().mockResolvedValue(selected) })) }; }) };
}

describe("verified payment queries", () => {
  beforeEach(() => getDbMock.mockResolvedValue(createDbMock()));

  it("returns joined verified activity rows", async () => {
    const caller = appRouter.createCaller({ user: { id: 7, openId: "wallet:0xa32c7bbb2fb634bed4dfc812c15af87a0c727217", role: "user" }, req: {}, res: {} } as never);
    const rows = await caller.payments.verifiedPayments();
    expect(rows[0]).toMatchObject({ paymentIntentId: "pi_verified", transactionHash: "0xhash", amountAtomic: "2500000" });
  });

  it("summarizes the joined verified amount and leaves no pending intents", async () => {
    const caller = appRouter.createCaller({ user: { id: 7, openId: "wallet:0xa32c7bbb2fb634bed4dfc812c15af87a0c727217", role: "user" }, req: {}, res: {} } as never);
    const summary = await caller.payments.summary();
    expect(summary).toMatchObject({ availableUsdc: "2.50", grossUsdc: "2.50", successfulCount: 1, pendingCount: 0 });
  });

  it("returns an empty verified activity state when no transfers exist", async () => {
    getDbMock.mockResolvedValue(createDbMock(true));
    const caller = appRouter.createCaller({ user: { id: 7, openId: "wallet:0xa32c7bbb2fb634bed4dfc812c15af87a0c727217", role: "user" }, req: {}, res: {} } as never);
    expect(await caller.payments.verifiedPayments()).toEqual([]);
    expect(await caller.payments.summary()).toMatchObject({ availableUsdc: "0.00", grossUsdc: "0.00", successfulCount: 0 });
  });

  it("returns a bounded payment page and a stable cursor", async () => {
    const finalizedAt = new Date("2026-10-22T04:00:00.000Z");
    const rows = [
      { id: 12, paymentIntentId: "pi_newest", itemName: "Newest item", buyerLabel: "buyer@example.test", amountAtomic: "2500000", transactionHash: "0xnewest", fromAddress: "0xbuyer", toAddress: "0xseller", finalizedAt, createdAt: finalizedAt },
      { id: 11, paymentIntentId: "pi_older", itemName: "Older item", buyerLabel: null, amountAtomic: "1000000", transactionHash: "0xolder", fromAddress: "0xbuyer2", toAddress: "0xseller", finalizedAt: new Date("2026-10-21T04:00:00.000Z"), createdAt: finalizedAt },
    ];
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn((limit: number) => Promise.resolve(rows.slice(0, limit))),
              })),
            })),
          })),
        })),
      })),
    };
    getDbMock.mockResolvedValue(db);
    const caller = appRouter.createCaller({ user: { id: 1, openId: "admin", role: "admin" }, req: {}, res: {} } as never);

    const page = await caller.payments.verifiedPaymentsPage({ limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].paymentIntentId).toBe("pi_newest");
    expect(page.nextCursor).toEqual({ finalizedAt: finalizedAt.getTime(), id: 12 });
  });
});


describe("marketplace handoff contract", () => {
  it("accepts buyer context and a relative return URL", async () => {
    const { paymentInput } = await import("./routers");
    const parsed = paymentInput.parse({ externalOrderId: "DR-1842", idempotencyKey: "marketplace-druto-1842", itemName: "Arc API Pro", buyerLabel: "Hackathon buyer", returnUrl: "/", amount: "1.00" });
    expect(parsed).toMatchObject({ buyerLabel: "Hackathon buyer", returnUrl: "/", amount: "1.00" });
  });

  it("rejects malformed marketplace input", async () => {
    const { paymentInput } = await import("./routers");
    expect(() => paymentInput.parse({ externalOrderId: "", itemName: "Item", returnUrl: "javascript:alert(1)", amount: "1.00" })).toThrow();
  });
});
