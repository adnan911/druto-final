import { describe, expect, it, vi } from "vitest";
import { dispatchPaymentVerified } from "./webhook-delivery";
import { encryptWebhookSecret } from "./webhooks";

describe("webhook delivery dispatch", () => {
  it("delivers payment.verified once per endpoint/event", async () => {
    const endpoint = { id: "wh_1", merchantAccountId: "ma_1", url: "https://market.example/hooks", active: 1, secretCiphertext: encryptWebhookSecret("secret") };
    let selectCalls = 0; let insertCalls = 0; const updates: unknown[] = [];
    const db = {
      select: vi.fn(() => {
        selectCalls += 1;
        const rows = selectCalls === 3 ? [{ id: "wd_existing", status: "succeeded" }] : [endpoint];
        const result = { limit: vi.fn(async () => rows), then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) };
        return { from: vi.fn(() => ({ where: vi.fn(() => result) })) };
      }),
      insert: vi.fn(() => ({ values: vi.fn(async () => { insertCalls += 1; if (insertCalls > 1) throw new Error("duplicate"); }) })),
      update: vi.fn(() => ({ set: vi.fn((value: unknown) => { updates.push(value); return { where: vi.fn(async () => undefined) }; }) })),
    };
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const intent = { id: "pi_1", externalOrderId: "order_1", merchantAccountId: "ma_1", marketplaceId: "market", sellerId: "seller", merchantAddress: "0x2222222222222222222222222222222222222222", buyerAddress: null, orderContext: null };
    const transaction = { transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", amountAtomic: "1000000" };
    await expect(dispatchPaymentVerified(db, intent as never, transaction as never)).resolves.toHaveLength(1);
    await expect(dispatchPaymentVerified(db, intent as never, transaction as never)).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(insertCalls).toBe(2);
    expect(updates).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("does not retry before nextAttemptAt", async () => {
    const db = { select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => [{ id: "wd_1", status: "failed", nextAttemptAt: new Date(10_000), attempts: 1 }]) })) })) })) };
    await expect((await import("./webhook-delivery")).retryWebhookDelivery(db, "wd_1", new Date(5_000))).resolves.toMatchObject({ ok: false, status: 425 });
  });

  it("records failed replay metadata when the receiver rejects a due delivery", async () => {
    const endpoint = { id: "wh_fail", url: "https://market.example/hooks", active: 1, secretCiphertext: encryptWebhookSecret("secret") };
    const delivery = { id: "wd_fail", endpointId: "wh_fail", eventId: "evt_fail", payload: "{}", status: "failed", attempts: 2, nextAttemptAt: new Date(1_000) };
    let selectCalls = 0; const updates: any[] = [];
    const db = { select: vi.fn(() => { selectCalls += 1; const rows = selectCalls === 1 ? [delivery] : [endpoint]; const result = { limit: vi.fn(async () => rows), then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) }; return { from: vi.fn(() => ({ where: vi.fn(() => result) })) }; }), update: vi.fn(() => ({ set: vi.fn((value: unknown) => { updates.push(value); return { where: vi.fn(async () => undefined) }; }) })) };
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const { retryWebhookDelivery } = await import("./webhook-delivery");
    await expect(retryWebhookDelivery(db, "wd_fail", new Date(2_000))).resolves.toMatchObject({ ok: false, status: 500 });
    expect(updates[0]).toMatchObject({ status: "failed", attempts: 3, lastError: "Receiver returned HTTP 500" });
    expect(updates[0].nextAttemptAt).toBeInstanceOf(Date);
    vi.unstubAllGlobals();
  });

  it("retries a due delivery and records success or failure", async () => {
    const endpoint = { id: "wh_1", url: "https://market.example/hooks", active: 1, secretCiphertext: encryptWebhookSecret("secret") };
    const delivery = { id: "wd_1", endpointId: "wh_1", eventId: "evt_1", payload: "{}", status: "failed", attempts: 1, nextAttemptAt: new Date(1_000) };
    let selectCalls = 0; const updates: any[] = [];
    const db = { select: vi.fn(() => { selectCalls += 1; const rows = selectCalls === 1 ? [delivery] : [endpoint]; const result = { limit: vi.fn(async () => rows), then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) }; return { from: vi.fn(() => ({ where: vi.fn(() => result) })) }; }), update: vi.fn(() => ({ set: vi.fn((value: unknown) => { updates.push(value); return { where: vi.fn(async () => undefined) }; }) })) };
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
    const { retryWebhookDelivery } = await import("./webhook-delivery");
    await expect(retryWebhookDelivery(db, "wd_1", new Date(2_000))).resolves.toMatchObject({ ok: true, status: 200 });
    expect(updates[0]).toMatchObject({ status: "succeeded", attempts: 2 });
    vi.unstubAllGlobals();
  });
});
