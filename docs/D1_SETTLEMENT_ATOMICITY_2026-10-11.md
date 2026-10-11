# D1 settlement atomicity and replay — 2026-10-11

## Result

**11 focused tests passed; full application TypeScript check passed. No runtime fix, schema change or deployment.**

`server/d1-settlement-concurrency.test.ts` invokes the actual D1 `payments.verifyTransfer` router, event builder, atomic batch helper and migration triggers/indexes against in-memory SQLite. A barrier holds synthetic chain verification until every competing request has read its intent. Each batch executes synchronously within a real BEGIN/COMMIT transaction; failure rolls back both statements and trigger effects. This models conflicting application interleavings and atomic SQLite behavior, not distributed Cloudflare load.

| Scenario | Observed result |
| --- | --- |
| 20 concurrent submissions of the same intent/hash | All return identical success; one transaction record, 19 competing batch failures safely recovered through durable state |
| Fan-out to seller endpoints | Two active seller endpoints each get one pending delivery with the same event ID; inactive and other-seller endpoints excluded |
| Later replay, including uppercase hash digits | Same response, no additional chain verification, no persistence changes |
| Same transaction hash submitted for two different intents | One winner, one CONFLICT; losing intent stays unpaid and has no outbox delivery |
| Two different hashes submitted for one intent | One winner, one CONFLICT; later losing-hash retry cannot overwrite winner |
| Second outbox row insert aborts after first was inserted | Entire batch rolls back: original intent restored, no transaction, no partial outbox; retry after removing fault succeeds |
| Transaction record insertion aborts | Intent and outbox unchanged; retry after removing fault succeeds |
| Batch commits but acknowledgement is lost | Router reads committed state and returns success; subsequent replay creates no duplicate |
| Artificially corrupted succeeded intent with missing transaction | CONFLICT / ledger review required; no false success or write |
| No active webhook subscription | Payment succeeds with one transaction and zero deliveries, as intended; no retroactive subscription/backfill is implied |
| Verifier rejects an unmatched transfer | BAD_REQUEST, no persistence change |
| Verifier throws an unknown RPC error | SERVICE_UNAVAILABLE, no persistence change |
| Intent amount changes during verification | Database trigger rejects stale settlement; changed pending intent remains, no transaction/outbox |

Multiple assertions share tests; the suite total is eleven. The initial test run had one incorrect fixture expectation: an abbreviated verifier error is intentionally sanitized to SERVICE_UNAVAILABLE. The fixture now uses the actual recognized unmatched-transfer message and separately tests unknown upstream failures. No application behavior was changed to make it pass.

## Boundaries

- Chain evidence is mocked. These tests do not validate Arc RPC finality, receipt decoding, payment-window checks, payer signatures or actual wallet transfers. No live RPC, wallet, remote database or webhook receiver is contacted.
- Transaction and outbox writes use the current real SQL, not mocked query return values. The adapter remains local SQLite, not the hosted D1 service; it does not prove cross-region consistency, hosted capacity or all outage behavior.
- With active subscriptions, outbox insertion failure cannot leave a successful intent behind in the tested flow. With no subscriptions, zero outbox rows is intentional.
- The transaction table records direct settlement; this is not a double-entry balance ledger. Covered application paths preserve a successful record on retry; this does not establish database-wide immutability against privileged SQL UPDATE/DELETE or every possible corruption.
- Webhook network delivery remains at-least-once with bounded retries. Atomic enqueue does not make marketplace fulfillment exactly-once. See [checkout/webhook recovery](D1_CHECKOUT_WEBHOOK_CONCURRENCY_2026-10-11.md).
- Existing persistence failures return CONFLICT with refresh guidance. This check confirms no false success; it does not introduce fine-grained public database outage codes or new diagnostics.

## Next

Review read-only reconciliation against deliberately inconsistent local fixtures: intent/transaction mismatch, missing subscribed outbox, and exhausted delivery retries. Confirm which anomalies are detected and how an operator recovers without resending funds or duplicating events. Prefer improving existing reconciliation and operator guidance before adding another service.

Hosted capacity, portable/off-device encrypted backup with secret recovery, owner-controlled fresh dashboard login, deferred account-email alerts and Vercel/TiDB retirement remain separate open gates. Current hosted version remains `499a5902-a3b9-475c-8015-f40f4805359f`. No Git push, deployment, migration or hosted mutation occurred for this test-only change.
