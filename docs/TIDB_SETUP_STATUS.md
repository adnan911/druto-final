# TiDB testnet setup — recovered 2026-09-27

Target: druto_testnet on the existing Starter Singapore cluster. Credentials come only from ignored .env.tidb.local. The old test database and Vercel environment were not changed.

## Verified

- TLS certificate verification and explicit database/hostname guards.
- 9 application tables, 111 columns.
- Column names, types, nullability, defaults, auto-increment/update behavior and generated hash expression checked against the baseline snapshot.
- Primary and unique indexes checked, including column order and absence of prefix truncation.
- Baseline migration hash and timestamp checked.
- Real TiDB checks passed: long URL preserved, database-generated SHA256, same-market duplicate rejected, other-market URL allowed, different long URL allowed, duplicate URL update rejected, rollback cleanup verified.
- TypeScript passed; application suite: 92 passed, 1 skipped. API bundles rebuilt locally, not deployed.

## Recovery audit trail

Original migration 0006 failed with ER_TOO_LONG_KEY: marketplaceId plus a full varchar(2048) URL exceeded the index-size limit. Six legacy migrations had committed. Five application tables existed; all were empty.

Recovery retained all existing tables and the six original __drizzle_migrations rows. It checked existing definitions and empty tables, added missing columns, and created missing tables. No DROP, TRUNCATE, DELETE, or historical migration edits were used.

The new schema stores the full URL and a database-generated virtual SHA-256 digest. A marketplaceId + urlHash unique index fits the key limit. A hash collision would reject a distinct URL rather than misroute delivery; delivery uses the full stored URL.

## Separate migration lineage

- Legacy drizzle/*.sql and snapshots remain unchanged. Do NOT run the old db:push command on druto_testnet.
- New testnet migrations live in drizzle-tidb/, generated using drizzle.tidb.config.ts. Their ledger is __druto_tidb_migrations.
- The new ledger contains ONE baseline entry, adopted only after structural verification. This does not claim the failed legacy migration completed.
- The six-row legacy ledger remains as evidence, not as the active migration history.
- This is not an automatic upgrade path for the old test database. That database requires inventory, backup and a reviewed forward migration before using the changed schema.

## Commands

Read-only verification: node scripts/setup-tidb-testnet.mjs

--apply is for an entirely empty new druto_testnet database only.

--recover is narrowly restricted to this interrupted bootstrap: six matching old history rows, empty application tables and compatible definitions. It refuses a database already containing the new ledger. Do not rerun recovery on the completed database.

node scripts/test-tidb-webhook-index.mjs inserts synthetic rows in a transaction, rolls back, and confirms cleanup. It sends no webhooks.

Future migrations need a reviewed forward migration runner using the new ledger. The current script is a bootstrap/recovery tool, not a general deployment migrator.

## Before application cutover

1. Create a least-privilege application database user; separate migration privileges.
2. Point a local/staging application explicitly at the new database and test verified login, seller ownership and API-key scopes against TiDB.
3. Finish security/payment audit findings; these checks do not validate the full checkout/payment state machine.
4. Configure backups/export and recovery, operator identity and secrets before Vercel cutover.

Reference: https://docs.pingcap.com/tidbcloud/generated-columns/ . SHA2 compatibility was also verified on this cluster by actual schema creation and integration tests.

## Application database identity — verified 2026-09-28

Created a separate app identity; credentials are stored in Git-ignored .env.tidb-app.local. The original admin secret file remains unchanged.

Verified with the app connection:
- TLS active.
- Exactly SELECT, INSERT, UPDATE on the nine application tables; no extra grants or grant option.
- SELECT on old test.users denied.
- SELECT on both migration ledgers denied.
- DELETE denied using a zero-row predicate.
- Synthetic user insert/update/read succeeded; rollback and zero remaining test rows verified.

Run `node scripts/provision-tidb-app-user.mjs --verify` to repeat these checks. Without --verify the script provisions a fresh user and refuses existing credentials/users; it does not reset passwords.

Application environment and Vercel are not switched yet. Next: explicitly load the app credentials in local/staging and run authentication, seller isolation and payment persistence integration tests. Do not run migrations with app credentials.

## Router integration — verified 2026-09-28

Command: `node node_modules/vitest/vitest.mjs run --config audit/tidb-integration.config.ts`

One real-database scenario passed using the limited app identity and actual application router. The database provider is injected with a real Drizzle/MySQL connection to keep every write inside one rollback transaction; SQL operations are not mocked.

Checks: signed wallet challenge login for two independent synthetic wallets, session token verification, sequential challenge replay rejection, ordinary user roles, seller list isolation, cross-seller key creation denial, scoped intent authorization, exact USDC atomic amount storage, repeated request idempotency, amount-change conflict, API-key revocation and revoked-key denial. Rollback completed; synthetic user and payment-intent rows were confirmed absent afterward.

Limitations: HTTP/cookie middleware, browser login UX, Privy/Circle, parallel challenge consumption, committed durability across reconnect, onchain settlement and webhook delivery were not exercised. Seller registration currently activates accounts without the complete ownership-verification workflow; this successful test does not resolve that audit finding. Local default backend environment and Vercel remain unchanged.

Seller onboarding follow-up (2026-09-28): registration now starts pending; receiving-wallet proof is required for scoped payment acceptance. See SELLER_OWNERSHIP_MILESTONE.md for validation and remaining limits. The earlier note about automatic activation describes the pre-fix behavior.

Payment settlement follow-up (2026-09-29): four real TiDB concurrency scenarios passed using independent connections and the limited application identity. Receipt verification and webhook dispatch were mocked; settlement SQL was real. Synthetic committed rows were removed with narrowly scoped cleanup. No schema migration was required. See PAYMENT_SETTLEMENT_MILESTONE.md for policy, evidence and remaining release blockers. Default backend environment and Vercel remain unchanged.
