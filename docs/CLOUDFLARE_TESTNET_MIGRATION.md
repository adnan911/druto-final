# Druto Cloudflare migration — Arc Testnet only

Status: the `codex/druto-cloudflare-migration` branch has a successful isolated
Cloudflare Preview deployment at
`https://codex-druto-cloudflare-migration-druto-final.robobq.workers.dev/`.
No database secret, Cron Trigger, custom domain, or production route has been
deployed by this branch. The Vercel production project and its `test` database
remain untouched. A Hyperdrive create attempt failed during TiDB Starter's
authentication handshake (`MySQL AuthSwitchRequest` unsupported); no Hyperdrive
configuration was created or bound to a Worker.

## Target

One Cloudflare Worker serves Vite static assets and the Express/tRPC API on the
same origin. TiDB's official HTTPS serverless driver connects to the existing
restricted `druto_testnet` identity from a branch Preview-only Worker secret.
The same Worker has a scheduled outbox handler; add
the Cron Trigger only after hosted webhook delivery works. `workers.dev` is a
Testnet preview address, not the final business-critical production domain.

The database remains on TiDB in Singapore; this is a hosting migration, not a
database migration. No mainnet USDC or fiat feature is enabled.

## Implemented locally

- `workers/druto-app/index.ts` routes `/api/*`, `/trpc/*`, and
  `/manus-storage/*` to Express. Static assets use Cloudflare Workers Assets.
- `server/db.ts` creates a TiDB HTTPS driver client per Worker invocation.
  The legacy Node MySQL pool stays in place for Vercel until cutover. Worker
  readiness checks the actual SQL database, restricted user, and required
  tables; HTTPS certificate validation is handled by the Workers fetch runtime.
- Cloudflare webhook delivery uses an exact HTTPS origin allowlist, signed
  payload, bounded timeout, and no redirect following. It relies on Workers'
  public-destination egress restriction rather than the Node transport's DNS
  pinning. The existing pinned transport remains for Node.
- Cloudflare readiness requires an explicit public URL, strong JWT secret,
  Privy server credentials, webhook encryption key, and healthy TiDB session.
  Missing settings fail closed. Without `TIDB_DATABASE_URL` the Worker serves
  `/api/health` but responds 503 to all other API routes; payment APIs also
  respond 503 if the required runtime secrets are missing.
- The Worker has a scheduled outbox handler, but no Cron Trigger is configured.
  The older Vercel-calling Cron Worker is only a fallback during transition.
- A Cloudflare-only `iconv-lite` alias avoids a runtime startup error in the
  transitive Express 4 `body-parser` dependency.

## Local verification

- `pnpm check`, `pnpm cf:check`, and `pnpm test` pass.
- `pnpm exec vite build` and `pnpm cf:dry-run` complete. The frontend build needs
  the public `VITE_PRIVY_APP_ID` at build time.
- `pnpm cf:dev` starts the Worker locally. `/` and `/api/health` return 200;
  `/api/ready` returns 503 until the TiDB URL and required secrets are configured.
- Hosted branch Preview smoke test before database secret: `/` loads and `/api/health` returns 200;
  `/api/ready` returns 503, and `/api/v1/payment-intents` returns 503. These
  responses confirm that payment APIs fail closed without a database credential.
- A local read-only TiDB HTTP query returned the expected `druto_testnet`
  database and restricted user. A read-only Drizzle transaction committed, and
  Druto's actual readiness check passed across all required tables.
- These checks do **not** establish hosted TiDB connectivity, production CPU
  headroom, seller login, payment settlement, or webhook delivery. The TiDB
  serverless driver labels interactive transactions experimental.

## Deployment gates

- [x] Use the pre-existing `druto-final` Worker only through its isolated
      GitHub branch Preview. Its Workers Builds pipeline runs Wrangler from the
      repository root, so `wrangler.jsonc` lives there and contains a
      `previews` block. The earlier Preview failed because that block was
      absent; the older production build tried Wrangler auto-configuration
      without a root config. Build `99ff350` succeeded as a branch Preview.
      Cloudflare's Preview URLs are enabled and its Production Worker URL is
      disabled. Wrangler explicitly keeps `workers_dev` false while allowing
      Preview URLs, so a later build does not enable the Production URL by
      accident. Do not deploy to its
      Production environment or change its production route as part of
      initial testing.
- [ ] Confirm migration scope: Druto only or Druto plus Luvre Franc; confirm
      Testnet Preview versus real customer launch.
- [ ] Set the restricted `.druto_app` `druto_testnet` URL as `TIDB_DATABASE_URL`
      on this branch Preview only. Never commit the connection string or add it
      to Previews Base or Production. TiDB's serverless driver sends SQL over
      HTTPS; verify the hosted Worker, including transaction rollback and
      consistency under concurrent payment verification.
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
- [ ] Measure Cloudflare invocation CPU, error rate, and TiDB request units.
      Workers Free limits are 10 ms CPU per HTTP/Cron invocation and 100,000
      Worker requests/day. A payment path exceeding those limits needs
      optimization or a paid plan.
- [ ] Audit existing Vercel `test` database records and plan backup,
      reconciliation, and rollback before changing live traffic. Keep Vercel
      production unchanged until the preview passes every gate.
- [ ] Choose a custom domain and operational/compliance launch plan before
      accepting real customer payments. `workers.dev` is a preview endpoint.

## Primary documentation

- https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/
- https://developers.cloudflare.com/workers/databases/connecting-to-databases/
- https://docs.pingcap.com/developer/serverless-driver/
- https://orm.drizzle.team/docs/mysql/connect-tidb
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/reference/security-model/
