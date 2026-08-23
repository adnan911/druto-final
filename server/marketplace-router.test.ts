import { beforeEach, describe, expect, it, vi } from "vitest";

const getDbMock = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getDb: getDbMock }));

import { appRouter } from "./routers";

function createDbMock(initialRows: any[] = [], queryRows: any[][] = []) {
  const rows: any[] = [];
  let selectCalls = 0;
  const db = {
    select: vi.fn(() => {
      selectCalls += 1;
      const queryIndex = initialRows.length ? selectCalls - 2 : selectCalls - 1;
      const selectedRows = selectCalls === 1 && initialRows.length ? initialRows : queryRows[queryIndex] ?? rows;
      const result = {
        limit: vi.fn(async () => selectedRows.slice(-1)),
        then: (resolve: (value: any[]) => unknown) => Promise.resolve(selectedRows).then(resolve),
      };
      return {
        from: vi.fn(() => ({ where: vi.fn(() => result), innerJoin: vi.fn(() => ({ where: vi.fn(() => result) })) })),
      };
    }),
    insert: vi.fn(() => ({
      values: vi.fn(async (value: any) => { rows.push({ ...value, createdAt: new Date(), updatedAt: new Date() }); }),
    })),
  };
  return { db, rows };
}

describe("marketplace Payment Intent router contract", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("persists and returns buyer context and the normalized return URL", async () => {
    const { db, rows } = createDbMock();
    getDbMock.mockResolvedValue(db);
    const caller = appRouter.createCaller({ user: null, req: {}, res: {} } as never);

    const created = await caller.payments.createIntent({
      externalOrderId: "NS-1842",
      idempotencyKey: "marketplace-ns-1842-test",
      itemName: "Northstar API Pro",
      buyerLabel: "Hackathon buyer",
      returnUrl: "/marketplace",
      amount: "1.00",
      orderContext: { items: [{ productId: "api-pro", name: "Northstar API Pro", seller: "Northstar Labs", unitPrice: 1, quantity: 2 }], delivery: "Digital delivery", shippingAddress: { name: "Alex", line1: "1 Main St", city: "Arc City", postalCode: "10001", country: "United States" }, buyerEmail: "buyer@example.com" },
    });

    expect(rows[0]).toMatchObject({ buyerLabel: "Hackathon buyer", returnUrl: "/marketplace", externalOrderId: "NS-1842", orderContext: expect.stringContaining('"quantity":2') });
    expect(created).toMatchObject({ buyerLabel: "Hackathon buyer", returnUrl: "/marketplace" });

    const intent = await caller.payments.getIntent({ id: created.id });
    expect(intent).toMatchObject({ buyerLabel: "Hackathon buyer", returnUrl: "/marketplace", itemName: "Northstar API Pro", orderContext: expect.stringContaining('"productId":"api-pro"') });
  });

  it("routes a seller-aware intent to the approved merchant wallet", async () => {
    const sellerAccount = { id: "ma_seller_1", marketplaceId: "market_1", externalSellerId: "seller_1", displayName: "Seller One", receivingAddress: "0x1111111111111111111111111111111111111111", status: "active", createdAt: new Date(), updatedAt: new Date() };
    const { db, rows } = createDbMock([sellerAccount]);
    getDbMock.mockResolvedValue(db);
    const caller = appRouter.createCaller({ user: { id: 1, openId: "owner", role: "user" }, req: {}, res: {} } as never);
    const created = await caller.payments.createIntent({ externalOrderId: "SELLER-1", itemName: "Seller item", amount: "2.50", seller: { marketplaceId: "market_1", sellerId: "seller_1" } });
    expect(rows[rows.length - 1]).toMatchObject({ marketplaceId: "market_1", sellerId: "seller_1", merchantAccountId: "ma_seller_1", merchantAddress: sellerAccount.receivingAddress });
    expect(created).toMatchObject({ sellerId: "seller_1", merchantAccountId: "ma_seller_1", merchantAddress: sellerAccount.receivingAddress });
  });

  it("requires admin approval to register a seller account", async () => {
    const { db, rows } = createDbMock();
    getDbMock.mockResolvedValue(db);
    const adminCaller = appRouter.createCaller({ user: { id: 7, openId: "admin-owner", role: "admin" }, req: {}, res: {} } as never);
    await adminCaller.merchantAccounts.register({ marketplaceId: "market_1", sellerId: "seller_new", displayName: "New Seller", receivingAddress: "0x2222222222222222222222222222222222222222" });
    expect(rows[0]).toMatchObject({ ownerUserId: 7, status: "pending", receivingAddress: "0x2222222222222222222222222222222222222222" });
    const userCaller = appRouter.createCaller({ user: { id: 8, openId: "regular-user", role: "user" }, req: {}, res: {} } as never);
    await expect(userCaller.merchantAccounts.register({ marketplaceId: "market_2", sellerId: "seller_other", displayName: "Other Seller", receivingAddress: "0x5555555555555555555555555555555555555555" })).rejects.toThrow();
  });

  it("returns only the seller-scoped pending and succeeded intents", async () => {
    const account = { id: "ma_orders", marketplaceId: "market_1", externalSellerId: "seller_orders", ownerUserId: 7, displayName: "Orders Seller", receivingAddress: "0x6666666666666666666666666666666666666666", status: "active", createdAt: new Date(), updatedAt: new Date() };
    const intents = [{ id: "pi_pending", status: "requires_payment", amountAtomic: "1000000", merchantAccountId: "ma_orders" }, { id: "pi_succeeded", status: "succeeded", amountAtomic: "2000000", merchantAccountId: "ma_orders" }, { id: "pi_other", status: "succeeded", amountAtomic: "9000000", merchantAccountId: "ma_other" }];
    const { db } = createDbMock([account], [intents]);
    getDbMock.mockResolvedValue(db);
    const caller = appRouter.createCaller({ user: { id: 7, openId: "seller-owner", role: "user" }, req: {}, res: {} } as never);
    const result = await caller.payments.sellerIntents({ marketplaceId: "market_1", sellerId: "seller_orders" });
    expect(result).toHaveLength(2);
    expect(result.map(item => item.status)).toEqual(["requires_payment", "succeeded"]);
  });

  it("returns verified seller payments and an empty state safely", async () => {
    const account = { id: "ma_payments", marketplaceId: "market_1", externalSellerId: "seller_payments", ownerUserId: 7, displayName: "Payments Seller", receivingAddress: "0x7777777777777777777777777777777777777777", status: "active", createdAt: new Date(), updatedAt: new Date() };
    const verified = [{ transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", paymentIntentId: "pi_succeeded", amountAtomic: "2000000", merchantAccountId: "ma_payments" }, { transactionHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", paymentIntentId: "pi_other", amountAtomic: "9000000", merchantAccountId: "ma_other" }];
    const { db } = createDbMock([account], [verified]);
    getDbMock.mockResolvedValue(db);
    const caller = appRouter.createCaller({ user: { id: 7, openId: "seller-owner", role: "user" }, req: {}, res: {} } as never);
    const result = await caller.payments.sellerPayments({ marketplaceId: "market_1", sellerId: "seller_payments" });
    expect(result).toMatchObject([{ transactionHash: verified[0].transactionHash, amountAtomic: "2000000" }]);
  });

  it("returns an empty list when a seller has no verified payments", async () => {
    const account = { id: "ma_empty", marketplaceId: "market_1", externalSellerId: "seller_empty", ownerUserId: 7, displayName: "Empty Seller", receivingAddress: "0x8888888888888888888888888888888888888888", status: "active", createdAt: new Date(), updatedAt: new Date() };
    const { db } = createDbMock([account], [[]]);
    getDbMock.mockResolvedValue(db);
    const caller = appRouter.createCaller({ user: { id: 7, openId: "seller-owner", role: "user" }, req: {}, res: {} } as never);
    await expect(caller.payments.sellerPayments({ marketplaceId: "market_1", sellerId: "seller_empty" })).resolves.toEqual([]);
  });

  it("aggregates seller-scoped pending and verified activity", async () => {
    const account = { id: "ma_metrics", marketplaceId: "market_1", externalSellerId: "seller_metrics", ownerUserId: 7, displayName: "Metrics Seller", receivingAddress: "0x4444444444444444444444444444444444444444", status: "active", createdAt: new Date(), updatedAt: new Date() };
    const intents = [{ id: "pi_pending", amountAtomic: "1000000", status: "requires_payment" }, { id: "pi_done", amountAtomic: "2500000", status: "succeeded" }];
    const verified = [{ amountAtomic: "2500000", paymentIntentId: "pi_done", merchantAccountId: "ma_metrics" }];
    const { db } = createDbMock([account], [intents, verified]);
    getDbMock.mockResolvedValue(db);
    const caller = appRouter.createCaller({ user: { id: 7, openId: "seller-owner", role: "user" }, req: {}, res: {} } as never);
    const summary = await caller.payments.sellerSummary({ marketplaceId: "market_1", sellerId: "seller_metrics" });
    expect(summary).toMatchObject({ merchantAccountId: "ma_metrics", grossUsdc: "2.50", availableUsdc: "2.50", pendingUsdc: "1.00", successfulCount: 1, pendingCount: 1, totalCount: 2 });
  });

  it("blocks a different operator from seller-scoped statistics", async () => {
    const account = { id: "ma_private", marketplaceId: "market_1", externalSellerId: "seller_private", ownerUserId: 99, displayName: "Private Seller", receivingAddress: "0x3333333333333333333333333333333333333333", status: "active", createdAt: new Date(), updatedAt: new Date() };
    const { db } = createDbMock([account]);
    getDbMock.mockResolvedValue(db);
    const caller = appRouter.createCaller({ user: { id: 7, openId: "other-user", role: "user" }, req: {}, res: {} } as never);
    await expect(caller.payments.sellerSummary({ marketplaceId: "market_1", sellerId: "seller_private" })).rejects.toThrow("not authorized");
  });

  it("requires authentication for seller-scoped statistics", async () => {
    const { db } = createDbMock();
    getDbMock.mockResolvedValue(db);
    const caller = appRouter.createCaller({ user: null, req: {}, res: {} } as never);
    await expect(caller.payments.sellerSummary({ marketplaceId: "market_1", sellerId: "seller_1" })).rejects.toThrow();
  });

  it("defaults an omitted returnUrl at the router boundary", async () => {
    const { db, rows } = createDbMock();
    getDbMock.mockResolvedValue(db);
    const caller = appRouter.createCaller({ user: null, req: {}, res: {} } as never);
    const created = await caller.payments.createIntent({ externalOrderId: "NS-default", itemName: "Demo item", amount: "1.00" });
    expect(rows[0]?.returnUrl).toBe("/marketplace");
    expect(created.returnUrl).toBe("/marketplace");
  });

  it("rejects an invalid returnUrl at the router boundary", async () => {
    const { db } = createDbMock();
    getDbMock.mockResolvedValue(db);
    const caller = appRouter.createCaller({ user: null, req: {}, res: {} } as never);
    await expect(caller.payments.createIntent({ externalOrderId: "NS-invalid", itemName: "Demo item", amount: "1.00", returnUrl: "javascript:alert(1)" })).rejects.toThrow("Return URL");
  });
});
