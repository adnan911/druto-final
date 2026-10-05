# Druto remediation checklist

Initial review: 26 September 2026. Checklist/code review: 4 October 2026 (Asia/Dhaka). Findings F01–F18 refer to `DRUTO_DEEP_REVIEW_2026-09-26.md` in this directory. Checked boxes indicate bounded local implementation with recorded validation, not deployment. A successful build or testnet payment does not close an entire gate.

Milestone evidence: `SECURITY_MILESTONE_1.md`, `TIDB_SETUP_STATUS.md`, `SELLER_OWNERSHIP_MILESTONE.md`, `PAYMENT_SETTLEMENT_MILESTONE.md`, `WEBHOOK_OUTBOX_MILESTONE.md`, `LUVRE_PERSISTENCE_MILESTONE_2026-09-29.md`, and `API_BOUNDARIES_MILESTONE_2026-10-04.md`. Partial items remain unchecked. Historical milestone text describes its implementation date; later evidence below supersedes earlier next-step lists.

## Review verdict and evidence boundaries — 4 October 2026

**Not ready for a production release.** The checklist's major risk categories remain appropriate, but its previous version omitted completed Luvre work, conflated the real marketplace with the downloadable starter, and referenced the wrong migration acceptance criterion for the new database.

The initial checklist review inspected local source and prior evidence without rerunning checks. The subsequent first-work milestone implemented and tested the API boundaries described below, including isolated TiDB fixtures. It did not inspect current hosted deployments, query the real seller's current state or revalidate provider/legal availability. Historical seller/deployment observations remain dated evidence.

| Component | Recorded completion / current source evidence | What remains open |
| --- | --- | --- |
| Druto identity and EOA receiving-wallet proof | Local auth bypass removal, ordinary-user defaults, owner-scoped EOA challenge/verification | Deployed identity/session audit, all-tenant coverage, Circle/smart accounts, destination changes |
| Druto settlement | Local immutable success, SQL locking/unique hash and atomic endpoint outbox; prior real TiDB scenarios | Explicit fee/payment-mode policy, attempts/indexer/exceptions, current deployment and actual-wallet E2E |
| Druto webhook delivery | Local bounded worker, leases/fencing/retries; prior real SQL with mocked HTTP | Hosted scheduling, queue visibility/alerts, full SSRF protection and historical missing-event recovery |
| Luvre marketplace | Local persisted catalog-priced orders, durable intent binding, strict event checks, transactional event/payment/fulfillment record | Persistence release/cutover, buyer recovery, actual fulfillment worker and hosted crash recovery |
| Downloadable starter/SDK | Separate source and distribution paths | Port/validate durable consumer and trusted pricing; Luvre fixes do not fix the starter automatically |
| Databases and release | Separate druto_testnet/luvre_testnet and restricted app identities verified in earlier work | Deployment identity, guarded forward migrations, rollback/restore and deterministic build entry points |

Last recorded Luvre validation (29 September): 48 marketplace tests, 9 real TiDB scenarios, 6 receiver regressions, type checking, production build and local smoke passed. These numbers are historical evidence for that revision. Earlier Druto audit suites also contain tests that intentionally reproduce unresolved flaws; a green audit suite is not a clean security assessment.

Read-only seller recheck (4 October): ma_1p46Apa-Kpt2, luvre-franc / luvre-seller-1 and the supplied receiving wallet still match the old test database. Status is active but walletVerifiedAt remains empty; the account is absent from druto_testnet. Complete authenticated onboarding/ownership proof in the target environment. Never copy an active flag as proof or mix old credentials with a newly created account. See LUVRE_SELLER_PREFLIGHT_2026-10-04.md.

Later on 4 October, fresh seller `ma_4uguzltzDSiU` was created in `druto_testnet` and the owner completed one wallet-ownership challenge. Read-only verification confirmed `active`, non-null `walletVerifiedAt`, the expected receiving address and consumed challenge. Seller-linked API key, webhook endpoint and payment intent are still absent; no live order/payment test has run. See LUVRE_SELLER_PREFLIGHT_2026-10-04.md for the incident and verification.

Last recorded release evidence: Luvre containment PR #1 was merged and its production smoke passed. Luvre persistence and the Druto remediation/outbox release were not deployed in that milestone. Capture fresh deployed SHAs/configuration before any release decision.

## Immediate work order and acceptance criteria

All rows below are release gates for the applicable integration; this is an implementation sequence, not permission to release after the first two fixes.

| Priority / task | Evidence for keeping it open | Acceptance evidence |
| --- | --- | --- |
| P1 — Public intent privacy (local complete; release pending) | Explicit public allowlist, owner/operator-only private route, private/no-store headers and updated receipt/dashboard clients implemented | Local redaction/authorization tests and build passed; verify deployed API/client together. Public itemName/returnUrl must not contain merchant-supplied PII |
| P1 — Amount/idempotency boundaries (local complete; rollout pending) | Positive bounded integer amounts; scoped v2 digest in existing unique column; conflicting retries rejected; same-tenant legacy replay preserved | 7 real TiDB intent scenarios plus expanded authenticated router scenario passed. Set business cap; drain old raw-key writers before deploying scoped writers; no DDL required for this implementation |
| P1 — Operational database fallback (local complete; release pending) | Unsafe memory adapter still exists for explicit tests, but `getDb()` no longer selects it for auth/payment routes | Missing DATABASE_URL fails closed in local regression test; verify deployed configuration and real SQL connectivity/tenant isolation before release |
| P1 — Payment mode and fee integrity (direct MVP local complete; release pending) | New intents now quote 0% with full seller payout and no split address; verifier blocks direct settlement against historical split quotes | Real TiDB intent/response test and receipt tests passed; verify actual wallet transaction and seller balance, manually review already-sent transfers on old links, keep split mode disabled until contract gates pass |
| P1 — Release identity and schema | vercel.json still uses --no-frozen-lockfile; db:push still selects the old migration path; target seller was not verified in the new database | Fresh deployed revision/configuration inventory, correct limited app identity, reviewed forward migration/rollback, verified seller plus matching API key/webhook endpoint credentials |
| P1 — Delivery and fulfillment recovery | Local worker is not an operating scheduler; Luvre has one durable fulfillment record, no external fulfillment worker | Working API/worker/receiver together, alerts for oldest/exhausted work, retry after receiver interruption/ack loss, downstream idempotency and evidence of no duplicate external effect |
| P2 — Starter/distribution parity | starter-templates/nextjs/app/api/webhooks/druto/route.ts still logs and returns 2xx with persistence only in comments | Executable trusted-order/SQL consumer sample, wrong-field/duplicate/crash tests, test the actual downloadable artifact; block production claims until satisfied |

Privacy/amount/idempotency fixes are implemented locally; see API_BOUNDARIES_MILESTONE_2026-10-04.md for contract changes, tests and cutover restrictions. Seller signatures require the wallet holder during onboarding, after the authenticated target environment is ready. Circle seller login/wallet support remains a separate unimplemented requirement; EOA test coverage does not satisfy it.

## Gate 0 — Contain exposure and preserve evidence

- [ ] Keep Druto testnet-only. If the reviewed code is public, restrict administrative access until F01 is fixed.
- [ ] Snapshot the current source, deployed commit/build, database schema and data before changes.
- [ ] Preserve the successful marketplace order ID, Payment Intent ID, transaction hash, chain ID, receiving wallet, and webhook event ID.
- [ ] Determine whether the deployed service uses durable MySQL, not the memory fallback.
- [ ] Check existing admin accounts, seller receiving-address changes, and webhook destinations for unexpected entries. The audit found capability for abuse, not evidence that abuse happened.
- [ ] Do not run reset.js, deploy-splitter.ts, or the permissive migration runner during investigation.

**Done when:** the deployed version and evidence are identified and public admin creation cannot be used.

## Gate 1 — Identity, ownership, and tenant isolation (first implementation work)

- [x] Remove public directAccountLogin from deployable routes; remove matching UI bypasses.
- [x] Default wallet/Privy users to ordinary users. Provision operators explicitly.
- [ ] Remove unintended existing admin roles; revoke affected sessions safely.
- [ ] Add marketplace membership and roles; do not treat a caller-supplied marketplaceId as ownership.
- [x] Enforce matching marketplace/seller/merchant-account scope for the implemented seller create-intent API-key path; reject unlinked/revoked keys (local).
- [ ] Extend scope/environment enforcement to every key type and operation; complete platform-role semantics and cross-tenant negative coverage.
- [x] Require a seller-scoped API key for every production intent; keep the legacy demo fallback outside production (local, deployment pending).
- [x] Implement owner-scoped receiving-wallet verification separately from login identity (EOA path; this does not verify the user's historical seller or implement Circle/smart accounts).
- [x] Block receiving-address replacement and disabled-seller self-reactivation in current registration/verification paths.
- [ ] Implement an authorized destination-change workflow with step-up verification, audit history and disabled-status preservation.
- [x] Implement origin/purpose/chain/account-bound expiring seller receiving-wallet challenges with locked, conditional single-use consumption.
- [ ] Apply and verify challenge binding/atomic consumption across every login/linking flow, including concurrent independent-session tests; receiving-wallet proof alone does not close this gate.
- [x] Minimize public checkout responses with an explicit allowlist; move private buyer/order details to owner/operator-authorized lookup and update clients (local; merchant-supplied public labels/URLs must not contain PII).
- [ ] Add a tenant A versus tenant B negative-test matrix for every read and mutation.

**Done when:** anonymous callers cannot become operators; tenant A cannot read, create for, alter, or register webhooks for tenant B; a disabled seller cannot reactivate itself.

## Gate 2 — Make paid mean exactly the intended order was paid

- [x] Reject missing production DATABASE_URL and prevent production initialization from falling back to the memory database; require explicit production session signing configuration.
- [ ] Add readiness probes for actual DB/schema connectivity and signing/encryption configuration. Lazy pool creation is not evidence of a reachable database.
- [ ] Separate isolated demo fixtures from real integration environments.
- [x] Remove amount-only sync crediting and disable unsafe legacy reassignment.
- [ ] Put unmatched chain movements in a durable exception queue.
- [ ] Choose direct-payment demo versus order-bound router production design explicitly.
- [ ] Bind chain, contract version, order/payment ID, amount, fee, treasury, seller, and expiry to an authorized payment instruction.
- [ ] Enforce one-time payment identity onchain where the router design uses it.
- [ ] Separate Druto broadcast/verification PaymentAttempt records from Payment and Settlement records. Luvre's intent-creation attempts do not replace chain-payment attempts.
- [x] Make succeeded state immutable against new/failed verification requests.
- [x] Use real database transactions and locking reads for settlement; verify races on TiDB.
- [x] Persist endpoint delivery outbox rows in the settlement transaction (same control as Gate 3, not an additional independent guarantee).
- [x] Protect accepted Druto settlement against competing intent/hash retries using SQL locks/unique identity; validate with recorded real TiDB concurrency scenarios.
- [ ] Reconcile extra/unmatched payments without duplicate fulfillment or silently inflated revenue; add audited exception handling and external fulfillment idempotency.
- [x] Enforce positive bounded atomic amounts in Druto itself with integer arithmetic and schema/converter tests; current technical limit is 0.000001–1,000,000 USDC.
- [x] Scope Druto create-intent idempotency to tenant/environment/operation using a versioned digest inside the existing unique column; validate concurrent requests and safe same-tenant legacy replay on real TiDB (no DDL needed).
- [ ] Agree the pilot/business amount cap and coordinate all intent writers onto the scoped-key version; mixed old/new creation writers are not safe.
- [x] Enforce block-time checkout boundaries; accept delayed verification of a timely mined transfer.
- [ ] Implement the exception/refund workflow for transfers mined outside that window.
- [ ] Build a durable receipt watcher/indexer with persisted progress and restart/backfill support.
- [ ] Distinguish unknown/pending, reverted, and provider-unavailable outcomes.
- [ ] Complete the combined wrong recipient/token/time window, same-price order and parallel-payment matrix. Existing mocked-RPC proof tests and real settlement SQL tests are complementary evidence; also validate the actual Arc/HTTP/SQL path.

**Done when:** a wrong/old/unrelated transaction cannot fulfill an order; retry/restart/concurrency cannot undo or duplicate one correct settlement.

## Gate 3 — Contract, fees, webhooks, and marketplace fulfillment

- [ ] Add pinned Solidity compiler/settings and executable contract unit/fuzz/invariant tests.
- [ ] Restrict accepted token and enforce the signed fee/destination/expiry policy in the contract.
- [ ] Define pause, treasury changes, owner transfer, signing-key rotation, and mistaken-transfer behavior.
- [ ] Verify deployed runtime bytecode against reproducible build output; existence of bytecode is insufficient.
- [ ] Run approval, payment, failure, repeated intent, and seller/treasury balance-delta tests on Arc Testnet.
- [x] For the direct-payment MVP, quote 0% and full seller payout, block old split-quoted links in checkout, and reject direct-transfer fallback for split intents (local; see DIRECT_ZERO_FEE_MVP_2026-10-04.md).
- [ ] Independently verify an actual buyer-to-seller Arc Testnet payment, including exact recipient/amount, wallet signature, persisted zero fee and no duplicate fulfillment.
- [ ] Complete contract verification and separate launch decision before enabling future split-fee intents.
- [x] Persist webhook events for active seller endpoints in the same transaction as payment success.
- [x] Implement an independent bounded worker with leases, fenced updates, capped retries and authenticated manual retry.
- [ ] Configure eligible worker hosting/scheduling and add delivery monitoring/review UI.
- [ ] Block webhook SSRF/private IPs/DNS rebinding; handle redirects safely.
- [x] Use a dedicated webhook encryption key, independent of JWT/session rotation, and fail Production readiness when it is missing (local draft branch).
- [ ] Add reviewed webhook key rotation and legacy ciphertext migration before rotating the dedicated key.
- [ ] Replace starter client-supplied pricing with authorized order lookup and server-calculated amounts.
- [ ] Implement starter event deduplication and order settlement transaction in a real sample database.
- [x] Implement Luvre server-catalog pricing and immutable SQL orders before provider calls; bind expected intent before redirect (local, separate marketplace repo).
- [x] Implement Luvre strict signed-event matching for order/intent/amount/asset/network/marketplace/seller/account/wallet before SQL settlement (local).
- [x] Atomically record Luvre event deduplication, immutable payment and one fulfillment-outbox row; real TiDB duplicate/concurrent/rollback scenarios recorded.
- [ ] Port equivalent expected-value checks and persistence to the downloadable starter; do not accept/log an event as fulfillment.
- [ ] Implement the actual marketplace fulfillment worker and downstream idempotency; one outbox row alone does not ship goods or reserve inventory.
- [x] Verify receiver 500 recovery and stale-worker recovery using real SQL with mocked HTTP.
- [ ] Verify hosted receiver timeout/crash recovery end to end without another buyer payment.

**Done when:** actual fees match quoted fees; settled state and fulfillment work survive interruption; duplicate delivery cannot produce a second accepted order settlement or external fulfillment effect. Delivery remains at-least-once with bounded retries; demonstrate downstream idempotency rather than claiming exactly-once network delivery.

## Gate 4 — Reporting, refunds, and buyer experience

- [ ] Rename historical payment volume; remove fictitious available/ready-to-settle balances.
- [ ] Report gross, platform fee, net external settlement, refunds, and unmatched amounts separately.
- [ ] Build an append-only operational journal and daily reconciliation exception report.
- [ ] Generate chart data from real timestamps; remove the fixed SVG activity curve.
- [ ] Implement seller-authorized full/partial refunds and specify who refunds fees.
- [ ] Bind refund destination to verified payer authorization; do not assume tx sender always equals buyer.
- [ ] Keep amounts in integer arithmetic and define display rounding.
- [ ] Finish server-side submitted-attempt recovery and reconciliation after browser close. Druto localStorage recovery is partial; Luvre's checkout key is not yet durable across a full buyer reload.
- [ ] Chain-check balance reads and distinguish provider error from zero balance.
- [ ] Include gas in affordability and total-cost display; do not promise free gas.
- [ ] Certify supported desktop/mobile wallets; do not advertise any EVM wallet without testing.
- [ ] Make QR/payment-link behavior explicit and test it, including manual/unmatched transfers.
- [ ] Label risk/compliance/ownership capabilities honestly until the actual controls exist.

**Done when:** dashboard totals agree with evidence, the buyer can recover from interruption without duplicate payment, and refund responsibility is actionable.

## Gate 5 — Reproducible releases and independent production assessment

- [ ] Use a supported pinned Node version across local/CI/hosting (29 September builds reported local 22.11 below the build tool requirement; recheck the actual runtime before pinning).
- [ ] Freeze lockfile installs and run a dependency advisory/license review.
- [x] Establish isolated druto_testnet and luvre_testnet baselines with separate restricted app identities and migration credentials (recorded TiDB verification; not evidence of deployed configuration).
- [ ] Establish one authoritative forward-migration path per database; fail on errors and test both fresh and supported upgrade states. Bootstrap/recovery scripts are not general deployment migrators.
- [ ] Verify deployed schema/constraints and ledger against the approved lineage: drizzle-tidb / __druto_tidb_migrations for druto_testnet, and Luvre migrations / __luvre_migrations for luvre_testnet. Preserve old test history; do not run legacy db:push or require a legacy 0013 ledger row in the new baseline merely by filename.
- [ ] Add CI for root app, standalone starter, package artifacts, real DB integration, and Solidity.
- [ ] Build/test the actual downloadable SDK/starter ZIP; retire stale competing packages.
- [ ] Fix quickstart transport setup, missing routes, and unsupported ownership/compliance claims.
- [ ] Separate test/live databases, credentials, contracts, and immutable network configuration.
- [ ] Add gateway-wide rate/request-size limits, audit logs, secrets redaction and CSRF/origin controls. Luvre currently has bounded request bodies, generic API errors and a browser-origin check; these are not gateway-wide controls or rate limiting.
- [ ] Add readiness checks and alerts for DB failures, RPC disagreement, indexer lag, unmatched funds, and webhook backlog.
- [ ] Perform backup/restore, outage, key-compromise, and rollback drills.
- [ ] Assign a human incident responder and customer complaint/refund owner.
- [ ] Obtain independent contract/backend security review and resolve high findings.
- [ ] Resolve operating entity, Bangladesh restrictions, target-country permissions, and seller verification/sanctions process with qualified advice.
- [ ] Run a capped pilot with explicit limits; evaluate mainnet only after every applicable gate closes.

## Evidence required to validate the successful marketplace transaction

| Evidence | Pass condition |
| --- | --- |
| Chain receipt | Correct chain, successful receipt, actual USDC contract and recipient, amount, block/time |
| Transfer path | Explicitly identify direct transfer versus splitter execution; verify fee/recipient deltas if split |
| Intent | Matches trusted marketplace order, amount and seller, with creation/expiry policy satisfied |
| Druto database | One accepted settlement for the intent; expected schema; persists after process restart |
| Signed webhook | Correct signature/version/event ID and durable delivery record |
| Marketplace database | Correct order paid exactly once with expected seller/amount/asset/network; not merely a logged webhook |
| Isolation | A second seller cannot access/alter the first seller's data or create orders under its credentials |
| Recovery | Browser close, receiver timeout, duplicate delivery and server restart recover without extra payment or fulfillment |

A screenshot of Druto's dashboard covers none of these gates by itself. The existing working transfer is valuable evidence to preserve and replay after repairs.

## Implementation sequencing and tradeoffs

| Work package | Benefit | Difficulty | Dependencies | Regression risk to test |
| --- | --- | --- | --- | --- |
| Auth and tenant boundaries | Prevents operator takeover and seller redirection | Medium-high | Explicit operator identity and marketplace roles | Existing login/account linking and integrations may need migration |
| Payment state and journal | Makes payment/settlement/reporting consistent | High | Durable DB, attribution model | Historic records must be reconciled, not blindly relabeled |
| Router hardening | Order-bound settlement with enforceable fees | High, security-critical | Contract design, executable tests, independent review | Changing contracts requires versioned intents and old-contract policy |
| Outbox and fulfillment | Recovers from delivery failures without lost orders | Medium-high | Atomic DB writes and worker hosting | Replay can duplicate fulfillment unless consumer is transactional |
| Reporting/refunds | Makes the product operationally usable | Medium-high | Settlement journal and seller authorization | Gross-versus-net and fee refund policy need explicit rules |
| Release and operations | Reduces configuration drift and recovery time | Medium-high | Hosting, monitoring, backup and human ownership | Environment mix-ups and schema incompatibility |

**Recommended next milestone:** complete remaining authentication/tenant isolation and deployment evidence, then resolve payment-mode/fee policy and target-environment identity before a coordinated API/worker/marketplace release. Public-intent privacy and amount/idempotency boundaries are now locally implemented and tested; their rollout restrictions still apply. Complete actual-wallet E2E/recovery acceptance afterward. Luvre persistence is also locally implemented; deployment, starter parity and external fulfillment remain distinct tasks. No complete production gate is closed by these local milestones.
