import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PaymentIntent, PaymentTransaction } from "../drizzle/schema";

export const WEBHOOK_EVENT_VERSION = "2026-08-23";
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

type FulfillmentItem = { productId: string; name: string; seller: string; unitPrice: number; quantity: number };
type OrderContext = { items: FulfillmentItem[]; delivery: string; shippingAddress: { name: string; line1: string; city: string; postalCode: string; country: string }; buyerEmail: string };

export type PaymentVerifiedEvent = {
  id: string;
  type: "payment.verified";
  version: string;
  createdAt: string;
  data: {
    paymentIntentId: string; externalOrderId: string; marketplaceId: string | null; sellerId: string | null; merchantAccountId: string | null;
    status: "succeeded"; amount: string; amountAtomic: string; asset: "USDC"; network: "arc-testnet"; buyerAddress: string | null;
    merchantAddress: string; transactionHash: string; orderContext: OrderContext | null;
  };
};

function secretKey() { return createHash("sha256").update(process.env.JWT_SECRET ?? "druto-development-secret").digest(); }

export function encryptWebhookSecret(secret: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptWebhookSecret(ciphertext: string) {
  const [ivValue, tagValue, encryptedValue] = ciphertext.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Invalid webhook secret ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

export function signWebhookPayload(secret: string, payload: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return { header: `t=${timestamp},v1=${signature}`, timestamp, signature };
}

export function verifyWebhookSignature(secret: string, payload: string, header: string, now = Math.floor(Date.now() / 1000)) {
  const timestamp = Number(header.match(/(?:^|,)t=(\d+)/)?.[1]);
  const signature = header.match(/(?:^|,)v1=([a-f0-9]+)/)?.[1];
  if (!Number.isFinite(timestamp) || !signature || Math.abs(now - timestamp) > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const received = Buffer.from(signature, "hex"); const calculated = Buffer.from(expected, "hex");
  return received.length === calculated.length && timingSafeEqual(received, calculated);
}

function parseOrderContext(raw: string | null): OrderContext | null {
  if (!raw) return null;
  try { const value = JSON.parse(raw) as OrderContext; return Array.isArray(value.items) && typeof value.delivery === "string" && typeof value.buyerEmail === "string" ? value : null; } catch { return null; }
}

export function buildPaymentVerifiedEvent(intent: PaymentIntent, transaction: PaymentTransaction, eventId = `evt_${randomBytes(12).toString("hex")}`): PaymentVerifiedEvent {
  return { id: eventId, type: "payment.verified", version: WEBHOOK_EVENT_VERSION, createdAt: new Date().toISOString(), data: {
    paymentIntentId: intent.id, externalOrderId: intent.externalOrderId, marketplaceId: intent.marketplaceId, sellerId: intent.sellerId, merchantAccountId: intent.merchantAccountId,
    status: "succeeded", amount: (Number(transaction.amountAtomic) / 1_000_000).toFixed(6), amountAtomic: transaction.amountAtomic, asset: "USDC", network: "arc-testnet",
    buyerAddress: intent.buyerAddress, merchantAddress: intent.merchantAddress, transactionHash: transaction.transactionHash, orderContext: parseOrderContext(intent.orderContext),
  } };
}

export function createWebhookSecret() { return randomBytes(32).toString("base64url"); }
export function serializeWebhookEvent(event: PaymentVerifiedEvent) { return JSON.stringify(event); }
export function nextRetryAt(attempts: number, now = new Date()) { return new Date(now.getTime() + Math.min(60 * 60 * 1000, 2 ** Math.min(attempts, 8) * 1000)); }
export function isReplaySafe(eventId: string, seenEventIds: Set<string>) { if (seenEventIds.has(eventId)) return false; seenEventIds.add(eventId); return true; }
export function buildWebhookHeaders(eventId: string, signed: ReturnType<typeof signWebhookPayload>) { return { "content-type": "application/json", "user-agent": "druto-webhooks/1.0", "x-druto-event-id": eventId, "druto-signature": signed.header }; }
export function isValidWebhookUrl(value: string) { try { const url = new URL(value); return url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost"); } catch { return false; } }
export function hashEventPayload(payload: string) { return createHash("sha256").update(payload).digest("hex"); }
export type WebhookDeliveryResult = { ok: boolean; status: number; error?: string };
