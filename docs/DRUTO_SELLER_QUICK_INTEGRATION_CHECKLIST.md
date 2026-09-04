# Druto Seller Quick Integration Checklist

Use this checklist to connect a marketplace or online store to Druto and send buyers to the hosted Druto payment page.

## 1. Open the Druto dashboard

- [ ] Open the Druto dashboard URL provided by the Druto administrator.
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
- [ ] Store both in your server or Vercel project environment variables.
- [ ] Never put either value in a `NEXT_PUBLIC_` variable, browser JavaScript, GitHub, screenshots, or chat.

## 4. Configure environment variables

```env
# Server-only
DRUTO_API_KEY=your_druto_api_key
DRUTO_WEBHOOK_SECRET=your_druto_webhook_secret
DRUTO_CHECKOUT_BASE_URL=https://YOUR-DRUTO-DOMAIN
DRUTO_CREATE_INTENT_ENDPOINT=/api/trpc/payments.createIntent

# Public identifiers and URLs
NEXT_PUBLIC_DRUTO_MARKETPLACE_ID=your_marketplace_id
NEXT_PUBLIC_DRUTO_SELLER_ID=your_seller_id
NEXT_PUBLIC_DRUTO_DASHBOARD_URL=https://YOUR-DRUTO-DOMAIN/dashboard
NEXT_PUBLIC_SHOP_URL=https://YOUR-SHOP-DOMAIN
```

`DRUTO_CREATE_INTENT_ENDPOINT` is a fixed Druto route. The `DRUTO_CHECKOUT_BASE_URL` is the root URL of the Druto platform that issued the API key. Do not append the API route to the base URL.

## 5. Install the integration package

For the standalone SDK:

```bash
pnpm add @druto/sdk
```

The API key must be used only from a server route. The browser should call your own `/api/druto/create-payment` route instead of calling Druto directly.

## 6. Create the server Payment Intent route

Your server route should:

- [ ] Authenticate or authorize the order request where appropriate.
- [ ] Recalculate the total from your trusted product catalog.
- [ ] Reject client-supplied receiving wallets and untrusted totals.
- [ ] Send `externalOrderId`, `idempotencyKey`, `itemName`, `amount`, `buyerEmail`, `returnUrl`, and the seller identifiers to Druto.
- [ ] Keep the API key in the server-side `Authorization: Bearer ...` header.
- [ ] Return the Druto `checkoutUrl` to the browser without returning secrets.

Example server-side request shape:

```ts
const session = await druto.createPayment({
  orderId: order.id,
  itemName: order.title,
  amount: trustedTotal,
  buyerEmail: order.email,
  seller: {
    marketplaceId: process.env.NEXT_PUBLIC_DRUTO_MARKETPLACE_ID!,
    sellerId: process.env.NEXT_PUBLIC_DRUTO_SELLER_ID!,
  },
  returnUrl: `${process.env.NEXT_PUBLIC_SHOP_URL}/orders/${order.id}/paid`,
  idempotencyKey: `order-${order.id}`,
});

return Response.json({ checkoutUrl: session.checkoutUrl });
```

## 7. Add the Pay with Druto button

The button should call your own server route and redirect the buyer to the returned hosted checkout URL:

```tsx
async function payWithDruto() {
  const response = await fetch("/api/druto/create-payment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      orderId: order.id,
      itemName: order.title,
      amount: order.total,
      buyerEmail: order.email,
      marketplaceId: "your_marketplace_id",
      sellerId: "your_seller_id",
      items: order.items,
      returnUrl: `${window.location.origin}/orders/${order.id}/paid`,
    }),
  });

  const session = await response.json();
  if (!response.ok || !session.checkoutUrl) {
    throw new Error(session.error ?? "Druto checkout could not be created");
  }

  window.location.assign(session.checkoutUrl);
}
```

The expected buyer flow is:

> **Click Pay with Druto → create Payment Intent on your server → redirect to hosted Druto checkout → connect wallet or use QR → approve Arc Testnet USDC transfer.**

## 8. Register and implement the webhook

- [ ] Deploy your shop so it has a public HTTPS URL.
- [ ] Register `https://YOUR-SHOP-DOMAIN/api/webhooks/druto` in the Druto dashboard.
- [ ] Save the generated webhook secret.
- [ ] Read the raw request body before parsing JSON.
- [ ] Verify the Druto signature with `DRUTO_WEBHOOK_SECRET`.
- [ ] Reject invalid, expired, or malformed events.
- [ ] Deduplicate by Druto event ID.
- [ ] Process `payment.verified` only after signature validation.
- [ ] Mark the matching order paid or fulfill it exactly once.
- [ ] Do not mark an order paid only because the buyer returned to your site or supplied a transaction hash.

## 9. Test on Arc Testnet

- [ ] Confirm the Druto seller status is **Active**.
- [ ] Confirm the receiving wallet is the wallet you verified.
- [ ] Use Arc Testnet USDC only.
- [ ] Create a real small test order from the storefront.
- [ ] Click **Pay with Druto**.
- [ ] Confirm the hosted Druto page opens.
- [ ] Confirm the page shows the exact amount, Arc Testnet, USDC, seller, wallet, and QR option.
- [ ] Approve the transfer from the buyer wallet.
- [ ] Wait for Druto verification and finality.
- [ ] Open the transaction in Arcscan.
- [ ] Confirm the token, chain, amount, sender, and receiving wallet.
- [ ] Confirm the signed webhook reaches your shop.
- [ ] Confirm the order becomes paid once and appears in the Druto dashboard.

## 10. Before making the shop public

- [ ] Use HTTPS for the shop, webhook, and return URL.
- [ ] Configure Production variables separately from Preview variables in Vercel.
- [ ] Redeploy after changing environment variables.
- [ ] Rotate any credential that was exposed in a public repository, screenshot, or chat.
- [ ] Add rate limiting and request validation to your Payment Intent route.
- [ ] Log request IDs and Druto event IDs, but never log API keys, webhook secrets, or private wallet data.
- [ ] Keep fulfillment behind the signed `payment.verified` webhook boundary.
- [ ] Do not move to mainnet until the receiving wallet, webhook handling, monitoring, refund policy, and operational controls have been reviewed.

## Troubleshooting

| Symptom | Likely cause | Check |
|---|---|---|
| `Unable to create Druto payment` | Missing host or server credential | Check `DRUTO_CHECKOUT_BASE_URL`, `DRUTO_API_KEY`, and the server logs |
| `Seller is not onboarded or active` | Seller account is missing, pending, or unverified | Complete wallet ownership verification and activation in Druto |
| No wallet or QR option appears | The hosted checkout was never opened | Confirm the server returned `checkoutUrl` and the browser redirects to it |
| Webhook returns 401/400 | Wrong secret, parsed body, or invalid signature handling | Use the exact one-time webhook secret and verify the raw body |
| Payment appears twice | Missing idempotency or event deduplication | Use a stable order idempotency key and store processed event IDs |
| Buyer return says paid but dashboard is not paid | Browser return was trusted | Wait for Druto’s verified event and onchain reconciliation |
