import { beforeEach, describe, expect, it, vi } from "vitest";

const getDbMock = vi.hoisted(() => vi.fn());
const verifyArcMock = vi.hoisted(() => vi.fn());
const dispatchMock = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getDb: getDbMock }));
vi.mock("./arc", async () => {
  const actual = await vi.importActual<typeof import("./arc")>("./arc");
  return { ...actual, verifyArcUsdcTransfer: verifyArcMock };
});
vi.mock("./webhook-delivery", () => ({ dispatchPaymentVerified: dispatchMock, retryWebhookDelivery: vi.fn() }));

import { appRouter } from "./routers";

describe("verifyTransfer webhook emission", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("dispatches payment.verified after successful Arc verification", async () => {
    const intent = { id: "pi_verify", externalOrderId: "order_verify", itemName: "Arc item", amountAtomic: "1000000", merchantAddress: "0x2222222222222222222222222222222222222222", buyerAddress: "0x1111111111111111111111111111111111111111", status: "submitted", expiresAt: new Date(Date.now() + 60_000), idempotencyKey: "verify-key", merchantAccountId: "ma_1", marketplaceId: "market", sellerId: "seller" };
    const updated = { ...intent, status: "succeeded", transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
    let selectCalls = 0; let inserted: unknown;
    const db = {
      select: vi.fn(() => {
        selectCalls += 1;
        const rows = selectCalls === 1 ? [intent] : selectCalls === 2 ? [] : [updated];
        const result = { limit: vi.fn(async () => rows), then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) };
        return { from: vi.fn(() => ({ where: vi.fn(() => result) })) };
      }),
      insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserted = value; }) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
    };
    getDbMock.mockResolvedValue(db);
    verifyArcMock.mockResolvedValue({ transactionHash: updated.transactionHash, fromAddress: intent.buyerAddress, toAddress: intent.merchantAddress, amountAtomic: intent.amountAtomic });
    const caller = appRouter.createCaller({ user: null, req: {}, res: {} } as never);
    await caller.payments.verifyTransfer({ id: intent.id, transactionHash: updated.transactionHash, idempotencyKey: intent.idempotencyKey });
    expect(inserted).toMatchObject({ paymentIntentId: intent.id, transactionHash: updated.transactionHash });
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenCalledWith(db, intent, expect.objectContaining({ paymentIntentId: intent.id, transactionHash: updated.transactionHash }));
  });
});
