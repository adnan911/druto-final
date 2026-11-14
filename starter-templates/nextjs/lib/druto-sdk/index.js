class Druto {
  constructor({ apiKey, baseUrl = "https://druto-final.vercel.app/api/trpc" }) {
    this.paymentIntents = {
      create: async params => {
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}/payments.createIntent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ json: params }),
        });
        const session = await this.readResponse(response);
        return { ...session, checkoutUrl: new URL(session.redirectUrl || session.checkoutUrl, baseUrl).href };
      },
      retrieve: async id => this.readResponse(await fetch(`${baseUrl.replace(/\/$/, "")}/payments.getIntent?input=${encodeURIComponent(JSON.stringify({ json: { id } }))}`)),
    };
  }

  async readResponse(response) {
    if (!response.ok) throw new Error(`Druto request failed with HTTP ${response.status}`);
    const data = (await response.json()).result?.data?.json;
    if (!data) throw new Error("Druto returned an invalid response");
    return data;
  }
}

class DrutoCheckout {
  constructor(options = {}) {
    this.options = options;
  }

  async createPayment(request) {
    if (!this.options.createPayment) throw new Error("Configure a server-side createPayment transport");
    const session = await this.options.createPayment({
      ...request,
      externalOrderId: request.externalOrderId || request.orderId,
      amount: String(request.amount),
      buyerLabel: request.buyerLabel || request.buyerEmail,
    });
    const checkoutUrl = new URL(session.redirectUrl || session.checkoutUrl, this.options.checkoutBaseUrl);
    if (!["http:", "https:"].includes(checkoutUrl.protocol)) throw new Error("Invalid checkout URL");
    return { ...session, checkoutUrl: checkoutUrl.href };
  }

  openCheckout(session) {
    if (typeof window === "undefined") throw new Error("Open checkout in the browser");
    const url = new URL(session.checkoutUrl, this.options.checkoutBaseUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid checkout URL");
    window.location.assign(url.href);
  }
}

async function verifyWebhookSignature(secret, rawBody, signature) {
  if (!secret || typeof signature !== "string") return false;
  const timestamp = Number(signature.match(/(?:^|,)t=(\d+)(?:,|$)/)?.[1]);
  const digest = signature.match(/(?:^|,)v1=([a-f0-9]{64})(?:,|$)/)?.[1];
  if (!Number.isSafeInteger(timestamp) || !digest || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  return timingSafeEqual(expected, Buffer.from(digest, "hex"));
}

function parsePaymentVerifiedEvent(rawBody) {
  try {
    const event = JSON.parse(rawBody);
    if (!event || typeof event.id !== "string" || event.type !== "payment.verified" ||
      event.data?.status !== "succeeded" || typeof event.data.externalOrderId !== "string" ||
      typeof event.data.transactionHash !== "string") return null;
    return event;
  } catch {
    return null;
  }
}

module.exports = {
  Druto,
  DrutoCheckout,
  verifyWebhookSignature,
  verifyDrutoWebhook: ({ payload, signature, secret }) => verifyWebhookSignature(secret, payload, signature),
  parsePaymentVerifiedEvent
};
