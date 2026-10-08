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
   `pnpm cf:d1:build`. Vite's tracked `.env.d1` contains only the public
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

## Remaining cutover gates

- Run a hosted Arc Testnet payment through the **new** Worker and the
  marketplace, including payer signature, receipt, D1 ledger, webhook and
  exactly-once order fulfillment. Local smoke does not prove this path.
- Move Luvre Franc hosting and its server-side Druto API URL/key/webhook
  configuration to Cloudflare. Rotate the seller API key and webhook secret;
  verify both sides before disabling Vercel.
- Review unused legacy UI modules and source integrations. Keep the dashboard
  honest about unavailable subscriptions, fiat payouts, and mainnet support.
- Add operational backup/export, alerting, recovery drill, rate limiting, and
  jurisdiction-specific compliance work before any real customer launch.
- After verified cutover, retire Vercel deployment and TiDB credentials/data
  in that order. Do not delete the old store while any live marketplace URL or
  webhook still depends on it.
