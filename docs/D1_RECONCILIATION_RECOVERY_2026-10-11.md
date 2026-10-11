# D1 reconciliation detection and operator recovery — 2026-10-11

## Findings and changes

Five failing real-SQL scenarios reproduced three detection gaps in the existing read-only reconciler:

1. Missing or partial webhook fan-out returned PASS because only existing undelivered rows were counted.
2. Exhausted retries within the normal ten-minute delivery grace returned PASS.
3. A transaction with a missing or non-succeeded intent was invisible to the succeeded-intent scan.

The reconciler now emits aggregate counters and exception codes:

| Counter | Exception | Meaning |
| --- | --- | --- |
| `webhookCoverageGaps` | `WEBHOOK_COVERAGE_REVIEW_REQUIRED` | Currently active seller endpoint existed by transaction record creation, but has no matching payment.verified delivery for that intent |
| `exhaustedWebhooks` | `WEBHOOK_RETRIES_EXHAUSTED` | At least ten attempts and either failed, or pending with no live lease; immediately fails audit even within ordinary delivery grace |
| `unsettledTransactions` | `DRUTO_UNSETTLED_TRANSACTION` | Transaction's intent is absent or not succeeded |

The exhaustion check preserves a live final-attempt lease and excludes successful deliveries even after ten attempts. The reverse transaction scan returns at most 101 anomalies; 101 means INCOMPLETE / AUDIT_TRANSACTION_LIMIT, not a complete count. The existing maximum of 100 succeeded payments audited per invocation remains. Existing transaction amount/hash/destination checks remain active.

No new table, migration, provider, credential or repair endpoint. Queries are SELECT-only. The Worker cannot send payments or automatically generate/redeliver webhooks through this code path.

## Verification

- Before fix: 14 new real-SQL cases, nine passed and five failed with incorrect PASS reports.
- Final: **26 tests passed**: 17 migration-backed SQLite cases plus nine existing RPC/fallback/pagination cases. Tests reject non-SELECT queries and compare business-table snapshots before/after each audit.
- Cases include complete settlement; no/new/disabled endpoint; missing/partial coverage; recent and old retries; ten-attempt active lease and exact expiry; successful tenth attempt; missing/wrong amount/hash/recipient transaction; orphan/pending intent; and capped reverse-integrity report. Arc RPC responses are synthetic in tests.
- Application and Cloudflare TypeScript checks, whitespace check and reconciler Wrangler dry-run passed.
- Read-only hosted-data preflight using the same compiled reconciler and existing Wrangler credentials: **PASS at 2026-10-11T16:21:31.651Z**. Two succeeded payments, one page; zero undelivered webhooks, coverage gaps, exhausted retries or unsettled transactions; primary Arc RPC, no exceptions. Only aggregate output retained. A temporary diagnostic initially failed at syntax parsing before any query; corrected before this successful run.
- Deployed only `druto-d1-testnet-reconciler`, version **8018c292-9505-46ff-b1e7-92e9439f8a1f**. Wrangler confirmed existing `DRUTO_D1` binding and `*/15 * * * *` trigger. Main Druto checkout Worker stays **499a5902-a3b9-475c-8015-f40f4805359f**.
- The preflight is a local execution against hosted D1/Arc, not a natural scheduled invocation. At deployment time a natural Cron run had not yet been observed; the 12 October evidence below closes that specific gate. No hosted business data, checkout, migration, SDK or Git remote was changed.

## Natural Cron verified — 12 October 2026 (Asia/Dhaka)

Read the existing signed-in Cloudflare Observability tab for `druto-d1-testnet-reconciler`, filtered `druto_testnet_reconciliation`, and opened the latest report and its matching invocation. No manual trigger or settings change.

| Evidence | Observed value |
| --- | --- |
| Log timestamp | 2026-10-12 00:15:30.410 GMT+6 / 2026-10-11T18:15:30.410Z |
| Report checkedAt | 2026-10-11T18:15:29.741Z |
| Version | 8018c292-9505-46ff-b1e7-92e9439f8a1f |
| Event type / schedule | scheduled / `*/15 * * * *` |
| Invocation ID | b1d047d8c95be9bbbd93cd25be9121d1 |
| Trace ID | 8bc0db347e56b2025f81ddee7bb9e138 |
| Report status / completed invocation outcome | PASS / ok |
| Payments / pages checked | 2 / 1 |
| Undelivered / coverage gaps / exhausted / unsettled | 0 / 0 / 0 / 0 |
| Within grace | 0 |
| RPC provider / fallback attempted | primary / false |
| CPU / wall time | 3 ms / 677 ms |

This confirms one natural invocation on the deployed version, including completed execution and the new audit counters. It is not evidence that every historical/future run succeeds, that notification email was delivered, or that larger workloads meet capacity targets. The user-owned tab remains open on the read-only evidence. No wallet interaction, data mutation, deployment or Git push occurred during this verification.

## Operator recovery

Reconciliation is detection, not authority to rewrite payment history. Do not ask a buyer to pay again merely because reconciliation or a webhook failed.

| Finding | Read-only investigation | Recovery boundary |
| --- | --- | --- |
| Coverage review | Compare intent, transaction, endpoint ID/merchant, endpoint creation time and all deliveries for that pair. Check whether endpoint was disabled at settlement or added/reactivated later. | No automatic backfill. Current schema lacks subscription history, so a gap is a review candidate. A confirmed lost delivery needs a reviewed, idempotent backfill using the existing deterministic event identity and historical payload; this tool is not implemented here. |
| Exhausted retries | Inspect existing delivery's status, attempts, due/lease time and sanitized transport error; confirm receiver URL and signing configuration. Confirm receiver deduplicates event ID. | After fixing receiver/configuration, use the existing owner-authorized manual retry on that delivery. Preserve event ID/payload; do not create a new payment or reset counters with ad-hoc SQL. Remote acceptance can precede a lost local acknowledgement. |
| Unsettled/mismatched transaction | Compare immutable chain receipt fields, original intent terms and transaction row. Preserve a backup and identify whether corruption, import or an old code path caused divergence. | Quarantine the affected record from operational decisions. Do not manually mark paid, delete the transaction, or resend funds. Prepare an explicit repair with preconditions, transaction/outbox checks and audit evidence. No financial auto-repair is authorized by a failed audit. |
| INCOMPLETE / dependency failure | Check exception code, RPC/D1 availability and audit limit. Prior findings in the same report remain relevant. | Retry the read-only audit after resolving the dependency. Above capacity, plan pagination/checkpoints separately; absence of a full audit is not PASS. |

## Limits and next gates

- Endpoint activation/deletion history is not recorded. Current-active/creation-time coverage can flag a later-reactivated endpoint and cannot reconstruct deleted or currently disabled historical subscriptions. Timestamp precision also limits ordering inference. Hence REVIEW_REQUIRED, not proof of lost enqueue, and no automatic repair.
- Ten attempts matches the current D1 delivery policy. Update both the sender and reconciler if that policy changes.
- LIMIT bounds returned anomalies, not database rows scanned or CPU. Correlated webhook checks can scan tables; no hosted throughput or free-tier capacity claim follows from these tests. Larger pilots need query-plan/index and load measurements.
- This does not validate event payload content/signatures, reverse integrity of every webhook row, double-entry balances, all possible corruption, or marketplace fulfillment. Ordinary pending payments without transaction records are outside this succeeded-settlement audit.
- Email alerts remain owner-deferred. Scheduled failure/observability logs do not establish email delivery. Fresh owner login, portable encrypted/off-device backup and secret recovery, hosted capacity and Vercel/TiDB retirement remain separate gates.
- Natural Cron validation is complete for the invocation documented above. Next durability decision: choose the owner-controlled destination/recovery method for portable encrypted backup; do not upload backups or share secrets without an agreed destination.

Git push remains prohibited. Local source commit/recovery bundle are separate from the authorized Testnet Worker deployment.
