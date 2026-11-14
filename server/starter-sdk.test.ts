import { describe, expect, it, vi, afterEach } from "vitest";
import { createRequire } from "node:module";
import { signWebhookPayload } from "./webhooks";
const require = createRequire(import.meta.url);
const sdk = require("../starter-templates/nextjs/lib/druto-sdk/index.js");

afterEach(() => vi.unstubAllGlobals());
describe("downloadable SDK integration", () => {
  it("accepts server signatures and rejects forged, stale, and missing-secret requests", async () => {
    const raw = JSON.stringify({ id: "evt_1" });
    const signed = signWebhookPayload("secret", raw).header;
    expect(await sdk.verifyWebhookSignature("secret", raw, signed)).toBe(true);
    expect(await sdk.verifyWebhookSignature("secret", raw + " ", signed)).toBe(false);
    expect(await sdk.verifyWebhookSignature("", raw, signed)).toBe(false);
    expect(await sdk.verifyWebhookSignature("secret", raw, "forged")).toBe(false);
    expect(await sdk.verifyWebhookSignature("secret", raw, signWebhookPayload("secret", raw, 1).header)).toBe(false);
  });
  it("never fabricates events from malformed JSON or unrelated event types", () => {
    for (const raw of ["bad", "null", "{}", '{"id":"evt_1","type":"other","data":{}}']) {
      expect(sdk.parsePaymentVerifiedEvent(raw)).toBeNull();
    }
  });
  it("maps store fields and resolves checkout on the Druto host", async () => {
    const transport = vi.fn().mockResolvedValue({ id: "pi_1", checkoutUrl: "/checkout/pi_1" });
    const checkout = new sdk.DrutoCheckout({ createPayment: transport, checkoutBaseUrl: "https://druto.example" });
    const result = await checkout.createPayment({ orderId: "order_1", amount: 2, buyerEmail: "a@example.com" });
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ externalOrderId: "order_1", amount: "2", buyerLabel: "a@example.com" }));
    expect(result.checkoutUrl).toBe("https://druto.example/checkout/pi_1");
  });
  it("sends authenticated tRPC requests and returns an absolute checkout URL", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { data: { json: { id: "pi_1", checkoutUrl: "/checkout/pi_1" } } } }) });
    vi.stubGlobal("fetch", fetch);
    const druto = new sdk.Druto({ apiKey: "test-key", baseUrl: "https://druto.example/api/trpc/" });
    expect((await druto.paymentIntents.create({ amount: "2.00" })).checkoutUrl).toBe("https://druto.example/checkout/pi_1");
    expect(fetch).toHaveBeenCalledWith("https://druto.example/api/trpc/payments.createIntent", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-key" }), body: JSON.stringify({ json: { amount: "2.00" } }) }));
  });
});
