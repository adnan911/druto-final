# Druto SDK — Arc Testnet only

`@druto/sdk` creates hosted USDC checkout sessions for **one verified seller per payment** and verifies signed `payment.verified` webhooks. It runs on a marketplace server or Cloudflare Worker. It does not run with an API key in the buyer browser, custody funds, initiate wallet transactions, or enable Arc mainnet.

## Install the Cloudflare-hosted package

Download [druto-sdk-0.2.0-testnet.4.zip](https://druto-d1-testnet.robobq.workers.dev/downloads/druto-sdk-0.2.0-testnet.4.zip), verify its [SHA-256 checksum](https://druto-d1-testnet.robobq.workers.dev/downloads/druto-sdk-0.2.0-testnet.4.zip.sha256), unzip it, then install the extracted `druto-sdk` directory:

```sh
npm install ./druto-sdk
```

This documentation refresh is version `0.2.0-testnet.4`; the SDK runtime is unchanged from `0.2.0-testnet.3`. This is a downloadable package, **not** an npm registry publication. Node.js 20+ or an ESM-capable Worker runtime is required. The current gateway endpoint is `https://druto-d1-testnet.robobq.workers.dev`. For a marketplace using Cloudflare D1, prefer the [standalone storefront starter](https://druto-d1-testnet.robobq.workers.dev/downloads/druto-cloudflare-starter-0.1.0-testnet.2.zip); it demonstrates the Worker `env` bindings, durable orders and webhook checks.

## Create a checkout session on your server

```ts
import { Druto } from "@druto/sdk";

const druto = new Druto({ apiKey: process.env.DRUTO_API_KEY!, baseUrl: process.env.DRUTO_BASE_URL });
const session = await druto.createPayment({
  externalOrderId: "order_123",
  idempotencyKey: "order_123_seller_456_v1",
  itemName: "Example order",
  amount: "1.00", // USDC decimal string; calculate from trusted catalog data
  seller: { marketplaceId: "market_abc", sellerId: "seller_456" },
  returnUrl: "https://shop.example/orders/order_123",
});
// Send only session.checkoutUrl to the buyer browser for redirect.
```

The seller must be active in Druto, its receiving wallet must have a separate ownership signature, and the API key must be scoped to that seller. The caller supplies stable seller IDs; Druto resolves the recipient wallet. Never accept the final amount, recipient address, or seller identity directly from an untrusted buyer request. Reuse the **same** idempotency key only for a retry of the same immutable order details. For multi-seller carts, create a separate order and intent per seller.

`createPayment` wraps the current tRPC `payments.createIntent` contract. It checks the returned network, asset, zero fee, seller identity, amount, and checkout URL. It throws `DrutoApiError` with `status` and optional `code`; a network timeout has status `0`. If the response is uncertain, retry with the same idempotency key.

## Verify payment before fulfillment

```ts
import { verifyPaymentWebhook } from "@druto/sdk";

const rawBody = await request.text(); // before JSON parsing
const event = await verifyPaymentWebhook({
  secret: process.env.DRUTO_WEBHOOK_SECRET!,
  rawBody,
  signature: request.headers.get("druto-signature") ?? "",
  eventId: request.headers.get("x-druto-event-id") ?? undefined,
});
if (!event) return new Response("invalid event", { status: 401 });
if (event.version !== "2026-08-23") return new Response("unsupported event version", { status: 400 });

// In one database transaction: compare order ID, seller, recipient, amount and
// transaction hash to your pending order; insert event.id under a unique key;
// mark the order paid and enqueue fulfillment only if it was not already paid.
await settleOrderOnce(event);
return new Response("ok", { status: 200 });
```

The signature covers the raw body and timestamp with HMAC-SHA256. The SDK enforces a five-minute timestamp tolerance and checks the optional event-ID header against the signed body. The receiving application must also allow only the event versions it implements; the current Testnet event version is `2026-08-23`. Return non-2xx for unknown versions. Your application must use a durable unique constraint for duplicate events and order fulfillment. A browser return, wallet popup, or transaction hash alone is not payment proof. If webhook processing fails, return a non-2xx response so Druto can retry. `getPayment(id)` is a read-only reconciliation aid; compare its ID, status, atomic amount, asset/network, recipient and transaction hash with your own order record before using it to investigate a pending event. It does not accept or settle an order by itself.

### Cloudflare Worker bindings

Worker secrets are passed as bindings. Do not use `process.env` unless your Worker explicitly enables and configures Node.js compatibility.

```js
import { Druto } from "@druto/sdk";

export default {
  async fetch(request, env) {
    const druto = new Druto({ apiKey: env.DRUTO_API_KEY, baseUrl: env.DRUTO_BASE_URL });
    // Load an authorized pending order from env.DB before this call.
    const session = await druto.createPayment({
      externalOrderId: order.id,
      idempotencyKey: order.idempotencyKey,
      itemName: order.title,
      amount: order.amountUsdc,
      seller: { marketplaceId: order.marketplaceId, sellerId: order.sellerId },
      returnUrl: `${env.APP_URL}/orders/${order.id}`,
    });
    // Persist session.id before redirecting the buyer to session.checkoutUrl.
  },
};
```

This abbreviated handler assumes the named `order` was authenticated, loaded, and price-calculated by your own application. It is not a copy-and-deploy payment app. The ZIP starter provides the complete D1 flow.

## Current scope

Arc **Testnet** USDC, direct seller wallet, 0% platform fee, one-time payments. No mainnet, fiat conversion, subscriptions, payment links, automatic refunds, split settlement, or regulatory authorization is included. Do not use this Testnet SDK for real customer funds. The public SDK archive contains no credential; create API keys and webhook secrets in the Druto seller dashboard and store them only in your server or Worker secret store.
