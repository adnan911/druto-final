# Druto production webhook and Next.js API security guide

## Part 1: Configure the webhook in the Druto seller dashboard

The current seller onboarding flow is available from the authenticated Druto dashboard under the seller/API-key workspace. It is labelled **Start accepting with Druto**.

### Step 1: Deploy the webhook route first

Deploy Dashda’s route before registering it in Druto:

```text
https://YOUR-DASHDA-DOMAIN/api/webhooks/druto
```

Use the final Vercel production domain or your custom Dashda domain. The dashboard accepts HTTPS URLs for production. `http://localhost` is intended only for local development.

The route must exist publicly, accept `POST` requests, and be able to read the raw request body. Do not put the webhook behind a login page, browser-only route, or client-side JavaScript handler.

### Step 2: Open the seller onboarding workspace

1. Sign in to Druto.
2. Open the dashboard’s **API Keys** or seller setup workspace.
3. Choose **Start accepting with Druto**.
4. Enter a stable `Marketplace ID`, such as `dashda`.
5. Enter a stable `Seller ID`, such as `dashda_main_seller`.
6. Enter the public seller display name.
7. Enter the approved Arc Testnet receiving wallet.
8. Enter the deployed HTTPS webhook URL.
9. Select **Create seller workspace**.

The seller begins as **pending**. The receiving wallet is not active for customer checkout until the wallet owner completes the offchain ownership signature challenge and an authorized operator activates the seller account.

### Step 3: Save the two one-time credentials

After successful provisioning, Druto reveals:

```text
API key
Webhook secret
```

Copy both immediately into Dashda’s server-side environment settings. The plaintext values are intentionally not shown again. Do not put either value in React code, browser storage, GitHub, screenshots, `NEXT_PUBLIC_*`, or `VITE_*` variables.

Use the API key when Dashda’s backend creates Druto Payment Intents. Use the webhook secret only when Dashda’s backend verifies signed Druto events.

### Step 4: Configure Vercel

In Vercel, open **Project → Settings → Environment Variables** and add the values for Production and Preview as appropriate:

```env
DRUTO_API_KEY=druto_test_...
DRUTO_WEBHOOK_SECRET=...
DRUTO_CHECKOUT_BASE_URL=https://your-druto-host.example
DRUTO_CREATE_INTENT_ENDPOINT=/api/trpc/payments.createIntent
NEXT_PUBLIC_SHOP_URL=https://dashda.example
```

Use the exact variable names expected by the starter. Save the variables and redeploy. The server functions receive the new values only after the new deployment is active.

### Step 5: Verify the webhook with a real testnet payment

Use a disposable buyer wallet funded for Arc Testnet. Create a small test order, select **Pay with Druto**, and confirm the Arc Testnet network, USDC asset, amount, and receiving wallet before approving.

After Druto verifies the Arc transaction, it sends a signed `payment.verified` event to the webhook URL. Check all three places:

1. Dashda’s Vercel runtime logs show a successful webhook request.
2. Dashda’s database has one stored webhook event ID and one paid order update.
3. Druto’s seller dashboard shows the verified payment, Payment Intent ID, transaction hash, and Arcscan link.

The buyer redirect is not proof of payment. The trusted completion boundary is a Druto-verified payment and a valid signed webhook, or a server-side verified status query.

### Step 6: Validate duplicate safety

Send or allow the same webhook event to be delivered more than once. Dashda must return a successful response without creating a second payment record, shipping the order twice, or issuing duplicate fulfillment. Store `x-druto-event-id` with a unique database constraint and process the order update transactionally.

## Part 2: Secure Next.js Payment Intent routes

### Keep secrets server-only

Never expose `DRUTO_API_KEY` or `DRUTO_WEBHOOK_SECRET` through `NEXT_PUBLIC_` variables. Do not send the Druto API key to the browser. The browser should send only a safe order reference to Dashda’s backend.

### Recalculate the order on the server

Do not trust a browser-supplied amount, seller wallet, token contract, network, shipping cost, tax, or discount. Load the order and items from Dashda’s database, calculate the total on the server, and pass the server-calculated amount to Druto.

### Authorize the order lookup

A customer must not be able to change an order ID in the request and view or pay another customer’s order. Use the authenticated buyer session, a signed short-lived checkout token, or another ownership check. For guest checkout, bind the payment session to a server-created checkout record rather than trusting an arbitrary order ID.

### Use idempotency

Create a deterministic idempotency key based on the Dashda order, for example:

```text
dashda-order-{orderId}
```

Store the returned Druto Payment Intent ID. Repeated clicks or retries must return the same payment intent instead of creating multiple payment requests.

### Restrict the payment boundary

For this integration, accept only the configured Arc Testnet and USDC values. Do not accept a recipient wallet address from the browser. Druto should resolve the receiving wallet from the approved seller record.

### Use the Node runtime when required

If the SDK or signature verification uses Node crypto APIs, set the route runtime explicitly:

```ts
export const runtime = "nodejs";
```

### Verify webhooks before parsing or fulfilling

The webhook route should read the raw body first:

```ts
const rawBody = await request.text();
const signature = request.headers.get("druto-signature") ?? "";
const eventId = request.headers.get("x-druto-event-id") ?? "";

const event = verifyDrutoWebhook(
  rawBody,
  signature,
  eventId,
  process.env.DRUTO_WEBHOOK_SECRET!,
);
```

The actual helper signature must match the version in the Druto SDK. Never call `request.json()` before verification if that would discard the exact raw bytes used to sign the request.

### Make database updates idempotent

After verification, use a transaction that creates the event record with a unique event ID, stores the Payment Intent ID and Arc transaction hash, and changes the order to `paid` only if it is not already paid. Queue fulfillment after the database transaction commits. Return a `2xx` response quickly and process slow fulfillment work asynchronously.

### Protect operational data

Use HTTPS, validate content length, rate-limit payment creation, redact secrets and full webhook bodies from logs, and never log private keys or seed phrases. Add monitoring for signature failures, duplicate events, missing orders, inactive sellers, failed fulfillment, and webhook delivery delays.

### Keep the return page informational

The `/orders/:orderId/paid` page may show a pending or confirmed status, but it must read the trusted server-side order status. It must never mark an order paid because the browser was redirected or because a transaction hash appeared in a URL.

## Production readiness boundary

The current Druto implementation is prepared for Arc Testnet and USDC demonstration flows. Before handling mainnet funds, complete a separate review for mainnet configuration, API-key scopes and rotation, webhook retries and dead-letter handling, rate limits, database backups, reconciliation, refunds, seller suspension, audit logs, monitoring, and incident response.
