# Druto Next.js Seller Starter

This is a copy-paste starter for a website that accepts **USDC on Arc Testnet** through Druto hosted checkout. It includes a server-side create-payment route, a signed webhook route, and a client-side `PayWithDrutoButton`.

## 1. Install

```bash
pnpm install
cp .env.example .env.local
pnpm typecheck
pnpm dev
```

The starter uses the local SDK with `file:../druto-sdk`. After the SDK is published, replace that dependency with the registry version.

## 2. Configure secrets

Set these values in `.env.local` or your deployment secret manager:

```env
DRUTO_API_KEY=druto_test_...
DRUTO_WEBHOOK_SECRET=...
DRUTO_CHECKOUT_BASE_URL=https://your-druto-host.example
DRUTO_CREATE_INTENT_ENDPOINT=/api/trpc/payments.createIntent
NEXT_PUBLIC_SHOP_URL=http://localhost:3000
```

`DRUTO_API_KEY` and `DRUTO_WEBHOOK_SECRET` are server-only. Do not rename them with a `NEXT_PUBLIC_` prefix.

## 3. Register the seller

In Druto, create a seller with a stable `marketplaceId`, stable `sellerId`, display name, and public Arc Testnet receiving wallet. The account starts as pending. Complete the wallet ownership challenge with `personal_sign`, then have an authorized operator activate the account.

The browser should send seller identifiers, not a receiving wallet address.

## 4. Create your first payment

Use the component in `components/PayWithDrutoButton.tsx`:

```tsx
<PayWithDrutoButton
  orderId={order.id}
  itemName="Dashda jacket × 1"
  amount={order.totalUsdc}
  buyerEmail={customer.email}
  marketplaceId="dashda"
  sellerId={seller.externalId}
/>
```

Before calling Druto, replace the example route’s body handling with a database lookup. Recalculate the trusted order total from products, quantity, shipping, tax, and discounts. Store the returned Druto Payment Intent ID on the order.

## 5. Webhook fulfillment

Set the webhook URL to:

```text
https://your-site.example/api/webhooks/druto
```

The included route verifies `druto-signature` using the raw request body and reads `x-druto-event-id`. Replace its comments with a database transaction that deduplicates the event, matches `externalOrderId`, stores `transactionHash`, marks the order paid exactly once, and starts fulfillment.

A redirect back to `/orders/:orderId/paid` is not payment proof. The trusted webhook or a server-side verified status check is the payment proof.

## 6. Files to customize

| File | Customize it for |
| --- | --- |
| `app/api/druto/create-payment/route.ts` | Your order lookup, total calculation, authentication, and database write. |
| `app/api/webhooks/druto/route.ts` | Your durable event table, order update, fulfillment queue, and retry behavior. |
| `components/PayWithDrutoButton.tsx` | Your design system, loading state, error UI, and order props. |
| `app/orders/[orderId]/paid/page.tsx` | Your receipt and backend payment-status query. |
| `lib/druto.ts` | Your Druto host and authenticated server transport. |

## 7. Test safely

Use a disposable Arc Testnet wallet. Confirm the seller wallet, amount, token, and network in the wallet prompt before signing. Test success, expiry, incorrect amount, inactive seller, duplicate request, duplicate webhook, and failed webhook delivery.

The current implementation is for Arc Testnet and USDC only. Do not use production funds or a production wallet in this starter.

## 8. Production hardening

Before accepting customer funds, add database-backed idempotency, API-key scopes and rotation, authenticated order lookup, webhook retry and dead-letter handling, rate limits, audit logging, monitoring, reconciliation, refund records, seller suspension, and a separate mainnet security and compliance review.

## 9. Dashda order database synchronization

For a concrete Prisma-style order update, see `docs/DASHDA_DATABASE_SYNC.md` in the Druto seller kit. The webhook route must preserve the raw body, verify `druto-signature`, require `x-druto-event-id`, deduplicate that event ID in your database, match `event.data.externalOrderId` to the Dashda order, store `paymentIntentId` and `transactionHash`, and mark the order paid exactly once. Never fulfill from the browser return page alone.
