# How a New Seller Starts Using Druto

## Purpose

This guide explains how a new seller can add Druto to an existing website and accept **USDC payments on Arc Testnet**. It is written for a website owner who may not have much backend experience.

Druto provides the payment infrastructure. Your website remains responsible for products, carts, orders, customer accounts, shipping, inventory, refunds, and fulfillment.

> **Current scope:** this guide describes the current Druto starter implementation: direct USDC transfers to one approved seller wallet per Payment Intent, EVM wallet and QR checkout, seller-aware routing, transaction verification, signed `payment.verified` webhooks, and seller-scoped dashboard data. It is a testnet foundation, not a production mainnet payment processor.

## 1. The simple idea

A seller does not put a wallet address directly into every payment button. Instead, the seller is registered in Druto with a stable seller ID and an approved Arc Testnet receiving wallet. At checkout, the website sends Druto the seller ID. Druto resolves the approved wallet, creates a hosted payment session, and verifies the eventual Arc transaction.

The buyer pays through Druto’s hosted wallet or QR checkout. After the payment is verified, Druto sends a signed webhook to the seller’s backend. The seller’s website then marks the order as paid.

```text
Seller registers in Druto
        ↓
Druto verifies seller wallet ownership
        ↓
Administrator activates seller account
        ↓
Website creates Payment Intent at checkout
        ↓
Buyer pays USDC through Druto hosted checkout
        ↓
Druto verifies Arc transaction
        ↓
Signed payment.verified webhook reaches website
        ↓
Website marks order paid and fulfills it
        ↓
Payment appears in Druto dashboard
```

## 2. What the seller needs

| Requirement | Why it is needed |
| --- | --- |
| A website with a backend | Secret credentials and payment confirmation must be handled server-side. |
| An EVM wallet | This is the receiving wallet for Arc Testnet USDC. |
| Arc Testnet access | The current Druto implementation is configured for Arc Testnet. |
| Testnet USDC | Needed for a real test payment. Use a disposable test wallet for demonstrations. |
| A Druto marketplace or seller identity | This connects the website’s seller record to Druto. |
| An API credential | Allows the website backend to create and query payment intents. |
| A webhook signing secret | Allows the website to verify that events came from Druto. |
| HTTPS webhook URL | Druto must be able to deliver verified payment events to the seller backend. |

Do not send a wallet private key to Druto or store it in the website frontend. Druto only needs the public receiving address and a wallet-ownership signature proof.

## 3. Important IDs and secrets

The integration uses several different values. They should not be confused.

| Value | Example | Meaning | Storage location |
| --- | --- | --- | --- |
| `marketplaceId` | `dashda` | Namespace for the website or marketplace. | Website database and Druto configuration. |
| `sellerId` | `seller_123` | Stable seller ID from the website. | Website database and Payment Intent metadata. |
| `merchantAccountId` | `ma_abc123` | Druto’s internal seller-account ID. | Website backend only. |
| `DRUTO_API_KEY` | `druto_live_or_test_secret` | Server credential for Druto API calls. | Server environment variables only. |
| `DRUTO_WEBHOOK_SECRET` | `webhook_secret_value` | HMAC secret for verifying Druto events. | Server environment variables only. |
| `externalOrderId` | `order_10045` | The seller’s own order ID. | Seller database; sent to Druto. |
| `paymentIntentId` | `pi_...` | Druto’s record for one payment attempt. | Seller order-payment table. |
| `transactionHash` | `0x...` | Arc blockchain proof of the transfer. | Seller order-payment table and Druto. |
| `idempotencyKey` | `order_10045-seller_123-v1` | Prevents duplicate Payment Intents during retries. | Server request log and payment record. |

The API key authorizes requests **from the seller website to Druto**. The webhook secret authenticates messages **from Druto to the seller website**. They are different secrets and must not be used interchangeably.

## 4. Seller onboarding in Druto

### Step 1: Create a stable seller record

The website should create a seller record in its own database first. Use a stable ID that will not change if the seller changes their display name.

```text
sellerId: seller_123
marketplaceId: dashda
displayName: Example Clothing Seller
receivingAddress: 0xSellerArcTestnetAddress
status: pending
```

### Step 2: Register the seller in Druto

An authorized marketplace operator registers the seller in Druto with the marketplace ID, seller ID, display name, and public Arc Testnet receiving address.

```ts
await druto.merchantAccounts.register({
  marketplaceId: "dashda",
  sellerId: "seller_123",
  displayName: "Example Clothing Seller",
  receivingAddress: "0xSellerArcTestnetAddress",
});
```

The account begins in a `pending` state. A pending seller must not receive live payment intents.

### Step 3: Prove wallet ownership

Druto creates a short-lived, domain-bound challenge containing the seller identity, wallet address, website origin, and Arc Testnet network.

```ts
const challenge = await druto.merchantAccounts.createOwnershipChallenge({
  seller: {
    marketplaceId: "dashda",
    sellerId: "seller_123",
  },
  origin: "https://dashda.example",
});
```

The seller signs the exact message with `personal_sign`. This is an **offchain signature**. It does not transfer USDC and does not require a blockchain transaction.

```ts
const signature = await walletClient.signMessage({
  message: challenge.message,
});

await druto.merchantAccounts.verifyOwnership({
  challengeId: challenge.challengeId,
  nonce: challenge.message.match(/Nonce: ([a-f0-9]+)/)![1],
  signature,
});
```

Druto recovers the signer address and compares it with the registered receiving address. Expired, replayed, altered, or wrong-wallet signatures are rejected.

### Step 4: Administrator approval

After ownership is verified, an authorized Druto administrator or marketplace operator activates the merchant account. Only an active seller should be used for customer checkout.

The website should store the returned `merchantAccountId`, but the browser should continue sending the stable `{ marketplaceId, sellerId }` pair. The browser should never be allowed to choose an arbitrary receiving wallet.

## 5. Install the SDK

The current standalone starter package is named `@druto/sdk`. During local development it can be installed from the SDK directory:

```bash
pnpm add ../druto-sdk
```

After the package is published to a registry, use the published package instead:

```bash
pnpm add @druto/sdk
```

The SDK provides typed seller routing, Payment Intent request construction, hosted checkout helpers, ownership helpers, and webhook verification helpers.

## 6. Configure the seller backend

Create server-only environment variables. The exact Druto base URL depends on the deployment used by your organization.

```env
DRUTO_API_KEY=replace_with_server_only_key
DRUTO_WEBHOOK_SECRET=replace_with_webhook_secret
DRUTO_CHECKOUT_BASE_URL=https://your-druto-host.example
DRUTO_CREATE_INTENT_ENDPOINT=/api/trpc/payments.createIntent
SHOP_URL=https://dashda.example
DRUTO_NETWORK=arc
DRUTO_ENVIRONMENT=testnet
DRUTO_ASSET=USDC
```

Never prefix these values with `NEXT_PUBLIC_` or `VITE_`. Never commit them to GitHub. In a managed deployment, add them through the hosting provider’s secret manager.

## 7. Add the backend payment client

Keep Druto behind one server-side module so the rest of the website does not need to know credential or transport details.

```ts
import {
  DrutoCheckout,
  createTrpcPaymentAdapter,
} from "@druto/sdk";

export const druto = new DrutoCheckout({
  environment: "testnet",
  network: "arc",
  asset: "USDC",
  checkoutBaseUrl: process.env.DRUTO_CHECKOUT_BASE_URL!,
  createPayment: createTrpcPaymentAdapter(
    process.env.DRUTO_CREATE_INTENT_ENDPOINT!,
  ),
});
```

The SDK’s current starter adapter is designed to call the Druto Payment Intent procedure. A production deployment should place authenticated API-key middleware in front of the public integration endpoint and apply rate limits.

## 8. Create a Payment Intent at checkout

When the buyer clicks **Pay with Druto**, the seller website should call its own backend. The backend must load the order from its database, recalculate the amount from trusted product data, and then create the Druto payment.

```ts
export async function createSellerCheckout(order: {
  id: string;
  totalUsdc: string;
  itemName: string;
  buyerEmail: string;
  marketplaceId: string;
  sellerId: string;
}) {
  const session = await druto.createPayment({
    orderId: order.id,
    itemName: order.itemName,
    amount: order.totalUsdc,
    buyerEmail: order.buyerEmail,
    seller: {
      marketplaceId: order.marketplaceId,
      sellerId: order.sellerId,
    },
    returnUrl: `${process.env.SHOP_URL}/orders/${order.id}/paid`,
  });

  return session;
}
```

Before creating the session, save a pending payment row in the seller database:

```text
orderId: order_10045
paymentIntentId: pi_from_druto
sellerId: seller_123
amount: 25.00
currency: USDC
status: pending
```

Use a stable idempotency key such as `order_10045-seller_123-v1` when calling the underlying Payment Intent contract. If the request is retried, Druto should return the same logical payment rather than creating a duplicate.

## 9. Open the hosted Druto checkout

The browser receives a safe session from the seller backend and opens the returned hosted checkout.

```ts
const checkout = new DrutoCheckout({
  environment: "testnet",
  network: "arc",
  asset: "USDC",
  checkoutBaseUrl: window.location.origin,
  createPayment: (request) =>
    fetch("/api/druto/create-payment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    }).then((response) => response.json()),
});

const session = await checkout.createPayment({
  orderId: "order_10045",
  itemName: "Dashda jacket × 1",
  amount: "25.00",
  buyerEmail: "buyer@example.com",
  seller: {
    marketplaceId: "dashda",
    sellerId: "seller_123",
  },
  returnUrl: "https://dashda.example/orders/order_10045/paid",
});

checkout.openCheckout(session);
```

Druto’s hosted checkout supports an injected EVM wallet and a QR handoff. The buyer should review the Arc network, USDC token, exact amount, and recipient before approving the wallet transaction.

A return URL only brings the buyer back to the website. It is not proof that payment succeeded.

## 10. Add complete order context

For clothing orders, include enough information for receipts and reconciliation:

```ts
orderContext: {
  items: [
    {
      productId: "jacket-black-m",
      name: "Black Arc Jacket",
      seller: "Example Clothing Seller",
      unitPrice: 25,
      quantity: 1,
    },
  ],
  delivery: "Standard delivery",
  shippingAddress: {
    name: "Customer Name",
    line1: "1 Market Street",
    city: "Dhaka",
    postalCode: "1214",
    country: "BD",
  },
  buyerEmail: "buyer@example.com",
}
```

The seller website must calculate the final amount itself. Recheck product prices, quantity, shipping, tax, discounts, and inventory on the backend. Do not trust a total posted by the browser.

## 11. Receive and verify the payment webhook

After Druto verifies the Arc transaction, it sends a signed `payment.verified` event to the seller’s HTTPS webhook endpoint.

The event includes the Druto Payment Intent ID, seller identity, external order ID, exact amount, atomic amount, buyer and merchant addresses, Arc transaction hash, and order context.

The receiver must verify the raw request body before parsing JSON.

```ts
import {
  parsePaymentVerifiedEvent,
  verifyWebhookSignature,
} from "@druto/sdk";

export async function handleDrutoWebhook(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("druto-signature") ?? "";
  const eventId = request.headers.get("x-druto-event-id") ?? "";

  const valid = await verifyWebhookSignature(
    process.env.DRUTO_WEBHOOK_SECRET!,
    rawBody,
    signature,
  );

  if (!valid) {
    return new Response("invalid signature", { status: 401 });
  }

  if (await database.webhookEvents.exists(eventId)) {
    return new Response("already processed", { status: 200 });
  }

  const event = parsePaymentVerifiedEvent(rawBody);
  if (!event) {
    return new Response("invalid event", { status: 400 });
  }

  if (event.type === "payment.verified") {
    await database.orders.markPaidOnce({
      orderId: event.data.externalOrderId,
      paymentIntentId: event.data.paymentIntentId,
      transactionHash: event.data.transactionHash,
    });
  }

  await database.webhookEvents.insert({
    eventId,
    type: event.type,
    receivedAt: new Date(),
  });

  return new Response("ok", { status: 200 });
}
```

The Druto signature has the form `t=<unix-seconds>,v1=<hex-hmac>`. The HMAC input is `${timestamp}.${rawRequestBody}`. Reject stale timestamps, invalid signatures, unknown event formats, and duplicate event IDs.

Marking an order paid must be idempotent. If Druto retries the same event, the website must not create a second shipment, send a second confirmation email, or increase the seller balance twice.

## 12. How data appears in the Druto dashboard

The Druto dashboard obtains seller activity from verified payment records joined to Payment Intents. A payment becomes operational dashboard activity only after Druto verifies the Arc transfer.

| Data | Source | Dashboard use |
| --- | --- | --- |
| Amount and currency | Verified Payment Intent and token transfer | Payment totals and transaction history. |
| Seller ID | Payment Intent seller routing | Seller-scoped activity. |
| Order ID | `externalOrderId` | Reconciliation with the website order. |
| Buyer reference | Payment Intent buyer label | Buyer context and receipt. |
| Transaction hash | Verified Arc receipt | Onchain proof and explorer link. |
| Receiving wallet | Server-resolved merchant account | Recipient and settlement review. |
| Verification status | Druto verification state | Pending, succeeded, expired, or failed state. |

The seller does not need to manually copy payments into the Druto dashboard. The synchronization occurs because every checkout is created as a Druto Payment Intent and every successful transfer is verified by Druto.

The seller’s own website database should still keep its own payment record. Druto is the payment operations ledger; the seller website is the commerce system of record.

## 13. A seller’s daily operating flow

A seller normally uses the system as follows:

1. The seller connects and verifies an Arc Testnet wallet during onboarding.
2. A marketplace operator activates the seller after review.
3. The seller’s website uses the stable seller ID at checkout.
4. Customers pay through Druto using wallet or QR.
5. The seller waits for the verified event rather than trusting the browser redirect.
6. The website marks the order paid and begins fulfillment.
7. The seller opens the Druto dashboard to review verified payments, balances, transaction hashes, and activity.
8. The seller uses the website’s order system for shipping, refunds, and customer support.

## 14. Multi-seller clothing marketplaces

A direct merchant-wallet transfer has one recipient per Payment Intent. If one cart contains items from multiple sellers, group the cart by seller and create one Payment Intent per seller. Each seller group needs its own amount, seller routing, order reference, and idempotency key.

Do not put multiple seller wallets into one direct transfer intent. Do not let the browser choose the recipient address. For a future production split-payment or escrow design, conduct a separate smart-contract audit.

## 15. Test the integration safely

Start with the demo fallback if you only need to rehearse a presentation. The demo fallback is presentation-only and does not move funds.

For a real Arc Testnet test:

1. Create a disposable EVM test wallet.
2. Fund it with Arc Testnet gas and testnet USDC.
3. Register a seller using the correct public receiving address.
4. Complete wallet ownership verification.
5. Activate the seller account.
6. Create a small test order from the seller website.
7. Confirm that the Druto hosted checkout shows the expected seller, amount, asset, and Arc network.
8. Approve the USDC transfer only after checking the wallet prompt.
9. Wait for Druto’s verification result.
10. Confirm the buyer receipt, seller website order, webhook delivery, transaction hash, and Druto dashboard row.
11. Send the same webhook again and confirm that fulfillment happens only once.
12. Test an inactive seller, wrong seller ID, duplicate idempotency key, wrong amount, and failed transaction path.

Never use a production wallet or real funds for this testnet rehearsal.

## 16. Common mistakes

| Mistake | Correct approach |
| --- | --- |
| Putting the API key in frontend JavaScript | Keep it in backend environment variables. |
| Letting the browser submit a receiving wallet | Submit only `marketplaceId` and `sellerId`; Druto resolves the wallet. |
| Marking an order paid after redirect | Wait for verified status or a signed webhook. |
| Trusting the customer’s cart total | Recalculate prices and totals on the backend. |
| Creating a new intent after every retry | Use a stable idempotency key. |
| Processing every webhook delivery as new | Deduplicate by `x-druto-event-id`. |
| Treating wallet ownership proof as payment | Ownership proof only verifies control of a wallet; payment still needs an Arc transfer. |
| Using one intent for several sellers | Create one intent per seller group. |
| Storing only a transaction hash | Store the order ID, intent ID, seller ID, amount, status, and hash together. |

## 17. Production checklist

Before accepting customer funds or switching beyond testnet, add the following:

- Production API-key authentication and scoped credentials.
- Secret rotation and secure secret storage.
- HTTPS-only webhook endpoints with origin and rate controls.
- Durable webhook delivery retries and dead-letter handling.
- Event-ID deduplication and idempotent fulfillment.
- Seller review, wallet ownership verification, suspension, and reactivation controls.
- Refund and dispute records.
- Reconciliation between the seller database, Druto records, and Arc transactions.
- Monitoring for failed payments, delayed verification, failed webhooks, and RPC problems.
- Audit logs for seller changes, wallet changes, payment state changes, and fulfillment actions.
- Mainnet token and chain configuration review.
- Security, compliance, operational, and smart-contract review where applicable.

## 18. Starting checklist for a new seller

A new seller is ready for a first test payment when all of these statements are true:

- The website has a backend.
- The seller has a stable `marketplaceId` and `sellerId`.
- The seller’s Arc Testnet receiving address is registered.
- Wallet ownership has been verified with an offchain signature.
- The merchant account is active.
- The API credential is stored only on the server.
- The webhook secret is stored only on the server.
- The seller website saves the Druto Payment Intent ID.
- The seller website calculates totals server-side.
- The webhook endpoint verifies signatures and deduplicates events.
- A small test payment has appeared in the Druto dashboard.

Once this checklist is complete, the seller can add **Pay with Druto** to the website checkout and use the Druto dashboard to monitor verified customer payments.
