# Druto × Luvre Franc production synchronization troubleshooting

## Confirmed root cause

The supplied Arc Testnet transaction was verified onchain, but its Druto Payment Intent was created without seller routing metadata. The stored record had `marketplaceId = NULL`, `sellerId = NULL`, and `merchantAccountId = NULL`, while the transfer destination was the global fallback wallet `0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217`. Because the dashboard queries are intentionally merchant-account scoped, a succeeded unscoped intent could not appear in the seller dashboard.

The database also contained Luvre records using older, inconsistent identifiers such as `marketplaceId = "luvre franc"`, `sellerId = "luvre_main"`, and `sellerId = "luvre01"`. The current storefront contract is deliberately exact: `marketplaceId = "luvre-franc"` and `sellerId = "luvre-main"`. The existing accounts were pending and did not have wallet ownership proof, so they were not eligible to receive new seller-scoped payments.

No signed webhook delivery was recorded for the supplied transaction. Two webhook endpoints existed for the old marketplace spellings, but the `webhookDeliveries` table had no corresponding event rows. The transaction therefore proved Arc settlement, but it did not prove a correctly configured seller-scoped Druto-to-Luvre webhook flow.

## What the current Druto fix does

Druto now persists non-secret API-key metadata: credential ID, prefix, last four characters, linked merchant account, marketplace ID, seller ID, and seller display name. The API Keys screen reloads this metadata from the database after refresh. Plaintext API keys and webhook secrets remain one-time reveal values; they are never recoverable from the dashboard.

Seller-scoped Payment Intent creation now requires a valid, active, seller-linked Druto API key. A request with missing, revoked, unlinked, or mismatched credentials is rejected instead of silently using the global demo wallet. The documented legacy demo sellers remain isolated as a compatibility path for the hackathon rehearsal.

A protected **Legacy payment repair** control is available in the seller onboarding screen. An authorized operator can provide the Arc transaction hash and the exact seller identifiers. Druto links the old intent only if an active seller account exists and both the stored Payment Intent destination and observed transaction destination exactly match that seller’s receiving wallet. There is no blind database backfill.

## Required Luvre Franc recovery sequence

First, open Druto’s dashboard and create a new seller account using exactly these values:

```text
Marketplace ID: luvre-franc
Seller ID:      luvre-main
Display name:   Luvre Franc
Receiving wallet: 0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217
Webhook URL:    https://louvrefran-cuxqpapx.manus.space/api/webhooks/druto
```

Next, complete the wallet ownership challenge by signing the exact challenge message with the receiving wallet. The account must be approved only after the ownership proof succeeds. A pending seller cannot create customer Payment Intents.

Then generate a new API key and webhook secret from the same onboarding flow. Copy the plaintext values immediately. The API key must be configured in Luvre Franc as `DRUTO_API_KEY`; the webhook secret must be configured as `DRUTO_WEBHOOK_SECRET`. The old API key created before seller metadata was introduced is intentionally treated as unlinked and should not be reused for live seller payments.

Configure the Luvre Franc deployment with the following values in Vercel for both Preview and Production as appropriate:

```text
DRUTO_CHECKOUT_BASE_URL=https://drutopay-mucjtvys.manus.space
DRUTO_CREATE_INTENT_ENDPOINT=/api/trpc/payments.createIntent
NEXT_PUBLIC_DRUTO_MARKETPLACE_ID=luvre-franc
NEXT_PUBLIC_DRUTO_SELLER_ID=luvre-main
NEXT_PUBLIC_DRUTO_DASHBOARD_URL=https://drutopay-mucjtvys.manus.space/dashboard
NEXT_PUBLIC_SHOP_URL=https://louvrefran-cuxqpapx.manus.space
```

Register the production webhook URL in Druto, set the generated webhook secret in Luvre Franc, and redeploy the storefront. The Luvre webhook route validates the raw body signature, event ID, marketplace, seller, asset, and network. It currently logs a verified event rather than changing a durable storefront order table because the demo storefront has no order database; a production storefront must add an idempotent order/event transaction before fulfillment.

## Repair the supplied transaction

After the exact seller account is active and its wallet is verified, open **Dashboard → API Keys → Legacy payment repair**. Enter:

```text
Marketplace ID: luvre-franc
Seller ID:      luvre-main
Arc transaction: 0xa72b0937ab3e133986a9917ecafc515b4790e18f2118265730c6c9f4b3d09545
```

If the destination wallet matches the active seller account, Druto links the old succeeded Payment Intent and it becomes visible in the seller-scoped Payments, Overview, Balances, and Settlements views. If the wallet does not match, Druto rejects the repair to prevent attributing funds to the wrong seller.

## Local Cursor setup

A downloaded Druto platform folder is not self-contained unless it has a reachable MySQL/TiDB database. The server’s `getDb()` intentionally returns `null` when `DATABASE_URL` is missing or cannot create a connection; protected procedures then return `Database is not available`. Copy the project’s environment template into a local-only environment file and provide a real MySQL-compatible connection string, a stable `JWT_SECRET`, the OAuth/Privy values used by the selected login path, and the Arc testnet configuration. Never commit that file.

Apply the generated Drizzle migrations against the same database used by the running API. A frontend-only Vercel deployment cannot supply the Druto Node/Express API or the MySQL database by itself. The API host and dashboard must point at the same database, and the storefront must point its server-side Druto transport at the API host rather than at the storefront origin.

After starting the local server, test the sequence in this order: call `auth.me`, sign in with the wallet, reload the dashboard, open API Keys, and confirm the persistent credential ledger loads. If wallet login succeeds but the dashboard does not open, inspect the browser cookie/session response and the server log for an invalid JWT or a failed database user upsert. The current session implementation prefers the Druto cookie and falls back to a bearer session token only for preview environments; it cannot recover a session when `JWT_SECRET` differs between requests or when the database is unavailable.

## Verification checklist

A correct live test has all of the following properties: the Luvre route sends `Authorization: Bearer <linked key>`; the Druto Payment Intent has `marketplaceId = luvre-franc`, `sellerId = luvre-main`, and a non-null `merchantAccountId`; the merchant address equals the verified seller wallet; the buyer pays USDC on Arc Testnet chain `5042002`; the Druto transaction row contains the Arc transaction hash; a `payment.verified` webhook delivery is persisted and succeeds; the Luvre endpoint accepts the signature and exact seller identifiers; and the Druto dashboard shows the record after a full page refresh.

The current code and database migration have been typechecked, tested, built, and published. The remaining live step is operational: create and approve the exact Luvre seller account, rotate the old unlinked credentials, redeploy Luvre Franc, and run one new small Arc Testnet payment before repairing the legacy record.
