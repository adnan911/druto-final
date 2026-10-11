# D1 checkout concurrency and webhook recovery — 2026-10-11

## Results

**PASS within the local validation scope. No runtime fix or redeployment was required.**

`server/d1-payment-concurrency.test.ts` adds eight tests against the real migration schema and SQL. The adapter uses a single in-memory SQLite database; async barriers force conflicting request interleavings rather than claiming distributed concurrency. Only outbound webhook transport is mocked. No real wallet, RPC or receiver is contacted.

| Scenario | Observed result |
| --- | --- |
| 20 identical requests read a missing idempotency key before insertion | 1 persisted intent; 19 unique-index insert failures recovered to identical persisted responses |
| Same key, concurrent different amounts | Exactly one success and one CONFLICT; stored amount matches winning response |
| Same raw key, two different sellers | Independent intent IDs; cross-seller credential rejected with FORBIDDEN |
| 20 simultaneous send calls while transport is held open | One transport call; 19 lease skips; attempts=1; successful delivery cannot be manually resent |
| Receiver HTTP 503 then recovery | Retry blocked before due time; due-time retry succeeds with identical event ID and payload |
| Lease expires and a new worker claims it | Old completion cannot overwrite newer pending claim; new claimant can finish |
| Receiver accepts event, local acknowledgement SQL aborts | Lease remains pending; after expiry the same event is sent again and acknowledged |
| Ten failed automatic attempts | Automatic drain stops selecting delivery; explicit manual retry can recover it |

Additionally ran the real local Wrangler Worker with D1 persistence and the extended `scripts/smoke-d1-local.mjs`:

- 20 concurrent HTTP checkout requests for a new key all returned the same complete persisted response.
- Two concurrent requests for another key with different amounts returned one HTTP 200 and one HTTP 409.
- Seller reporting showed exactly three pending intents for the three distinct test orders, zero settled payments.
- All **18 local smoke checks passed**, including wallet challenge/replay, seller ownership, API-key authorization/revocation and session revocation/rotation. Generated disposable local identities; no user's wallet or private key was accessed. Final local session logged out, API key revoked, dev server stopped.
- Eight focused SQL tests and full application TypeScript check passed. Whitespace checks passed. No application/runtime dependencies, migrations, frontend assets, SDK archive, hosted data or deployment changed. Full unrelated suites were not repeated solely for test additions.

## Delivery contract and practical limits

The acknowledgement-loss test demonstrates why receivers must handle **at-least-once delivery with bounded retries**. Druto may send the same event again after a receiver has accepted it. Event ID and payload remain stable, but the transport generates a fresh timestamp/signature for each attempt. The lease reduces overlapping sends while valid; it cannot undo a receiver side effect or guarantee exactly-once network delivery.

The receiver must verify the signed raw payload, match seller/amount/asset/network to its authoritative order, and transactionally insert a unique processed-event record with the order transition. External fulfillment requires its own idempotent outbox/operation key. A duplicate already committed event should receive a successful acknowledgement without repeating fulfillment. HTTP 2xx alone is not proof of durable order processing. Existing SDK/receiver integration guidance remains applicable; no Luvre fulfillment feature was added.

The local tests cover selected races and failure windows. They do **not** establish hosted request throughput, response latency under load, behavior across multiple Cloudflare locations, all database outages, or end-to-end marketplace deduplication. No live gateway load test was performed. Existing retry exhaustion still requires operator action, and owner-deferred email alerts remain open.

## Next gates

1. Exercise payment verification/ledger/outbox atomicity under concurrent verification and injected persistence failure using isolated fixtures.
2. Measure hosted capacity only in an isolated Testnet environment with explicit request limits; this work does not justify increasing quotas or opening real-money traffic.
3. Complete owner-controlled fresh-login check and portable encrypted/off-device backup/secret recovery. Preserve deferred email-alert status and pending legacy Vercel/TiDB retirement.

Git push remains prohibited. New tests and evidence are local source changes, not a new production release.
