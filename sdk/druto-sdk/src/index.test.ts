import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { Druto, DrutoApiError, verifyPaymentWebhook, type CreatePayment } from "./index";

const request: CreatePayment = {
  externalOrderId: "order_123", idempotencyKey: "order_123_seller_1_v1", itemName: "Example",
  amount: "1.25", seller: { marketplaceId: "market_1", sellerId: "seller_1", merchantAccountId: "ma_123" },
  returnUrl: "https://shop.example/orders/order_123",
};
const session = { id: "pi_abc123", externalOrderId: "order_123", marketplaceId: "market_1",
  sellerId: "seller_1", merchantAccountId: "ma_123", amountAtomic: "1250000", displayAmount: "1.25",
  asset: "USDC", network: "arc-testnet", merchantAddress: `0x${"a".repeat(40)}`,
  platformFeeBps: 0, status: "requires_payment", expiresAt: "2026-10-08T12:00:00.000Z",
  checkoutUrl: "/checkout/pi_abc123", redirectUrl: "https://druto-d1-testnet.robobq.workers.dev/checkout/pi_abc123" };

describe("downloadable Druto SDK", () => {
  it("creates a seller-scoped Testnet checkout with server Bearer auth and stable idempotency", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test_key");
      const body = JSON.parse(String(init.body)).json;
      expect(body).toEqual(request);
      expect(body).not.toHaveProperty("receivingAddress");
      return Response.json({ result: { data: { json: session } } });
    });
    const druto = new Druto({ apiKey: "test_key", fetcher: fetcher as unknown as typeof fetch });
    const result = await druto.createPayment(request);
    expect(result.checkoutUrl).toBe("https://druto-d1-testnet.robobq.workers.dev/checkout/pi_abc123");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects wrong amount, seller, fee, or checkout origin before redirect", async () => {
    for (const change of [ { amountAtomic: "1" }, { sellerId: "other" }, { platformFeeBps: 200 },
      { redirectUrl: "https://evil.example/checkout/pi_abc123" },
      { redirectUrl: "https://user:password@druto-d1-testnet.robobq.workers.dev/checkout/pi_abc123" } ]) {
      const fetcher = vi.fn(async () => Response.json({ result: { data: { json: { ...session, ...change } } } }));
      await expect(new Druto({ apiKey: "test_key", fetcher: fetcher as typeof fetch }).createPayment(request))
        .rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });

  it("rejects unsafe input without making a request and reports API conflicts safely", async () => {
    const fetcher = vi.fn(async () => Response.json({ error: { data: { code: "CONFLICT" } } }, { status: 409 }));
    const druto = new Druto({ apiKey: "test_key", fetcher: fetcher as typeof fetch });
    await expect(druto.createPayment({ ...request, amount: "1.1234567" })).rejects.toThrow("amount");
    expect(fetcher).not.toHaveBeenCalled();
    await expect(druto.createPayment(request)).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
    expect(() => new Druto({ apiKey: "x", baseUrl: "http://druto.example" })).toThrow("HTTPS");
    expect(DrutoApiError.name).toBe("DrutoApiError");
  });

  it("verifies raw signed webhook and rejects tampering, replay window, and event ID mismatch", async () => {
    const event = { id: "evt_abc123", type: "payment.verified", version: "2026-08-23",
      createdAt: "2026-10-08T12:00:00.000Z", data: { paymentIntentId: "pi_abc123", externalOrderId: "order_123",
        marketplaceId: "market_1", sellerId: "seller_1", merchantAccountId: "ma_123", status: "succeeded",
        amount: "1.250000", amountAtomic: "1250000", asset: "USDC", network: "arc-testnet",
        buyerAddress: null, merchantAddress: `0x${"a".repeat(40)}`, transactionHash: `0x${"b".repeat(64)}`,
        orderContext: null } };
    const rawBody = JSON.stringify(event);
    const timestamp = 1_800_000_000;
    const digest = createHmac("sha256", "test_webhook_secret").update(`${timestamp}.${rawBody}`).digest("hex");
    const base = { secret: "test_webhook_secret", rawBody, signature: `t=${timestamp},v1=${digest}`,
      eventId: event.id, nowSeconds: timestamp };
    expect(await verifyPaymentWebhook(base)).toEqual(event);
    expect(await verifyPaymentWebhook({ ...base, rawBody: `${rawBody} ` })).toBeNull();
    expect(await verifyPaymentWebhook({ ...base, eventId: "evt_wrong" })).toBeNull();
    expect(await verifyPaymentWebhook({ ...base, nowSeconds: timestamp + 301 })).toBeNull();
    expect(await verifyPaymentWebhook({ ...base, signature: "t=1,v1=abc" })).toBeNull();
  });
});
