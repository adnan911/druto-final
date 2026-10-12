# Druto Seller Quick Integration Checklist

Updated 12 October 2026 for the Cloudflare-hosted `0.2.0-testnet.3` SDK. Scope: Arc Testnet USDC, direct seller wallet, 0% fee, one verified seller per payment. [Package integration evidence and limits](SDK_PACKAGE_INTEGRATION_2026-10-12.md). [Workers receiver fix and independent starter verification](STARTER_INDEPENDENT_INSTALL_2026-10-12.md).

## 1. Open the Druto dashboard

- [ ] Open [Druto Testnet dashboard](https://druto-d1-testnet.robobq.workers.dev/dashboard).
- [ ] Click **Connect wallet** and connect the wallet that owns the seller workspace.
- [ ] Sign the domain-bound, off-chain message.
- [ ] Confirm that no private key, seed phrase, gas transaction, or USDC transfer is requested for login.

## 2. Register the seller

In **API Keys / Seller setup**, create the seller workspace using stable identifiers from your website:

| Field | What to enter |
|---|---|
| Marketplace ID | Your marketplace identifier, such as `dashda` |
| Seller ID | Your stable seller identifier, such as `seller_main` |
| Display name | Your store or seller name |
| Receiving wallet | Your Arc Testnet USDC receiving wallet |
| Webhook URL | `https://YOUR-SHOP-DOMAIN/api/webhooks/druto` |

- [ ] Confirm the seller account is created.
- [ ] Complete the wallet-ownership challenge with the same receiving wallet.
- [ ] Confirm that the seller is **Active** before testing payment creation.

## 3. Save credentials once

- [ ] Copy the one-time Druto API key.
- [ ] Copy the one-time webhook secret.
- [ ] Store both in your server secret store or Cloudflare Worker secrets.
- [ ] Never put either value in a `NEXT_PUBLIC_` variable, browser JavaScript, GitHub, screenshots, or chat.

## 4. Configure environment variables

```env
# Server-only
DRUTO_API_KEY=your_druto_api_key
DRUTO_WEBHOOK_SECRET=your_druto_webhook_secret
DRUTO_BASE_URL=https://druto-d1-testnet.robobq.workers.dev

# Public identifiers and URLs
DRUTO_MARKETPLACE_ID=your_marketplace_id
DRUTO_SELLER_ID=your_seller_id
DRUTO_MERCHANT_ACCOUNT_ID=your_merchant_account_id
SHOP_URL=https://YOUR-SHOP-DOMAIN
```

These names are application configuration; the SDK does not automatically read environment variables. Pass them explicitly below. Worker handlers use their `env` bindings instead of `process.env`. Keep seller routing server-controlled even though the identifiers are not secrets.

## 5. Install the integration package

Download the [SDK ZIP](https://druto-d1-testnet.robobq.workers.dev/downloads/druto-sdk-0.2.0-testnet.3.zip), compare its SHA-256 against the [checksum](https://druto-d1-testnet.robobq.workers.dev/downloads/druto-sdk-0.2.0-testnet.3.zip.sha256), and unzip it. In your server project, install the extracted directory:

```bash
npm install ./druto-sdk
```

The package is not published to the npm registry. Use Node.js 20+ or an ESM-capable Worker. The API key must be used only from a server route. The browser calls your own `/api/druto/create-payment` route.

## 6. Create the server Payment Intent route

Your server route should:

- [ ] Authenticate or authorize the order request where appropriate.
- [ ] Recalculate the total from your trusted product catalog.
- [ ] Reject client-supplied receiving wallets and untrusted totals.
- [ ] Persist a pending order with immutable server-calculated amount and seller routing before calling Druto.
- [ ] Send `externalOrderId`, `idempotencyKey`, `itemName`, a decimal-string `amount`, `returnUrl`, and seller identifiers. Optional buyer/shipping data uses the SDK's `orderContext` shape, not a top-level `buyerEmail`.
- [ ] Keep the API key in the server-side `Authorization: Bearer ...` header.
- [ ] Bind the returned intent ID to that order before returning the checkout URL. Reuse the same idempotency key after an uncertain response.

Example server-side request shape:

```ts
import { Druto } from '@druto/sdk';
const druto = new Druto({ apiKey: process.env.DRUTO_API_KEY!, baseUrl: process.env.DRUTO_BASE_URL });
// order and trustedTotal come from authorized, persisted server-side data.
const session = await druto.createPayment({
  externalOrderId: order.id,
  itemName: order.title,
  amount: trustedTotal, // decimal string, e.g. '2.00'; no floating-point calculation
  seller: {
    marketplaceId: process.env.DRUTO_MARKETPLACE_ID!,
    sellerId: process.env.DRUTO_SELLER_ID!,
    merchantAccountId: process.env.DRUTO_MERCHANT_ACCOUNT_ID!,
  },
  returnUrl: `${process.env.SHOP_URL}/orders/${order.id}`,
  idempotencyKey: `order-${order.id}`,
});

await bindIntentToOrder(order.id, session.id); // implement with durable DB checks
return Response.json({ checkoutUrl: session.checkoutUrl });
```

## 7. Add the Pay with Druto button

The button should call your own server route and redirect the buyer to the returned hosted checkout URL:

```tsx
async function payWithDruto() {
  const response = await fetch("/api/druto/create-payment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: order.id }),
  });

  const session = await response.json();
  if (!response.ok || !session.checkoutUrl) {
    throw new Error(session.error ?? "Druto checkout could not be created");
  }

  window.location.assign(session.checkoutUrl);
}
```

The expected buyer flow is:

> **Click Pay with Druto → create/bind Payment Intent on your server → hosted checkout → connect a tested Arc Testnet wallet → approve USDC transfer.**

QR/mobile-wallet compatibility requires its own test; do not promise arbitrary-wallet support based on the SDK integration test.

## 8. Register and implement the webhook

- [ ] Deploy your shop so it has a public HTTPS URL.
- [ ] Register `https://YOUR-SHOP-DOMAIN/api/webhooks/druto` in the Druto dashboard.
- [ ] Have the Druto operator allow the exact HTTPS webhook origin; registration alone does not enable every destination.
- [ ] Save the generated webhook secret.
- [ ] Read the raw request body before parsing JSON.
- [ ] Verify the Druto signature with `DRUTO_WEBHOOK_SECRET`.
- [ ] Reject invalid, expired, or malformed events.
- [ ] Deduplicate by Druto event ID.
- [ ] Process `payment.verified` only after signature validation.
- [ ] Compare intent/order, seller/account, recipient, atomic amount, asset, network and transaction identity with the stored order.
- [ ] In one transaction, store a unique event ID, change an unpaid order to paid and enqueue one fulfillment job. The fulfillment worker must also be idempotent.
- [ ] Return 2xx only after durable acceptance. Return non-2xx on a processing failure so Druto retries. See the [SDK webhook example](../sdk/druto-sdk/README.md#verify-payment-before-fulfillment); implement its database helper in your own application.
- [ ] Do not mark an order paid only because the buyer returned to your site or supplied a transaction hash.

## 9. Test on Arc Testnet

- [ ] Confirm the Druto seller status is **Active**.
- [ ] Confirm the receiving wallet is the wallet you verified.
- [ ] Use Arc Testnet USDC only.
- [ ] Create a real small test order from the storefront.
- [ ] Click **Pay with Druto**.
- [ ] Confirm the hosted Druto page opens.
- [ ] Confirm the page shows the exact amount, Arc Testnet, USDC and expected seller wallet.
- [ ] Approve the transfer from the buyer wallet.
- [ ] Wait for Druto verification and finality.
- [ ] Open the transaction in Arcscan.
- [ ] Confirm the token, chain, amount, sender, and receiving wallet.
- [ ] Confirm the signed webhook reaches your shop.
- [ ] Confirm the order becomes paid once and appears in the Druto dashboard.

## 10. Before making the shop public

- [ ] Use HTTPS for the shop, webhook, and return URL.
- [ ] Separate Cloudflare Testnet configuration/secrets from any future live environment.
- [ ] Redeploy after changing environment variables.
- [ ] Rotate any credential that was exposed in a public repository, screenshot, or chat.
- [ ] Add rate limiting and request validation to your Payment Intent route.
- [ ] Log request IDs and Druto event IDs, but never log API keys, webhook secrets, or private wallet data.
- [ ] Keep fulfillment behind the signed `payment.verified` webhook boundary.
- [ ] Do not move to mainnet until the receiving wallet, webhook handling, monitoring, refund policy, and operational controls have been reviewed.

## Troubleshooting

| Symptom | Likely cause | Check |
|---|---|---|
| `Unable to create Druto payment` | Missing host or server credential | Check explicitly passed `baseUrl`, `apiKey`, and sanitized server errors |
| `Seller is not onboarded or active` | Seller account is missing, pending, or unverified | Complete wallet ownership verification and activation in Druto |
| Wallet connection does not appear | Unsupported provider, network or wrong page | Confirm hosted checkout, supported extension and Arc Testnet; QR support is a separate test |
| Webhook returns 401/400 | Wrong secret, parsed body, or invalid signature handling | Use the exact one-time webhook secret and verify the raw body |
| Payment appears twice | Missing idempotency or event deduplication | Use a stable order idempotency key and store processed event IDs |
| Buyer return says paid but dashboard is not paid | Browser return was trusted | Wait for Druto’s verified event and onchain reconciliation |
