# Druto Cloudflare D1 Testnet deployment

The isolated Worker is `druto-d1-testnet` at
`https://druto-d1-testnet.robobq.workers.dev`. It uses D1 database
`druto-d1-testnet` (`d1f68dd0-c984-4b56-8167-d4ae0ee70ca2`), Arc Testnet
USDC, direct seller-wallet transfers, and a **0% platform fee**. It does not
handle real-money launch or Arc mainnet payments.

The D1 database has a reconciled point-in-time copy of `druto_testnet` users,
wallet challenges, and one verified seller. The legacy Vercel Production
database named `test` has **not** been imported. Its old 2% demo payment
history, API keys, and webhook credentials must not be mixed into this new
0% ledger. TiDB writes after the copy are not replicated.

## Repeatable local and remote commands

1. Install dependencies with the checked-in lockfile, then run
   `pnpm cf:d1:build`. This also builds the versioned SDK archive before Vite
   copies it into Cloudflare static assets. Vite's tracked `.env.d1` contains only the public
   wallet-only UI flag; it contains no credential.
2. Apply the schema locally with
   `pnpm exec wrangler d1 migrations apply druto-d1-testnet --local --config wrangler.d1.jsonc`.
   Put local-only `JWT_SECRET` and `DRUTO_WEBHOOK_ENCRYPTION_KEY` in ignored
   `.dev.vars`. Never commit or paste their values.
3. Start `pnpm cf:d1:dev`, then run `pnpm cf:d1:smoke`. The smoke script uses
   an ephemeral wallet and only a loopback URL. It tests wallet and seller
   signature challenges, replay rejection, API key creation, checkout,
   idempotency, lookup, and reporting; it does not submit an Arc transaction.
4. Run `pnpm check`, `pnpm cf:check`, `pnpm test`, and
   `pnpm cf:d1:dry-run`. Deploy this isolated Worker with
   `pnpm exec wrangler deploy --config wrangler.d1.jsonc`. Wrangler secrets
   must be set separately for the same Worker. Check `/api/ready` after deploy.

The D1 schema was already applied to the remote isolated database; do not
re-run a non-idempotent raw SQL import. New database imports require an empty
target, source identity checks, row-count and fingerprint reconciliation.

## API and security boundaries

- Seller dashboard login uses an EVM wallet signature. Privy login is disabled
  in this D1 pilot; Circle Wallets integration remains future work.
- A seller's receiving wallet needs a separate ownership signature before
  checkout is enabled. API keys are scoped to that verified seller and are
  returned only when created. Marketplace servers must keep them off browsers.
- A payment becomes `succeeded` only after Arc Testnet receipt validation and
  a payer confirmation signature. The D1 transaction insert and outbox insert
  run in one atomic batch. No fiat payout or cross-chain flow is offered.
- Webhook delivery runs on a two-minute Cloudflare Cron Trigger. Only operator
  allowed HTTPS origins can be registered. Failed deliveries keep bounded
  retries and a lease-fenced manual retry path.
- Dashboard cookies use `HttpOnly`, `Secure` on HTTPS, and `SameSite=Lax`;
  cross-site browser mutations with a session cookie are rejected.
- The Worker applies Cloudflare Rate Limiting bindings before D1-backed API
  routes: 300 requests/minute per route group and Cloudflare client IP, plus
  120 requests/minute per route group and hashed API key/session cookie.
  Health/readiness checks remain available. Missing or failing bindings return
  503; exhausted buckets return 429 with `Retry-After: 60`. These are Testnet
  abuse limits, not payment accounting or guaranteed global quotas: Cloudflare
  documents that binding counters are location-local and eventually consistent.
  Shared IPs can affect unrelated buyers, so measure 429s and adjust the
  policy before a broader pilot.
- The server-only Testnet SDK is available on the [developer page](https://druto-d1-testnet.robobq.workers.dev/developers)
  and as a [versioned ZIP](https://druto-d1-testnet.robobq.workers.dev/downloads/druto-sdk-0.2.0-testnet.2.zip)
  with a [SHA-256 manifest](https://druto-d1-testnet.robobq.workers.dev/downloads/druto-sdk-0.2.0-testnet.2.zip.sha256).
  The package source is `sdk/druto-sdk`. It creates one seller-scoped intent,
  validates the returned checkout details, and verifies signed webhooks. It is
  not a browser SDK or a mainnet release.

## Verified Testnet path and remaining cutover gates

- One hosted 2 USDC Arc Testnet payment through the new Druto and Luvre
  Workers completed. Druto intent `pi_nXi5jBv0Bxe4` is `succeeded` and the
  linked Luvre order `lf_4f7f0d0e50a246d20e847488bd7b1e4c` is `PAID`.
  Arc receipt `0x4d43ddbf2a8dee4c539c827e5a81514404429940d914ee55a6c26eb74bad27cb`
  contains one matching 2 USDC seller transfer. The signed webhook was
  delivered once, and Luvre recorded one processed event and one fulfillment
  outbox row. The outbox row is `PENDING`; automatic physical fulfillment has
  not been implemented or claimed.
- Luvre Franc hosting and D1 are on Cloudflare. A fresh seller-scoped Druto
  API key and webhook secret are configured as Worker secrets. Both Workers'
  `/api/ready` endpoints returned 200 after configuration.
- Local D1 receiver tests cover duplicate signed webhook delivery and recovery
  from a simulated storage outage. Exercise a live receiver interruption and
  replay without creating another buyer payment. The read-only reconciliation
  script in `scripts/reconcile-cloudflare-testnet.mjs` returned `PASS` for bound
  demo orders, but covers at most 100 orders.
- `workers/testnet-reconciler/index.ts` is a separate, read-only Cloudflare
  Worker bound only to Druto Testnet D1. Its 15-minute Cron checks every
  seller's succeeded payment policy, seller identity, transaction row,
  undelivered webhook count, and matching Arc USDC receipt. Marketplace order
  and fulfillment state are outside this gateway audit. The webhook count
  covers existing delivery rows; it cannot prove an endpoint was configured
  when the payment settled or that a receiver fulfilled an order. It has no public HTTP
  trigger, write query, or credential. A bounded keyset scan reads up to 10
  pages of 10 succeeded payments as of the run start, then compares the page
  count to the initial D1 count. Arc receipts are fetched in matching batches
  of at most 10. The Worker stops with `INCOMPLETE` if Druto has more than 100
  succeeded rows, the pages disagree with the count, its binding is unavailable,
  or Arc RPC fails. This 100-payment Testnet bound is not a production-scale
  reconciliation system: Cloudflare Free limits Cron CPU to 10 ms and external
  subrequests to 50 per invocation, and 100-payment hosted performance has not
  been measured. The Arc primary RPC is used first; if it returns 429, 502–504, or
  a fetch failure, the Worker tries Arc's documented dRPC Testnet endpoint
  after checking its chain ID. If both providers fail, the audit remains
  `INCOMPLETE`; neither provider is an availability guarantee. A recently
  settled payment gets a 10-minute webhook grace window;
  internal ledger corruption never does.
  The Cron logs aggregate counts, pages checked, selected RPC provider, whether
  fallback was attempted, and exception codes; no wallet or transaction detail.
  Deploy it with
  `pnpm cf:reconcile:deploy` after local checks. A failed Cron is visible in
  Cloudflare Workers Logs and Issues. An account notification policy has not
  yet been configured; this is not a guaranteed paging system.
- On 2026-10-10, a temporary local Wrangler scheduled test with a read-only
  remote Druto D1 binding returned `PASS`: 2 succeeded payments, 0 undelivered
  webhooks, and 0 exceptions after Arc receipt checks. The temporary preview
  configuration was removed. This verifies the generalized handler against
  current remote data. A natural scheduled invocation of deployed version
  `d6761750-9a69-4774-afc6-d282294bf8b3` at `2026-10-10T08:45:22Z`
  returned `INCOMPLETE` after reading 2 succeeded payments. The original
  aggregate-only error code did not identify the failed dependency. Safe
  dependency-stage codes were added for diagnosis. The next natural Cron at
  `2026-10-10T09:00:31Z` reported `ARC_RPC_HTTP_429` from the Arc primary RPC,
  confirming that the hosted Cloudflare invocation was rate-limited even though
  the local scheduled test passed. A chain-checked backup was deployed as
  version `67f12fe6-2276-4729-a9e7-3f2f6a1ebab4` with the normal 15-minute
  Cron restored. Its first observed natural scheduled invocation at
  `2026-10-10T09:15:25Z` returned `PASS` on version
  `67f12fe6-2276-4729-a9e7-3f2f6a1ebab4`: 2 succeeded payments, 0
  undelivered webhooks, and 0 exceptions. This proves the generalized hosted
  path worked at that time. The report does not expose which RPC endpoint
  answered, so it does not prove the backup path was exercised in production.
- On 2026-10-10, the bounded keyset/batch audit was deployed as Worker version
  `8f6307f9-10a6-4f39-90af-0e965c6eef97` with the same 15-minute Cron.
  The full suite passed 217 tests (one skipped), TypeScript and Wrangler dry
  run passed, and remote D1 count/keyset queries returned the expected two
  succeeded intents without writes. A real scheduled invocation on this
  version still needs observation; 100-payment throughput and CPU remain
  unverified in hosted Cloudflare.
- The first observed real scheduled invocation of the former Luvre-bound
  version at `2026-10-09T09:30:45Z`
  finished `PASS` on Worker version `8efc1c2b-405d-4e91-b26e-308a47a932c9`:
  2 Druto succeeded payments, 2 Luvre paid orders, 1 pending order, 2 pending
  fulfillment records, and no exception codes. This validates that former
  Cron path, not the generalized code, alert delivery, or future scale.
- A non-destructive D1 restore drill on 2026-10-09 exported both remote Testnet
  databases, imported each into a separate local Wrangler D1, and compared
  aggregate live/restored counts. Druto matched at 2 users, 1 seller, 3
  intents, 2 transactions, 2 webhook deliveries, and 1 API key. Luvre matched
  at 9 orders, 9 attempts, 2 processed events, and 2 fulfillment rows. The
  local SQLite copies passed `integrity_check = ok` and had 0 foreign-key
  violations. Temporary SQL exports and local copies were removed. No remote
  Time Travel restore was attempted. This verifies export/import mechanics,
  not a full production recovery time objective or durable backup retention.
- Review unused legacy UI modules and source integrations. Keep the dashboard
  honest about unavailable subscriptions, fiat payouts, and mainnet support.
- Add operational backup/export, alerting, recovery drill, rate limiting, and
  jurisdiction-specific compliance work before any real customer launch.
- Use the [Testnet incident runbook](CLOUDFLARE_TESTNET_INCIDENT_RUNBOOK.md)
  to triage a reconciliation failure without changing payment records.
- After verified cutover, retire Vercel deployment and TiDB credentials/data
  in that order. Do not delete the old store while any live marketplace URL or
  webhook still depends on it.
