import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drainWebhookOutbox, enqueuePaymentVerified, postWebhook } from "./webhook-delivery";

beforeEach(() => vi.stubEnv("DRUTO_WEBHOOK_ALLOWED_ORIGINS", "https://market.example"));
afterEach(() => { vi.unstubAllEnvs(); });
describe("durable webhook delivery boundaries", () => {
  it.each(["http://localhost/hooks", "https://private.example/hooks", "https://user:pass@market.example/hooks", "https://127.0.0.1/hooks", "https://market.example/hooks#fragment", "bad-url"])("blocks an unapproved destination: %s", async url => {
    expect((await postWebhook(url, "secret", "evt_1", "{}")).ok).toBe(false);
  });
  it("fails closed without an operator origin list", async () => {
    vi.stubEnv("DRUTO_WEBHOOK_ALLOWED_ORIGINS", "");
    expect((await postWebhook("https://market.example/hooks", "secret", "evt_1", "{}")).ok).toBe(false);
  });
  it("propagates outbox insertion failure instead of sending or silently losing the event", async () => {
    const tx = { select: () => ({ from: () => ({ where: async () => [{ id: "wh_1" }] }) }), insert: () => ({ values: async () => { throw new Error("disk unavailable"); } }) };
    await expect(enqueuePaymentVerified(tx, { id: "pi_1", merchantAccountId: "ma_1" } as never, { amountAtomic: "1" } as never)).rejects.toThrow("disk unavailable");
  });
  it("bounds worker batches before querying the database", async () => {
    await expect(drainWebhookOutbox({}, 4)).rejects.toThrow("batch limit");
  });
});
