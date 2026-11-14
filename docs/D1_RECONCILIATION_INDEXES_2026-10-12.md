# D1 reconciliation indexes — 12 October 2026

## Result

Applied `0002_reconciliation_indexes.sql` to Cloudflare `druto-d1-testnet`. It contains exactly three non-unique CREATE INDEX statements, generated offline from `drizzle/schema.d1.ts` with matching Drizzle snapshot/journal metadata. No table rebuild, data update, deletion, payment rule or API change.

| Index | Purpose | Cost/limit |
| --- | --- | --- |
| `paymentIntents_status_id_updated_idx` (status, id, updatedAt) | Narrow succeeded-intent scan and support ID cursor ordering | Additional index maintenance/storage; updatedAt cutoff is a filter after the status/ID lookup |
| `webhookDeliveries_payment_endpoint_type_idx` (paymentIntentId, endpointId, eventType) | Limit delivery counts to this payment and cover missing endpoint-event lookup | Status/attempt filters still inspect matching payment rows; this is not a global retry-drain index |
| `webhookEndpoints_merchant_active_created_idx` (merchantAccountId, active, createdAt, id) | Find only this merchant's active endpoints present by transaction creation | Extra write/storage cost; does not reconstruct endpoint history |

## Local evidence

The real-SQL reconciler test compares the same seeded database before/after the migration: one succeeded payment plus **1,000 pending intents, 1,000 unrelated endpoints and 5,000 unrelated delivery rows**, alongside its legitimate endpoint/delivery. Baseline query plans contained `SCAN d` and `SCAN e` in correlated subqueries. After indexing, the same audit result and all business row values were preserved, and those full scans became indexed lookups.

**57 targeted tests passed** across reconciliation/RPC, checkout races, webhook leases, settlement rollback and sessions. SQL test fixtures now include the index migration. Full TypeScript and whitespace checks passed. The index test checks query-plan selection and data/result invariance, not wall-clock speed or hosted throughput. Existing unrelated application suites were not repeated.

## Hosted migration evidence

- Pending-migration check showed only `0002_reconciliation_indexes.sql`.
- Saved Time Travel bookmark before application in outer `audit/backups/d1-pre-index-migration-2026-10-12.json`. Its retention is limited; it is not a portable backup. The owner's portable-backup step remains open.
- Pre/post business counts match: users 2, merchant accounts 1, payment intents 3, payment transactions 2, webhook endpoints 1, webhook deliveries 2. Evidence: `d1-pre-index-counts-2026-10-12.json` and `d1-post-index-evidence-2026-10-12.json` in that ignored backup folder.
- Wrangler confirmed successful application: three index statements plus migration registration. Tracker now contains 0000, 0001 and 0002. Read-back confirmed all three index definitions.
- Remote `EXPLAIN QUERY PLAN` of the actual reconciler page SQL returned:

```text
SEARCH p USING INDEX paymentIntents_status_id_updated_idx (status=? AND id>?)
SEARCH t USING INDEX paymentTransactions_paymentIntentId_unique (paymentIntentId=?) LEFT-JOIN
SEARCH m USING INDEX sqlite_autoindex_merchantAccounts_1 (id=?) LEFT-JOIN
SEARCH d USING INDEX webhookDeliveries_payment_endpoint_type_idx (paymentIntentId=?)
SEARCH d USING INDEX webhookDeliveries_payment_endpoint_type_idx (paymentIntentId=?)
SEARCH e USING COVERING INDEX webhookEndpoints_merchant_active_created_idx (merchantAccountId=? AND active=? AND createdAt<?)
SEARCH d USING COVERING INDEX webhookDeliveries_payment_endpoint_type_idx (paymentIntentId=? AND endpointId=? AND eventType=?)
```

- Initial six-term UNION diagnostic was rejected by D1 with `too many terms in compound SELECT`; Wrangler also emitted a Windows shutdown assertion. No migration had run then. Replaced the diagnostic with one SELECT containing scalar counts, which succeeded. This was a diagnostic-query failure, not an application-payment failure.
- No Worker deployment: existing reconciler and gateway queries automatically use the database indexes. No SDK rebuild, wallet operation, hosted load generation or Git push.
- After migration, public `/api/health` and `/api/ready` both returned HTTP 200. This is readiness evidence, not a new wallet-payment E2E test.

## Limits, recovery and next work

The reverse-integrity audit still scans transaction records to find absent/non-succeeded intents; an existing unique index supports its intent lookup. An index does not eliminate that full-ledger check. The **100 succeeded-payment limit remains**, and more records still report INCOMPLETE. This migration does not justify a larger pilot until bounded checkpointed audit coverage and hosted load/cost measurements are designed and tested. No claim of reduced bills or specific speedup is made.

These non-unique indexes can be removed through a reviewed forward migration if necessary; restoring the whole database solely to remove indexes risks losing later payments. The 11 October backup predates this migration: restoring it requires the recorded schema/migration upgrade process, including 0002, before normal traffic. Do not restore over live D1 as part of a test.

Current owner gate: [create portable encrypted backup and verify USB/other-PC copy](PORTABLE_BACKUP_OWNER_STEP_2026-10-12.md). Default backup directory still had no portable archive at the start of this work; no password was requested or used. Next independent engineering gate: define and test reconciliation coverage beyond the current 100-payment cap before increasing that cap.
