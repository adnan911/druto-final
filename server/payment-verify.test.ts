import { beforeEach, describe, expect, it, vi } from "vitest";

const getDbMock = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getDb: getDbMock }));

const verifyArcUsdcTransferMock = vi.hoisted(() => vi.fn());
vi.mock("./arc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./arc")>();
  return {
    ...actual,
    verifyArcUsdcTransfer: verifyArcUsdcTransferMock,
  };
});

import { appRouter } from "./routers";

import { paymentIntents, paymentTransactions } from "../drizzle/schema";

function createDbMock(intents: any[] = [], transactions: any[] = []) {
  const db = {
    select: vi.fn(() => ({
      from: vi.fn((table: any) => ({
        where: vi.fn((condition: any) => ({
          limit: vi.fn(async () => {
            if (table === paymentIntents) return intents.slice(0, 1);
            if (table === paymentTransactions) return transactions.slice(0, 1);
            return [];
          }),
        })),
      })),
    })),
    insert: vi.fn((table: any) => ({
      values: vi.fn(async (val: any) => {
        if (table === paymentTransactions) {
          transactions.push(val);
        }
      }),
    })),
    update: vi.fn((table: any) => ({
      set: vi.fn((updateVal: any) => ({
        where: vi.fn(async () => {
          if (table === paymentIntents && intents.length) {
            Object.assign(intents[0], updateVal);
          }
          return [{ affectedRows: 1 }];
        }),
      })),
    })),
  };
  return { db, intents, transactions };
}

describe("payments.verifyTransfer router procedure", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies an onchain transfer and marks the Payment Intent succeeded", async () => {
    const intent = {
      id: "pi_123",
      externalOrderId: "DR-123",
      amountAtomic: "1000000",
      merchantAddress: "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217",
      status: "requires_payment",
      orderContext: null,
    };
    const { db, transactions } = createDbMock([intent]);
    getDbMock.mockResolvedValue(db);

    const txHash = "0x" + "a".repeat(64);
    verifyArcUsdcTransferMock.mockResolvedValue({
      fromAddress: "0x2222222222222222222222222222222222222222",
      toAddress: "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217",
      amountAtomic: "1000000",
      transactionHash: txHash,
    });

    const caller = appRouter.createCaller({ user: null, req: {}, res: {} } as never);
    const result = await caller.payments.verifyTransfer({
      paymentIntentId: "pi_123",
      transactionHash: txHash,
    });

    expect(result).toMatchObject({
      paymentIntentId: "pi_123",
      transactionHash: txHash,
      fromAddress: "0x2222222222222222222222222222222222222222",
      status: "succeeded",
    });
    expect(intent.status).toBe("succeeded");
  });

  it("rejects verification if the onchain Arc transfer check fails", async () => {
    const intent = {
      id: "pi_123",
      amountAtomic: "1000000",
      merchantAddress: "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217",
      status: "requires_payment",
    };
    const { db } = createDbMock([intent]);
    getDbMock.mockResolvedValue(db);

    const txHash = "0x" + "b".repeat(64);
    verifyArcUsdcTransferMock.mockRejectedValue(new Error("No matching USDC transfer"));

    const caller = appRouter.createCaller({ user: null, req: {}, res: {} } as never);
    await expect(caller.payments.verifyTransfer({
      paymentIntentId: "pi_123",
      transactionHash: txHash,
    })).rejects.toThrow("No matching USDC transfer");

    expect(intent.status).toBe("requires_payment");
  });
});
