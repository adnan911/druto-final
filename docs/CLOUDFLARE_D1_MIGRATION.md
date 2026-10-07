# Druto Testnet database migration: TiDB to Cloudflare D1

Status: local SQLite schema and guard prototype only. No D1 database, Worker
binding, data import, production route, or payment cutover has been created.
The existing Cloudflare Preview has no database secret and fails closed.

## Decision

Cloudflare D1 can hold Druto's Testnet relational data, but it is not a drop-in
replacement for TiDB. D1 uses SQLite; Druto currently uses MySQL tables and
Drizzle's MySQL adapter. In particular, payment settlement, seller ownership,
and webhook leasing use interactive `db.transaction(...)` callbacks with
`SELECT ... FOR UPDATE`. The installed Drizzle D1 adapter emits `BEGIN` for
this callback, while D1 supports atomic prepared-statement `batch(...)`, not
that interactive transaction pattern. A connection-string change would make
critical payment paths fail or weaken their concurrency guarantees.

Proceed with a separate D1 Testnet implementation and keep both Vercel and
the existing TiDB-backed Cloudflare Preview unchanged until the replacement
passes data, concurrency, and hosted payment verification gates. Do not point
real customer traffic at a partial D1 implementation.

## Existing Testnet inventory (read-only, 2026-10-08)

| TiDB `druto_testnet` table | Rows |
| --- | ---: |
| `users` | 2 |
| `apiKeys` | 0 |
| `walletLoginChallenges` | 3 |
| `merchantAccounts` | 1 |
| `ownershipChallenges` | 1 |
| `paymentIntents` | 0 |
| `paymentTransactions` | 0 |
| `webhookEndpoints` | 0 |
| `webhookDeliveries` | 0 |

These counts are an inventory, not a migration. The Vercel Production `test`
database has not been inventoried here and must not be silently replaced.
Preserve seller and user linkage, public wallet addresses, and immutable
payment history if later inventory finds payment records.

## Required code changes

1. Define a parallel SQLite schema and versioned D1 migrations. Convert
   MySQL enums, timestamp defaults and `onUpdateNow`, generated SHA-256 URL
   hash, duplicate-key errors, auto-increment return values, and all
   `affectedRows` checks explicitly. Preserve unique constraints, and add a
   unique payment-intent-to-transaction constraint.
2. Replace each critical interactive transaction with an atomic D1 operation.
   Settlement must verify the Arc receipt before the database write, then
   atomically claim the intent, record the unique transaction, and enqueue
   signed-event outbox rows. Use D1 `batch` only when all dependent statements
   and failure conditions can be prepared in advance; use SQL constraints or
   triggers to reject stale or inconsistent state. Do not make an HTTP/RPC
   call inside a database transaction.
3. Make seller challenge consumption and account activation one atomic state
   transition. Make webhook delivery claims conditional and fenced so retries
   cannot double-send due to competing workers.
4. Add a one-time export/import with explicit MySQL-to-SQLite type conversion,
   row counts and checksums, seller ownership verification, and rollback.
   Keep TiDB read-only during the final delta and cutover; do not dual-write
   payments without a designed reconciliation protocol.
5. Test duplicate Arc transaction hashes, two intents claiming one hash,
   parallel verification of one intent, stale seller challenge, webhook retry
   races, partial batch failure, and database quota exhaustion. Run the tests
   against local D1 and then a separate Cloudflare branch Preview database.

## Local prototype completed

`drizzle/schema.d1.ts` and `drizzle-d1/0000_cool_tempest.sql` define the nine
existing tables for SQLite. The migration adds a unique
`paymentTransactions.paymentIntentId` constraint, a zero-fee default, a
payment-transaction insert guard and settlement trigger, and a seller
challenge activation trigger. These triggers are defense-in-depth; the app
still needs to verify Arc receipts and wallet signatures before writes.
`server/d1-atomic.ts` prepares transaction insertion and webhook outbox
insertion as one D1 batch. It also consumes a signature-verified seller
challenge with one conditional update; the trigger activates the seller in
the same state transition. These helpers are not yet connected to the live API.
`server/d1-webhook-lease.ts` uses conditional updates and an attempt counter
to claim and finish a webhook delivery without an interactive transaction.

The SQL executed against local SQLite and against Wrangler's local D1 engine
(23 schema/index/trigger commands; no remote resource). A local Worker proof
using `tests/d1-local/worker.ts` returned HTTP 200 after confirming one
settled intent, one transaction, one queued event, replay rejection, and full
rollback when an outbox uniqueness conflict follows the transaction insert.
The same local Worker rejected a wrong owner, activated a matching seller,
and rejected replay of the consumed challenge. It also blocked a competing
webhook claim and rejected a stale completion after the first completion.
Other local probes confirmed all nine tables,
zero-fee default, duplicate-hash and duplicate-intent rejection, wrong
recipient rejection, seller activation, and rollback of settlement when a
later outbox insert in the same transaction fails. `pnpm check` passes. These
probes do not prove the deployed D1 runtime or complete the application adapter.

## Cloudflare Free-plan release limits

At the time of this assessment, Cloudflare documents 500 MB per D1 database,
5 GB total storage, 5 million rows read per day, 100,000 rows written per day,
50 queries per Worker invocation, and 7 days of Time Travel on Workers Free.
Queries fail after daily read/write limits are reached. These are Testnet
prototype limits, not a production availability guarantee. Measure Druto's
actual query and CPU budgets before choosing a paid plan or real-money launch.

## Gate before any remote D1 creation

- [ ] Confirm whether all existing Testnet history must be migrated; default
      to preserving it.
- [x] Generate and locally validate the initial SQLite schema and critical
      database guards. Application-level D1 state transitions remain open.
- [ ] Review data conversion and row-count/checksum reconciliation.
- [ ] Create a separate `druto-d1-testnet` D1 database and bind only an isolated
      branch Preview after local tests pass.
- [ ] Complete hosted checkout, seller ownership, idempotency, settlement,
      webhook, dashboard, quota, and rollback checks.
- [ ] Explicitly decide a Production migration only after the Testnet cutover
      is stable. Keep the current Vercel Production database untouched.

## Primary sources

- https://developers.cloudflare.com/d1/
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/best-practices/import-export-data/
- https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1
