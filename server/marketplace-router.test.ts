import { beforeEach, describe, expect, it, vi } from "vitest";

const getDbMock = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getDb: getDbMock }));

import { appRouter } from "./routers";

function createDbMock() {
  const rows: any[] = [];
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => rows.slice(-1)),
          then: (resolve: (value: any[]) => unknown) => Promise.resolve(rows).then(resolve),
        })),
      })),
    })),
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
    });

    expect(rows[0]).toMatchObject({ buyerLabel: "Hackathon buyer", returnUrl: "/marketplace", externalOrderId: "NS-1842" });
    expect(created).toMatchObject({ buyerLabel: "Hackathon buyer", returnUrl: "/marketplace" });

    const intent = await caller.payments.getIntent({ id: created.id });
    expect(intent).toMatchObject({ buyerLabel: "Hackathon buyer", returnUrl: "/marketplace", itemName: "Northstar API Pro" });
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
