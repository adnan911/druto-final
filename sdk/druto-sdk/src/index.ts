/** Druto Arc Testnet SDK. Keep API keys in server/Worker secrets, never browser code. */
export const DRUTO_TESTNET_URL = "https://druto-d1-testnet.robobq.workers.dev";

export type Seller = { marketplaceId: string; sellerId: string; merchantAccountId?: string };
export type OrderContext = {
  items: Array<{ productId: string; name: string; seller: string; unitPrice: number; quantity: number }>;
  delivery: string;
  shippingAddress: { name: string; line1: string; city: string; postalCode: string; country: string };
  buyerEmail: string;
};
export type CreatePayment = {
  externalOrderId: string;
  idempotencyKey: string;
  itemName: string;
  amount: string;
  seller: Seller;
  returnUrl?: string;
  buyerLabel?: string;
  orderContext?: OrderContext;
};
export type PaymentSession = {
  id: string;
  externalOrderId: string;
  marketplaceId: string;
  sellerId: string;
  merchantAccountId: string;
  amountAtomic: string;
  displayAmount: string;
  asset: "USDC";
  network: "arc-testnet";
  merchantAddress: string;
  platformFeeBps: 0;
  status: string;
  expiresAt: string;
  checkoutUrl: string;
  redirectUrl: string;
};
export type PaymentStatus = {
  id: string;
  amountAtomic: string;
  asset: "USDC";
  network: "arc-testnet";
  merchantAddress: string;
  status: string;
  transactionHash: string | null;
  expiresAt: string;
  platformFeeBps: 0;
};
export type PaymentVerifiedEvent = {
  id: string;
  type: "payment.verified";
  version: string;
  createdAt: string;
  data: {
    paymentIntentId: string;
    externalOrderId: string;
    marketplaceId: string;
    sellerId: string;
    merchantAccountId: string;
    status: "succeeded";
    amount: string;
    amountAtomic: string;
    asset: "USDC";
    network: "arc-testnet";
    buyerAddress: string | null;
    merchantAddress: string;
    transactionHash: string;
    orderContext: OrderContext | null;
  };
};

export class DrutoApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "DrutoApiError";
  }
}

function nonEmpty(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError(`${name} must be a non-empty string of at most ${max} characters`);
  return value;
}
function apiOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new TypeError("Druto baseUrl must be a clean HTTPS origin");
  }
  return url.origin;
}
function validatePayment(input: CreatePayment): CreatePayment {
  if (!input || typeof input !== "object") throw new TypeError("payment is required");
  const externalOrderId = nonEmpty(input.externalOrderId, "externalOrderId", 128);
  const idempotencyKey = nonEmpty(input.idempotencyKey, "idempotencyKey", 128);
  if (idempotencyKey.startsWith("druto_v2_")) throw new TypeError("idempotencyKey uses a reserved prefix");
  const itemName = nonEmpty(input.itemName, "itemName", 255);
  const amount = nonEmpty(input.amount, "amount", 14);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) {
    throw new TypeError("amount must be a positive USDC decimal string with at most 6 fractional digits");
  }
  const seller = input.seller;
  if (!seller || typeof seller !== "object") throw new TypeError("verified seller routing is required");
  const routing: Seller = { marketplaceId: nonEmpty(seller.marketplaceId, "seller.marketplaceId", 128),
    sellerId: nonEmpty(seller.sellerId, "seller.sellerId", 128) };
  if (seller.merchantAccountId !== undefined) routing.merchantAccountId = nonEmpty(seller.merchantAccountId, "seller.merchantAccountId", 32);
  const request: CreatePayment = { externalOrderId, idempotencyKey, itemName, amount, seller: routing };
  if (input.returnUrl !== undefined) {
    const returnUrl = new URL(nonEmpty(input.returnUrl, "returnUrl", 2048));
    if (returnUrl.protocol !== "https:" || returnUrl.username || returnUrl.password || returnUrl.hash) throw new TypeError("returnUrl must be an HTTPS URL without credentials or fragment");
    request.returnUrl = returnUrl.href;
  }
  if (input.buyerLabel !== undefined) request.buyerLabel = nonEmpty(input.buyerLabel, "buyerLabel", 255);
  if (input.orderContext !== undefined) request.orderContext = input.orderContext;
  return request;
}

type DrutoOptions = { apiKey: string; baseUrl?: string; fetcher?: typeof fetch; timeoutMs?: number };
export class Druto {
  private readonly key: string;
  private readonly origin: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  constructor(options: DrutoOptions) {
    if (typeof window !== "undefined") throw new Error("Druto API keys may only be used on a server or Worker");
    this.key = nonEmpty(options?.apiKey, "apiKey", 512);
    this.origin = apiOrigin(options.baseUrl ?? DRUTO_TESTNET_URL);
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1000 || this.timeoutMs > 60_000) throw new TypeError("timeoutMs must be between 1000 and 60000");
  }

  private async call<T>(name: string, method: "GET" | "POST", input: unknown): Promise<T> {
    const path = `${this.origin}/api/trpc/${name}`;
    const url = method === "GET" ? `${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : path;
    let response: Response;
    try {
      response = await this.fetcher(url, { method, headers: { Authorization: `Bearer ${this.key}`,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
        ...(method === "POST" ? { body: JSON.stringify({ json: input }) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      throw new DrutoApiError("Druto request could not complete; retry with the same idempotency key", 0, "NETWORK_ERROR");
    }
    let payload: any;
    try { payload = await response.json(); } catch { throw new DrutoApiError("Druto returned invalid JSON", response.status, "INVALID_RESPONSE"); }
    if (!response.ok) {
      const code = typeof payload?.error?.data?.code === "string" ? payload.error.data.code : undefined;
      throw new DrutoApiError(`Druto request failed (${code ?? `HTTP ${response.status}`})`, response.status, code);
    }
    const data = payload?.result?.data?.json;
    if (!data || typeof data !== "object") throw new DrutoApiError("Druto returned an invalid result", response.status, "INVALID_RESPONSE");
    return data as T;
  }

  async createPayment(input: CreatePayment): Promise<PaymentSession> {
    const request = validatePayment(input);
    const session = await this.call<PaymentSession>("payments.createIntent", "POST", request);
    const redirect = new URL(session.redirectUrl ?? session.checkoutUrl, this.origin);
    const [whole, fraction = ""] = request.amount.split(".");
    const expectedAtomic = (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"))).toString();
    if (redirect.origin !== this.origin || redirect.username || redirect.password ||
      !/^\/checkout\/pi_[A-Za-z0-9_-]+$/.test(redirect.pathname) || redirect.search || redirect.hash ||
      session.asset !== "USDC" || session.network !== "arc-testnet" || session.platformFeeBps !== 0 ||
      session.externalOrderId !== request.externalOrderId || session.marketplaceId !== request.seller.marketplaceId ||
      session.sellerId !== request.seller.sellerId || session.amountAtomic !== expectedAtomic ||
      session.status !== "requires_payment" || !/^0x[a-fA-F0-9]{40}$/.test(session.merchantAddress ?? "")) {
      throw new DrutoApiError("Druto returned a session inconsistent with the request", 200, "INVALID_RESPONSE");
    }
    if (request.seller.merchantAccountId && session.merchantAccountId !== request.seller.merchantAccountId) {
      throw new DrutoApiError("Druto returned a different merchant account", 200, "INVALID_RESPONSE");
    }
    return { ...session, checkoutUrl: redirect.href, redirectUrl: redirect.href };
  }

  /** Read-only reconciliation aid; a browser return or hash alone never authorizes fulfillment. */
  async getPayment(id: string): Promise<PaymentStatus> {
    if (!/^pi_[A-Za-z0-9_-]{1,28}$/.test(id)) throw new TypeError("Invalid payment intent ID");
    const intent = await this.call<PaymentStatus>("payments.getIntent", "GET", { id });
    if (intent.id !== id || intent.network !== "arc-testnet" || intent.asset !== "USDC") {
      throw new DrutoApiError("Druto returned an inconsistent payment status", 200, "INVALID_RESPONSE");
    }
    return intent;
  }
}

/** Verify the exact raw request body before JSON parsing. Returns null for invalid events. */
export async function verifyPaymentWebhook(input: {
  secret: string; rawBody: string; signature: string; eventId?: string; nowSeconds?: number;
}): Promise<PaymentVerifiedEvent | null> {
  if (!input || typeof input.secret !== "string" || !input.secret || typeof input.rawBody !== "string" ||
    typeof input.signature !== "string" || input.rawBody.length > 1_000_000) return null;
  const match = /^t=(\d{10,}),v1=([a-f0-9]{64})$/.exec(input.signature);
  if (!match) return null;
  const timestamp = Number(match[1]);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(timestamp) || !Number.isSafeInteger(now) || Math.abs(now - timestamp) > 300) return null;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(input.secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const signature = new Uint8Array(match[2].match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
    if (!await crypto.subtle.verify("HMAC", key, signature, encoder.encode(`${timestamp}.${input.rawBody}`))) return null;
    const event = JSON.parse(input.rawBody) as Partial<PaymentVerifiedEvent>;
    if (event.type !== "payment.verified" || typeof event.id !== "string" || !/^evt_[A-Za-z0-9_-]+$/.test(event.id) ||
      (input.eventId !== undefined && input.eventId !== event.id) || typeof event.version !== "string" ||
      event.data?.status !== "succeeded" || event.data.asset !== "USDC" || event.data.network !== "arc-testnet" ||
      typeof event.data.externalOrderId !== "string" || typeof event.data.paymentIntentId !== "string" ||
      typeof event.data.merchantAccountId !== "string" || typeof event.data.marketplaceId !== "string" ||
      typeof event.data.sellerId !== "string" || !/^\d+$/.test(event.data.amountAtomic ?? "") ||
      !/^0x[a-fA-F0-9]{40}$/.test(event.data.merchantAddress ?? "") ||
      !/^0x[a-fA-F0-9]{64}$/.test(event.data.transactionHash ?? "")) return null;
    return event as PaymentVerifiedEvent;
  } catch { return null; }
}
