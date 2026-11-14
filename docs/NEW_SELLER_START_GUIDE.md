# New Seller Start Guide

Updated: **13 November 2026**

Audience: marketplace owners, sellers and storefront developers.

Scope: **Arc Testnet USDC · one verified seller per payment · direct seller receipt · 0% Druto platform fee.**

Druto supplies hosted checkout and payment verification. Your storefront owns products, prices, orders, customer access, delivery and support. Webhook acknowledgement is not proof of fulfillment.

## 1. Choose your path

| Situation | Integration | You provide |
| --- | --- | --- |
| Existing marketplace/store | Server SDK in your backend | Order database, create-payment route, signed receiver and idempotent fulfillment |
| New Cloudflare storefront | Standalone storefront starter | Branding/catalog, separate Worker/D1, customer recovery and actual fulfillment |
| Inspect the design only | Storefront preview | No credentials; this does not test payment |

- [Dashboard](https://druto-d1-testnet.robobq.workers.dev/dashboard)
- [Documentation](https://druto-d1-testnet.robobq.workers.dev/developers)
- [Setup checklist](https://druto-d1-testnet.robobq.workers.dev/developers/start)
- [Storefront preview](https://druto-d1-testnet.robobq.workers.dev/starter-preview/)

### Versions and deployment boundaries

| Component | Current version/status |
| --- | --- |
| Server SDK | `@druto/sdk` `0.2.0-testnet.4`: documentation refresh; runtime unchanged from `.3`; downloadable, not npm-published |
| Cloudflare starter | `0.1.0-testnet.2`: contains vendored SDK `.3`; do not replace it merely to match the standalone documentation version |
| Dashboard light/dark theme | Implemented and pushed; hosted availability depends on deployed revision |
| Webhooks operations console | Implemented locally on 13 November; not pushed/deployed at this checkpoint |

The public SDK `.4` and starter `.2` ZIPs were checked on 13 November 2026: downloads succeeded, embedded versions were correct and published SHA-256 values matched. Recheck your own download. A checksum confirms byte identity, not an independent security certification.

## 2. Prepare wallets, IDs and backend

**Owner:** choose stable marketplace/seller IDs, control the workspace login wallet and receiving wallet, and arrange a developer/backend. Use a test buyer wallet with test USDC and sufficient funds for applicable network fees.

**Developer:** provide a backend, durable order storage and a public HTTPS receiver. A browser-only site cannot safely hold the API key. SDK package metadata requires Node.js 20+ or an ESM-capable Worker; the starter toolchain requires Node.js 22.12+.

Give the storefront its **own database**. Do not bind it to Druto's gateway/payment database.

The login wallet identifies the workspace owner. The receiving wallet may differ and needs a separate ownership proof. Neither signature should require payment, a private key or a seed phrase.

## 3. Register and verify the seller

1. Sign in using the wallet that should own the seller workspace.
2. Open **Sellers**. Older hosted revisions may label it **Seller setup / API Keys**.
3. Enter the seller configuration:

| Field | Rule |
| --- | --- |
| Marketplace ID | Stable identifier, e.g. `my-marketplace` |
| Seller ID | Stable within that marketplace, e.g. `seller_123` |
| Display name | Store/seller name |
| Payment destination | Public Arc Testnet receiving address you control |
| Webhook URL | `https://YOUR-STORE.example/api/webhooks/druto`; optional until ready |

4. Review the off-chain ownership message; select the **receiving wallet** for this proof.
5. Confirm **Active** status and the correct receiving address.

Current D1 onboarding activates an eligible account after valid ownership proof. A separate mandatory admin-activation step from older guides does not apply. Wallet ownership is not KYC, KYB, sanctions screening or business approval.

For **“already registered by another account”**, use the original owning login or ask the operator about account recovery. Do not change seller IDs just to bypass ownership. Reuse the seller record across orders; do not create one per buyer/payment.

## 4. Register the endpoint and save credentials

Deploy the receiver at its final HTTPS URL. Ask the Druto operator to enable its **exact HTTPS origin**, including a non-default port if used. Origin approval and endpoint registration are separate.

In the current onboarding flow, a webhook URL supplied with verified seller setup provisions the seller API key and endpoint secret. If you started without a webhook, complete configuration with the same seller identity. Avoid duplicate endpoints and unused keys; use operator assistance if the hosted UI cannot finish the existing setup.

Save both values at their one-time reveal. Normal listing exposes metadata, not the original plaintext secrets.

| Value | Purpose / storage |
| --- | --- |
| `DRUTO_API_KEY` | Backend-to-Druto authentication; server/Worker secret |
| `DRUTO_WEBHOOK_SECRET` | Verify Druto events; server/Worker secret |
| `DRUTO_BASE_URL` | Set to `https://druto-d1-testnet.robobq.workers.dev` |
| `DRUTO_MARKETPLACE_ID`, `DRUTO_SELLER_ID`, `DRUTO_MERCHANT_ACCOUNT_ID` | Trusted seller routing |
| `DRUTO_RECEIVING_ADDRESS` | Expected verified recipient; snapshot against the order |
| `APP_URL` | Your storefront origin |

These are application configuration names; the SDK does not load them automatically. Pass them explicitly. Identifiers are not credentials, but buyers must not override them.

Never expose secrets through browser code, `NEXT_PUBLIC_*` / `VITE_*` variables, public Worker `vars`, screenshots, chat or Git. After partial provisioning failure, inspect existing records first. Revoke unused/exposed credentials through the supported operator/API process; do not assume a revoke button exists in every revision.

## 5A. Existing website: install the SDK

Download [SDK ZIP .4](https://druto-d1-testnet.robobq.workers.dev/downloads/druto-sdk-0.2.0-testnet.4.zip) and its [SHA-256](https://druto-d1-testnet.robobq.workers.dev/downloads/druto-sdk-0.2.0-testnet.4.zip.sha256).

PowerShell, from their download directory:

~~~powershell
$archivePath = '.\druto-sdk-0.2.0-testnet.4.zip'
$checksumPath = '.\druto-sdk-0.2.0-testnet.4.zip.sha256'
$expected = ((Get-Content -LiteralPath $checksumPath -Raw).Trim() -split '\s+')[0]
$actual = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
if ($actual -ine $expected) { throw 'SDK checksum mismatch. Stop installation.' }
~~~

Extract the ZIP, then install the folder containing its `package.json` from your application directory:

~~~sh
npm install ./druto-sdk
~~~

Do not use `npm install @druto/sdk` expecting an npm registry publication.

### Server checkout sequence

1. Authorize the buyer/order request.
2. Calculate the price from trusted catalog data using integer atomic USDC arithmetic.
3. Persist a pending order with immutable amount, seller routing and expected recipient.
4. Create a Druto intent with a stable order-attempt idempotency key.
5. Durably bind the returned intent ID before returning the checkout URL.
6. Redirect the browser to hosted checkout.

Worker integration fragment:

~~~ts
import { Druto } from "@druto/sdk";

// order is already authorized, priced and persisted.
// env contains this storefront's bindings.
const druto = new Druto({
  apiKey: env.DRUTO_API_KEY,
  baseUrl: env.DRUTO_BASE_URL,
});

const session = await druto.createPayment({
  externalOrderId: order.id,
  idempotencyKey: order.idempotencyKey,
  itemName: order.title,
  amount: order.amountUsdc, // decimal string, e.g. "2.00"
  seller: {
    marketplaceId: order.marketplaceId,
    sellerId: order.sellerId,
    merchantAccountId: order.merchantAccountId,
  },
  returnUrl: order.authorizedReturnUrl,
});

await bindIntentToOrder(order.id, session.id);
return Response.json({ checkoutUrl: session.checkoutUrl });
~~~

This is not a complete route. Implement authorization, validation, durable DB operations and error responses. `bindIntentToOrder` is your application function, not an SDK export.

The browser calls **your backend**, not Druto with the API key. After an uncertain response/timeout, retry the **same immutable details and idempotency key**. New random keys on each click can create multiple payable sessions. Prevent conflicting intent bindings in your database.

A multi-seller cart needs separate seller-bound intents and orders/suborders. This release does not atomically split one payment among sellers.

## 5B. New Cloudflare website: adapt the starter

Download and checksum-verify [starter ZIP .2](https://druto-d1-testnet.robobq.workers.dev/downloads/druto-cloudflare-starter-0.1.0-testnet.2.zip) against its [SHA-256](https://druto-d1-testnet.robobq.workers.dev/downloads/druto-cloudflare-starter-0.1.0-testnet.2.zip.sha256).

From the extracted starter directory:

~~~sh
npm ci
npm run dev
npx wrangler login
npx wrangler d1 create my-druto-store
~~~

Choose unique Worker/database names. Put the returned database ID into **the starter's** `wrangler.jsonc`, then apply its migrations:

~~~sh
npm run db:local
npm run db:remote
~~~

Set `APP_URL`, `DRUTO_BASE_URL`, the three seller IDs and `DRUTO_RECEIVING_ADDRESS` in that store's configuration. The receiving address must match the verified seller.

Configure secrets through private prompts:

~~~sh
npx wrangler secret put DRUTO_API_KEY --config wrangler.jsonc
npx wrangler secret put DRUTO_WEBHOOK_SECRET --config wrangler.jsonc
npm run check
npm run deploy
~~~

These commands target the extracted storefront, not Druto's gateway. If initial Worker creation is required before adding secrets, deploy unconfigured first; checkout must stay disabled until configuration is complete.

The starter records orders, accepted events and queued fulfillment jobs. It does **not** deliver products. Implement duplicate-safe delivery, monitoring and customer authorization/recovery. Its anonymous demo capability belongs to the current browser session; do not promise cross-device recovery or share private capabilities in links.

## 6. Verify events before settling orders

Read the raw request body before parsing/modifying it:

~~~ts
import { verifyPaymentWebhook } from "@druto/sdk";

const rawBody = await request.text();
const event = await verifyPaymentWebhook({
  secret: env.DRUTO_WEBHOOK_SECRET,
  rawBody,
  signature: request.headers.get("druto-signature") ?? "",
  eventId: request.headers.get("x-druto-event-id") ?? undefined,
});

if (!event) return new Response("Invalid event", { status: 401 });
if (event.version !== "2026-08-23") {
  return new Response("Unsupported event version", { status: 400 });
}
await settleOrderOnce(event);
return new Response("Accepted", { status: 200 });
~~~

Implement `settleOrderOnce` in your application. Inside one DB transaction:

- Find the stored order and bound intent.
- Match order/intent, marketplace/seller/account, receiving wallet, `amountAtomic`, asset/network and transaction identity.
- Require the supported `payment.verified` / `succeeded` contract and event version.
- Insert the event ID under a durable unique constraint.
- Mark unpaid as paid once and enqueue at most one fulfillment job.
- Acknowledge valid duplicates without fulfilling twice.

Return 2xx only after durable acceptance; processing failure returns non-2xx so delivery can retry. Signature validation alone does not establish that the event belongs to the order being settled.

A browser return, wallet success popup or buyer-supplied hash cannot mark paid. `getPayment(id)` is a read-only reconciliation aid, not a replacement for order matching.

## 7. Operate through the dashboard

In **Payments / Overview**, compare order, amount, recipient and transaction. Verified volume is not a custodial balance or available payout.

### New Webhooks console: available after deployment

See [implementation acceptance and limits](DASHBOARD_WEBHOOK_CONSOLE_2026-11-13.md). Intended signed-in URL: `/dashboard?section=webhooks`.

- Select a registered endpoint; inspect active/paused status and copy its URL.
- Read database-derived Delivered, Awaiting delivery and Failed counts.
- Search order/event/intent, filter status and load more records.
- Inspect attempts, timestamps and the redacted payload.
- Investigate failure, check receiver idempotency, then explicitly confirm **Retry delivery**.
- Retry keeps the event ID and destination; acknowledged, paused or leased/not-due deliveries cannot be forcibly resent.
- Delivered means HTTP acknowledgement, not shipment/fulfillment.

The payload preview omits buyer contact/order context, signatures and secrets; it is **not** the original signed body.

Current limits: HTTP responses are not retained per attempt; retry traces use Worker logs, not an immutable DB activity journal. Endpoint edit/pause controls, signing-secret rotation and synthetic signed test events are not supplied by this console.

If the hosted menu is absent, use deployed seller setup and contact the operator. Local preview does not update hosted service. DEV preview uses sample data and blocks all mutations, including retries.

### Dedicated API Keys section: after deployment

The new local implementation separates credentials from seller onboarding.
Open /dashboard?section=keys, select an active verified seller, enter a key
name and save the one-time secret in your backend/Worker secret store.
Acknowledge saving before hiding it. Leaving the screen loses the secret.

The directory shows masked key, seller scope, created/last-used date and status.
Revocation requires the exact selected key name. It blocks new requests using
that key; it does not sign out a wallet session, rotate webhook secrets or
remove existing payments. Legacy unscoped keys are identified explicitly.

This dedicated screen is not yet pushed/deployed at this checkpoint. Until
released, use the hosted onboarding flow above. See
[API key console implementation](DASHBOARD_API_KEYS_2026-11-13.md).

## 8. Acceptance tests

| Test | Required result |
| --- | --- |
| Seller setup | Correct login owner, verified destination, Active status |
| Checkout creation | Pending order saved; intent bound before redirect |
| Buyer review | Exact amount, USDC, Arc Testnet chain ID `5042002`, correct recipient |
| Transfer and signed event | Verified transaction; receiver marks order paid once |
| Duplicate event | No second settlement or fulfillment job |
| Invalid body/signature/version | Rejected without order changes |
| Wrong amount/seller/recipient | No settlement |
| Create timeout | Same key/details recover checkout without duplication |
| Receiver outage | Remains pending until valid acceptance; no second payment requested merely because delivery is delayed |
| Expired checkout | Payment stops; replacement is a separately tracked attempt |
| Unauthorized access | Another buyer/seller cannot read or settle the order |
| Restart/reload | Durable state survives; authorized recovery follows your actual access model |

Only promise wallet/provider/network combinations tested end-to-end. The SDK does not guarantee arbitrary EVM-wallet, QR, WalletConnect or mobile-wallet compatibility.

## 9. Recover common problems

| Problem | Next step |
| --- | --- |
| Seller belongs to another account | Use original owning login or operator-assisted recovery |
| Seller pending | Check which receiving wallet signed the challenge |
| Wallet request pending | Complete/dismiss the existing wallet request before retrying |
| RPC / `Failed to fetch` | Check public network/RPC error and whether a transaction hash exists before another payment |
| Checkout expired | Ask the store for a new tracked checkout; do not send through the old page |
| Transfer succeeded, order pending | Check verification/webhook acceptance; do not pay again merely because the receiver is delayed |
| Endpoint registration rejected | Check HTTPS URL, verified seller and operator origin allowlist |
| Signature fails | Correct endpoint secret, exact raw body, timestamp and version |
| Empty/non-JSON create response | Show a recoverable error; keep pending order/key and inspect sanitized logs |
| Secret lost/exposed | Use supported rotation/reprovisioning; changing a local variable does not rotate the gateway secret |

Preserve expired intent/transaction history. A replacement needs a new immutable attempt key linked to the original order. Investigate late/unknown transfers rather than silently discarding them or implying automatic refunds.

## 10. Scope and handover

This release does not supply mainnet payments, atomic multi-seller splits, subscriptions, fiat/BDT conversion or payouts, automatic refunds, universal QR/mobile wallets, Circle embedded-wallet onboarding or jurisdiction approval. A checkout session is not a reusable payment-link management product.

0% platform fee does not mean zero network cost. Direct receipt does not make transfers reversible. Seller-authorized refunds are new transfers and need a separate supported process.

Before real-money use, complete applicable security, legal/provider eligibility, monitoring, refund/support, incident recovery and Test/Live separation work. This guide does not declare that work complete.

- [ ] Correct owner login, active seller IDs and verified recipient recorded.
- [ ] Credentials stored only in the intended storefront secret store.
- [ ] Exact HTTPS origin approved and endpoint registered.
- [ ] Pending order persisted; intent bound before redirect.
- [ ] Raw-body verification and exact order matching implemented.
- [ ] Duplicate-safe payment update and fulfillment tested.
- [ ] Expired/failed/delayed cases have a customer recovery path.
- [ ] Store has separate DB, backups and authorization/recovery.
- [ ] Hosted revision, package versions and tested wallets recorded.
- [ ] Unsupported capabilities are not advertised as enabled.

## References and change record

- [Seller quick checklist](DRUTO_SELLER_QUICK_INTEGRATION_CHECKLIST.md)
- [SDK API and examples](../sdk/druto-sdk/README.md)
- [Cloudflare starter](../starter-templates/cloudflare/README.md)
- [Webhook console status](DASHBOARD_WEBHOOK_CONSOLE_2026-11-13.md)
- [Independent starter/Workers evidence](STARTER_INDEPENDENT_INSTALL_2026-10-12.md)
- [Historical guide — superseded](archive/legacy/NEW_SELLER_START_GUIDE.md)

13 November refresh: replaced the redirect-only stub/older narrative with a complete guide; verified public versions/checksums; corrected login-versus-recipient identity, activation, npm-install and QR assumptions; added webhook release status, safe retries, starter limits and acceptance criteria. Existing audit reports and historical material are preserved.