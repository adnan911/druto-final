import { beforeEach, describe, expect, it, vi } from "vitest";

const getDbMock = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getDb: getDbMock }));

import { appRouter } from "./routers";

function createDbMock(empty = false) {
  const intents = empty ? [] : [{ id: "pi_verified", externalOrderId: "order-1", itemName: "Demo item", amountAtomic: "2500000", merchantAddress: "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217", status: "succeeded", createdAt: new Date(), expiresAt: new Date() }];
  const verified = empty ? [] : [{ id: "0xhash", paymentIntentId: "pi_verified", externalOrderId: "order-1", itemName: "Demo item", amountAtomic: "2500000", transactionHash: "0xhash", fromAddress: "0xbuyer", toAddress: "0xmerchant", finalizedAt: new Date(), createdAt: new Date() }];
  return { select: vi.fn((shape?: unknown) => ({ from: vi.fn(() => ({ innerJoin: vi.fn(() => ({ where: vi.fn().mockResolvedValue(shape ? verified : verified) })), where: vi.fn().mockResolvedValue(intents) })) })) };
}

describe("verified payment queries", () => {
  beforeEach(() => getDbMock.mockResolvedValue(createDbMock()));

  it("returns joined verified activity rows", async () => {
    const caller = appRouter.createCaller({ user: null, req: {}, res: {} } as never);
    const rows = await caller.payments.verifiedPayments();
    expect(rows[0]).toMatchObject({ paymentIntentId: "pi_verified", transactionHash: "0xhash", amountAtomic: "2500000" });
  });

  it("summarizes the joined verified amount and leaves no pending intents", async () => {
    const caller = appRouter.createCaller({ user: null, req: {}, res: {} } as never);
    const summary = await caller.payments.summary();
    expect(summary).toMatchObject({ availableUsdc: "2.50", grossUsdc: "2.50", successfulCount: 1, pendingCount: 0 });
  });

  it("returns an empty verified activity state when no transfers exist", async () => {
    getDbMock.mockResolvedValue(createDbMock(true));
    const caller = appRouter.createCaller({ user: null, req: {}, res: {} } as never);
    expect(await caller.payments.verifiedPayments()).toEqual([]);
    expect(await caller.payments.summary()).toMatchObject({ availableUsdc: "0.00", grossUsdc: "0.00", successfulCount: 0 });
  });
});


describe("marketplace handoff contract", () => {
  it("accepts buyer context and a relative return URL", async () => {
    const { paymentInput } = await import("./routers");
    const parsed = paymentInput.parse({ externalOrderId: "NS-1842", idempotencyKey: "marketplace-ns-1842", itemName: "Northstar API Pro", buyerLabel: "Hackathon buyer", returnUrl: "/marketplace", amount: "1.00" });
    expect(parsed).toMatchObject({ buyerLabel: "Hackathon buyer", returnUrl: "/marketplace", amount: "1.00" });
  });

  it("rejects malformed marketplace input", async () => {
    const { paymentInput } = await import("./routers");
    expect(() => paymentInput.parse({ externalOrderId: "", itemName: "Item", returnUrl: "javascript:alert(1)", amount: "1.00" })).toThrow();
  });
});
