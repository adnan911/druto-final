# Druto Cloudflare migration — Arc Testnet only

Status: local compatibility spike. No Cloudflare Worker, Hyperdrive configuration,
secret, Cron Trigger, custom domain, or production route has been deployed by this
branch. The Vercel production project and its `test` database remain untouched.

## Target

One Cloudflare Worker serves Vite static assets and the Express/tRPC API on the
same origin. A Hyperdrive binding connects to the existing restricted TiDB
`druto_testnet` identity. The same Worker has a scheduled outbox handler; add
the Cron Trigger only after hosted webhook delivery works. `workers.dev` is a
Testnet preview address, not the final business-critical production domain.

The database remains on TiDB in Singapore; this is a hosting migration, not a
database migration. No mainnet USDC or fiat feature is enabled.

## Implemented locally

- `workers/druto-app/index.ts` routes `/api/*`, `/trpc/*`, and
  `/manus-storage/*` to Express. Static assets use Cloudflare Workers Assets.
- `server/db.ts` creates a MySQL connection per Worker invocation and closes it
  after the response. Hyperdrive manages its own origin pool. The legacy Node
  pool stays in place for Vercel until cutover. Readiness checks the actual SQL
  database, restricted user, TLS cipher, and required tables.
- Cloudflare webhook delivery uses an exact HTTPS origin allowlist, signed
  payload, bounded timeout, and no redirect following. It relies on Workers'
  public-destination egress restriction rather than the Node transport's DNS
  pinning. The existing pinned transport remains for Node.
- Cloudflare readiness requires an explicit public URL, strong JWT secret,
  Privy server credentials, webhook encryption key, and healthy TiDB session.
  Missing settings fail closed.
- The Worker has a scheduled outbox handler, but no Cron Trigger is configured.
  The older Vercel-calling Cron Worker is only a fallback during transition.
- A Cloudflare-only `iconv-lite` alias avoids a runtime startup error in the
  transitive Express 4 `body-parser` dependency.

## Local verification

- `pnpm check`, `pnpm cf:check`, and `pnpm test` pass.
- `pnpm exec vite build` and `pnpm cf:dry-run` complete. The frontend build needs
  the public `VITE_PRIVY_APP_ID` at build time.
- `pnpm cf:dev` starts the Worker locally. `/` and `/api/health` return 200;
  `/api/ready` returns 503 until Hyperdrive and required secrets are bound.
- These checks do **not** establish TiDB-through-Hyperdrive compatibility,
  production CPU headroom, seller login, payment settlement, or webhook delivery.

## Deployment gates

- [ ] Confirm migration scope: Druto only or Druto plus Luvre Franc; confirm
      Testnet Preview versus real customer launch.
- [ ] Create a dedicated Hyperdrive configuration from the existing restricted
      `.druto_app` credential for `druto_testnet`, with MySQL TLS
      `VERIFY_IDENTITY` and query caching disabled. Record the ID in
      `workers/druto-app/wrangler.jsonc`; never commit the connection string.
      TiDB Cloud is not on Cloudflare's named tested-provider list, so verify it
      against a real hosted Worker.
- [ ] Configure Cloudflare secrets (`JWT_SECRET`, `PRIVY_APP_ID`,
      `PRIVY_APP_SECRET`, `DRUTO_WEBHOOK_ENCRYPTION_KEY`), plus explicit public
      `DRUTO_API_URL` and exact `DRUTO_WEBHOOK_ALLOWED_ORIGINS`. Do not copy
      `ARC_DEPLOYER_PRIVATE_KEY` or TiDB root credentials.
- [ ] Build with the public `VITE_PRIVY_APP_ID` matching the Privy server app.
      Register the Cloudflare preview origin in the Privy dashboard if required.
- [ ] Check `/api/ready` on the deployed Worker, then seller login, wallet
      ownership, API-key permissions, payment-intent creation, Arc Testnet USDC
      verification, duplicate transaction handling, and dashboard reporting.
- [ ] Verify Luvre webhook signature, idempotent order fulfillment, retries,
      and recovery from a failed delivery. Only then enable the scheduled
      outbox Cron Trigger; never run two independent drains unintentionally.
- [ ] Measure Cloudflare invocation CPU, error rate, and Hyperdrive queries.
      Workers Free limits are 10 ms CPU per HTTP/Cron invocation and 100,000
      Worker requests/day; Hyperdrive Free allows 100,000 queries/day. A payment
      path exceeding those limits needs optimization or a paid plan.
- [ ] Audit existing Vercel `test` database records and plan backup,
      reconciliation, and rollback before changing live traffic. Keep Vercel
      production unchanged until the preview passes every gate.
- [ ] Choose a custom domain and operational/compliance launch plan before
      accepting real customer payments. `workers.dev` is a preview endpoint.

## Primary documentation

- https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/
- https://developers.cloudflare.com/hyperdrive/examples/connect-to-mysql/mysql-drivers-and-libraries/drizzle-orm/
- https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/
- https://developers.cloudflare.com/hyperdrive/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/reference/security-model/
