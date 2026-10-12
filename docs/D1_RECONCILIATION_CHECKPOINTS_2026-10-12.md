# Persistent Testnet reconciliation — 12 October 2026

## Implementation and deployment

The scheduled Worker now audits at most 10 succeeded intents **or** 10 reverse-ledger transaction records per invocation. Migration `0003_reconciliation_checkpoint.sql` adds one metadata table. Payment, seller and webhook records are read-only to this worker. The previous read-only `reconcileTestnet` diagnostic deliberately retains its 100-record limit; it is no longer the scheduled entry point.

A D1 conditional update claims a two-minute lease. Each cycle freezes an upper ID range, expected counts and a cutoff excluding the current second (application timestamps have second precision). Intent pages run the existing ledger, policy, webhook and Arc receipt checks. Reverse pages check transaction-to-intent integrity. Both cursors and accumulated anomalies survive invocation boundaries. A token and expiry condition fence checkpoint writes; dependency failure retries the same page. A lost acknowledgement is INCOMPLETE, and the next invocation reads authoritative D1 progress.

Incomplete healthy cycles log `IN_PROGRESS`; occupied leases log `SKIPPED`. Only a completed cycle with no exceptions logs `PASS`. Known anomalies log `FAIL` and remain sticky until that cycle finishes. Dependency/checkpoint errors log `INCOMPLETE`. FAIL and INCOMPLETE still throw in the scheduled handler for observability. Stored partial totals do not claim PASS.

Deployed reconciler version: `52d53de2-cfe4-4e24-840f-1c1218d99815`, Cron `*/15 * * * *`. Gateway Worker unchanged. Remote migration read-back includes 0000–0003. Business counts before/after: users 2, merchants 1, intents 3, transactions 2, endpoints 1, deliveries 2. Time Travel bookmark and count evidence are in ignored outer `audit/backups/d1-*-checkpoint-*-2026-10-12.json`. The initial read-back found no checkpoint row before the first new invocation; the natural hosted cycle was subsequently verified below.

## Natural hosted cycle verified

Read the signed-in Cloudflare Observability UI on 12 October, without manually triggering a run or modifying settings:

- **10:15:30.455 GMT+6** (`04:15:30.455Z`): scheduled report `IN_PROGRESS`, phase `transactions`, `cycleComplete=false`, two succeeded intents, zero reverse transactions checked. Checked-at `04:15:29.564Z`; request `c66438c45241e072574485eaa237f0d2`.
- **10:30:29.173 GMT+6** (`04:30:29.173Z`): same cycle `eba1b666-dc3b-491d-9e80-9177e1a5a0c3`, report **PASS**, phase `complete`, `cycleComplete=true`, two succeeded intents and two reverse transactions checked. All displayed anomaly/grace counters zero, primary RPC, no fallback. Checked-at `04:30:28.831Z`.
- Both reports identify version `52d53de2-cfe4-4e24-840f-1c1218d99815` and scheduled `*/15` events. Completion invocation `5c84e46cb3c876b6f0a490b7c6c5b2ae`, trace `ee57cfa30add7844d9a462b9f3d6f58e`, explicitly reports **outcome `ok`**, CPU 4 ms, wall 361 ms.

This confirms progress survived between natural invocations and the cycle completed on the deployed version. It is one two-payment cycle, not a hosted 123-payment capacity test or all-run reliability guarantee. No new buyer payment was made.

## Validation

41 tests pass: 14 new real-SQL checkpoint tests plus 27 existing reconciliation tests. They cover 123 payments/26 invocations, no partial PASS, sticky anomalies, RPC retry without cursor advance, 20 overlapping invocations, expired-lease fencing, write failure before commit, lost acknowledgement after commit, newly settled earlier IDs deferred to the next cycle, deletion detection, 105 orphan transactions, corrupt metadata, absent binding, empty cycle and scheduled-handler status handling. All business rows remain unchanged. Full application and Cloudflare TypeScript checks and Wrangler dry-run pass. Initial sandbox dependency resolution failed; reruns with normal local dependency access passed. SQL tests use Node SQLite, not hosted D1 concurrency/load simulation.

## Operational limits and recovery

- This is a rolling audit, not a database snapshot. Counts/range checks detect some membership changes but do not prove historical values stayed immutable during the cycle. New settlements after cutoff enter the following cycle.
- With 10 records per invocation and a 15-minute Cron, 123 payments need 26 invocations, approximately 6.5 hours of scheduled slots. Detection latency grows with history. This removes the hard ceiling, **not** the need for future throughput/cost design before a larger pilot.
- Initial/final counts and upper-bound queries still traverse qualifying indexes/ledger records. Correlated checks can inspect many related webhook rows. Bounded selected rows/RPC batches do not mean constant D1 cost or a proven free-tier capacity.
- Webhook grace observations are point-in-time; endpoint history is not reconstructed. There is no automatic financial repair or delivery backfill.
- For an outage, restore the dependency and let the expired/released lease retry. For repeated FAIL, inspect exception codes and the existing reconciliation recovery runbook. Do not advance cursors or clear exceptions to make the report green.
- For code rollback, redeploy previous reconciler version `8018c292-9505-46ff-b1e7-92e9439f8a1f`; leave the additive table in place. The old diagnostic has the 100-payment ceiling. Do not restore the whole live database merely to remove checkpoint metadata.
- Portable off-device backup remains explicitly owner-deferred. Git push remains deferred. Neither is claimed complete by this deployment.
