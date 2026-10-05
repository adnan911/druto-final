# Payment verification and settlement milestone

Status: local implementation and scoped verification complete, 29 September 2026. Not deployed. This is testnet hardening, not production certification.

Follow-up: WEBHOOK_OUTBOX_MILESTONE.md now supersedes the post-commit dispatch limitation below. Events are queued atomically; an independent worker is implemented and tested, but hosting is not activated. The remaining-blocker list below records this milestone's original handoff.

## Implemented behavior

- Direct USDC transfers require a payer signature binding the Druto origin, Arc chain, intent ID, transaction hash, recipient and atomic amount. A publicly visible receipt alone can no longer claim a direct payment for an unrelated order. The current signature path supports EOA wallets; Circle and smart-account compatibility are not established.
- Receipt verification checks successful execution, the configured chain, token, recipient, exact amount and block timestamp. A transfer mined before the checkout window or after expiry is rejected. A timely mined transfer may be verified after the checkout expires. The creation boundary is rounded down to the block timestamp's second precision.
- Split events must match the intent, seller, token, amount and expected fee arithmetic. Direct transfers record zero platform fee and full seller receipt. Contract treasury pinning and enforceable signed instructions remain outstanding.
- Settlement locks the intent and uses current locking reads for transaction attribution. Transaction insertion and successful intent state commit together. One hash cannot settle two intents; two competing hashes cannot both settle one intent through this service. Identical successful retries return the existing settlement.
- Invalid proofs, reverted receipts and RPC failures do not mutate the durable payment state. A successful intent cannot be overwritten by another hash.
- Dashboard sync no longer matches payments by amount through ArcScan. It attempts bounded verification of explicit stored hashes; unresolved cases require review. Legacy payment reassignment is disabled.
- Checkout saves the broadcast hash in browser localStorage before requesting the confirmation signature. Retrying after a rejected signature or a reload reuses that hash. This is partial browser recovery, not a durable payment-attempt system.

## Verification evidence

- Ordinary Vitest suite: 101 passed, 1 skipped across 26 files.
- Security audit suite: 14 passed. Some tests intentionally characterize unresolved findings; green results do not mean all findings are fixed.
- Real TiDB router integration: one scenario passed, using the limited application identity and rollback cleanup.
- Real TiDB settlement concurrency: four scenarios passed using independent SQL connections: competing hashes on one intent, one hash on competing intents, identical concurrent retries plus immutable success, and unchanged state after RPC failure.
- The concurrency tests mock Arc verification and webhook dispatch, but execute real SQL transactions. Synthetic committed rows were cleaned up with narrowly scoped administrative deletes; the old `test` database was not modified.
- Receipt/proof unit tests use mocked RPC responses and actual cryptographic signatures. These are not live Arc payments.
- TypeScript, frontend build and API bundle generation passed. Final TypeScript recheck and both rebuilt API handler smoke tests passed on 29 September 2026. Handler smoke tests cover JSON health and anonymous auth responses, not the full payment HTTP flow. The test environment logged missing OAuth configuration; OAuth was not validated.
- Frontend build retains warnings for Node 22.11 compatibility and a large JavaScript bundle. These remain release tasks.

## Migration and rollout

This milestone changes no database schema. It relies on the existing unique transaction-hash constraint and transactional SQL backend. The dedicated TiDB baseline and limited app credentials were validated separately; default application environment and Vercel have not been switched.

The direct-payment verification API now requires `payerSignature` for an unsettled direct transfer. The field remains optional in the transport schema because a valid order-bound splitter receipt follows a different verification path. Existing direct-payment clients must implement the signature step; do not roll out only the backend. Older receipts outside the checkout window require an explicit, audited exception process, not automatic reassignment.

## Remaining release blockers and next work

1. **Durable webhook outbox and worker:** dispatch currently occurs after settlement commit. A crash in that gap can lose notification; retrying an already successful payment does not repair it. Persist the event atomically with settlement, then deliver with leases, retries and replay. Benefit: recoverable marketplace fulfillment. Difficulty: medium-high; depends on a forward migration and worker hosting. Risk: duplicate delivery requires transactional consumer deduplication.
2. **Webhook SSRF and checkout privacy:** validate network destinations at connection time, block private/reserved networks and unsafe redirects; return a minimal public checkout DTO. Benefit: protects infrastructure and buyer information. Difficulty: medium-high; DNS behavior and API compatibility need tests.
3. **Input and tenant controls:** positive bounded atomic amounts, comprehensive tenant tests, rate limits and structured provider/reverted/pending errors remain necessary. Benefit: prevents invalid orders and abuse. Difficulty: medium; existing integrations may need changes.
4. **Payment attempts and recovery:** persist submitted attempts server-side, add a receipt watcher and an exception queue for extra, late or unmatched funds. Browser storage can be lost and a reverted hash currently needs a deliberate replacement flow. Benefit: recovery after browser/server failure. Difficulty: high; depends on verified attempt attribution. Risk: accidental duplicate payment if retry instructions are ambiguous.
5. **Explicit payment mode and contract policy:** pin contract/treasury versions, remove unintended direct fallback for fee-enforced intents, and test the deployed contract and balance deltas. Current direct settlement can record zero fee even if an intent initially quoted a fee. Benefit: predictable fees and order binding. Difficulty: high; independent contract review needed.
6. **Staging end-to-end acceptance:** browser wallet approval, rejection/reload retry, actual Arc receipt, DB reconnect, signed webhook and marketplace order fulfillment must be tested together. No live funds were sent in this milestone. Circle, QR, mobile and smart-account support are not verified.

Mainnet availability, jurisdictions and compliance require separate current official-source verification and qualified assessment. Nothing in these local tests establishes them.
