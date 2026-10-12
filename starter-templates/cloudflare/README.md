# Forma / Druto Cloudflare storefront

A polished, responsive **Arc Testnet demo** storefront with server-owned pricing, persistent D1 orders, hosted Druto checkout and signed webhook acceptance. One verified seller per installation. 0% Druto platform fee; wallet network fees may apply. Demo products do not include actual digital files or delivery.

## 1. Install and preview

Use Node.js 22.12+ (Node 24 LTS recommended). From the extracted directory:

```sh
npm ci
npm run dev
```

Open the localhost URL Wrangler prints. The storefront works in preview mode with payments disabled until configuration is complete. No wallet or secret is needed to inspect the design. `public/tokens.css` controls the palette; `src/catalog.js` owns prices and products. Update `public/index.html` for your branding. No external fonts, tracking or image services are used.

## 2. Give the store its own database

```sh
npx wrangler login
npx wrangler d1 create my-druto-store
```

Paste the returned database ID into **this starter's** `wrangler.jsonc`. Choose a unique Worker/database name. Do not bind this store to Druto's payment ledger database.

```sh
npm run db:local
npm run db:remote
```

The migration creates orders, accepted events and fulfillment jobs. Database triggers enforce exact order/event matching and atomically record payment plus one queued job. Never manually mark orders paid to test the UI.

## 3. Connect a verified Druto seller

In the Druto Testnet dashboard, verify your receiving wallet, create a seller-scoped API key and register your future webhook URL: `https://YOUR-STORE.YOUR-SUBDOMAIN.workers.dev/api/webhooks/druto`. The Druto operator must allow that exact HTTPS origin for webhook dispatch.

Set public routing values in `wrangler.jsonc`: `APP_URL` (your exact HTTPS origin), `DRUTO_MARKETPLACE_ID`, `DRUTO_SELLER_ID`, `DRUTO_MERCHANT_ACCOUNT_ID`, `DRUTO_RECEIVING_ADDRESS`. Keep `DRUTO_BASE_URL` on the Arc Testnet gateway. Ensure the receiving address matches your active Druto seller account.

Set secrets through Wrangler's private prompt:

```sh
npx wrangler secret put DRUTO_API_KEY
npx wrangler secret put DRUTO_WEBHOOK_SECRET
```

Never put secrets in public assets, the configuration's `vars`, browser code, source control or screenshots. Keep the built-in `REQUEST_LIMITER` binding; API operations fail closed if it is absent. Wrangler may require a first deployment before accepting secrets: deploy the unconfigured storefront first, add secrets, then redeploy. Payment endpoints stay disabled until required configuration exists.

## 4. Deploy and verify

```sh
npm run check
npm run deploy
```

Buy one demo product using **Arc Testnet USDC**. The browser creates an order capability in session storage; the Worker stores only its hash. A pending order and immutable price are saved before the provider call. Uncertain responses reuse that order's idempotency key. The intent is bound before the buyer receives the checkout URL.

After payment, the raw signed webhook must match the saved intent, order, amount, recipient, marketplace, seller and account. Only that event can mark paid. Browser return and a transaction hash alone cannot settle an order. Reload the same browser tab to check status. Duplicate delivery must leave one accepted event and one fulfillment job. If you close the browser session, its private order capability may be lost; this demo has no email/account recovery. Keep the order reference and contact the store instead of publishing capabilities in links.

## 5. Before adapting it for customers

- Replace demo products with a trusted catalog; calculate all amounts using integer atomic USDC units. The browser never sets the final price or recipient.
- Add your customer account/order authorization and secure recovery model if the store needs cross-device access. Anonymous capability access is the explicit demo model.
- Implement your fulfillment worker. `fulfillmentJobs` is a durable queue, **not delivery**. Claim jobs safely and make downstream delivery idempotent. Do not label queued orders delivered.
- A pending status can mean unpaid or webhook delayed. Fix the endpoint and retry the same event; never ask a buyer to pay again simply because a webhook was delayed. Expired orders require a new checkout; any late/unknown transfer still needs gateway review.
- Keep old order routing immutable if you change seller configuration. Rotate API/webhook credentials with an overlap/recovery plan. Use tested migrations and backups before schema changes.
- Review request limits, accessibility, logging, refunds, incidents, jurisdiction and customer support before a real-money launch. This starter does not provide mainnet, Circle wallet onboarding, multi-seller splits, fiat payouts, tax calculation, subscriptions or automatic refunds.

## Tests and packaging

Druto's repository contains `server/cloudflare-starter.test.ts` for real SQLite trigger/constraint tests and Worker request tests. Packaged SDK is `0.2.0-testnet.3`, bundled under `vendor/druto-sdk` with its license. The download is a ZIP, not an npm registry publication. Verify its published SHA-256 before extraction. The checksum confirms byte identity, not an independent security audit.

Use starter `0.1.0-testnet.2` or newer: the first release contained an unintended parent-repository install dependency. SDK `0.2.0-testnet.3` fixes the default fetch receiver required by Cloudflare Workers. Earlier Node tests did not cover that runtime incompatibility. The standalone package is now exercised in workerd with local D1, synthetic provider responses, signed duplicate webhooks and restart recovery; this is not proof of a hosted wallet payment.
