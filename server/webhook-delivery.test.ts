import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drainWebhookOutbox, enqueuePaymentVerified, postWebhook } from "./webhook-delivery";
import { verifyWebhookSignature } from "./webhooks";

beforeEach(() => vi.stubEnv("DRUTO_WEBHOOK_ALLOWED_ORIGINS", "https://market.example"));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("durable webhook delivery boundaries", () => {
  it("signs the exact payload and refuses redirects", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await postWebhook("https://market.example/hooks", "secret", "evt_1", '{"order":1}')).toMatchObject({ ok: true });
    const request = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(request[1].redirect).toBe("error");
    const headers = request[1].headers as Record<string, string>;
    expect(headers["x-druto-event-id"]).toBe("evt_1");
    expect(verifyWebhookSignature("secret", String(request[1].body), headers["druto-signature"])).toBe(true);
  });
  it.each(["http://localhost/hooks", "https://private.example/hooks", "https://user:pass@market.example/hooks", "bad-url"])("blocks an unapproved destination: %s", async url => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect((await postWebhook(url, "secret", "evt_1", "{}")).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("fails closed without an operator origin list", async () => {
    vi.stubEnv("DRUTO_WEBHOOK_ALLOWED_ORIGINS", "");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect((await postWebhook("https://market.example/hooks", "secret", "evt_1", "{}")).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("reports receiver failures without exposing URLs or secrets", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sensitive URL error")));
    expect(await postWebhook("https://market.example/hooks", "secret", "evt_1", "{}")).toEqual({ ok: false, status: 0, error: "Webhook request failed or timed out" });
  });
  it("propagates outbox insertion failure instead of sending or silently losing the event", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const tx = { select: () => ({ from: () => ({ where: async () => [{ id: "wh_1" }] }) }), insert: () => ({ values: async () => { throw new Error("disk unavailable"); } }) };
    await expect(enqueuePaymentVerified(tx, { id: "pi_1", merchantAccountId: "ma_1" } as never, { amountAtomic: "1" } as never)).rejects.toThrow("disk unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("bounds worker batches before querying the database", async () => {
    await expect(drainWebhookOutbox({}, 4)).rejects.toThrow("batch limit");
  });
});
