# Cloudflare Arc Testnet incident runbook

Scope: the Druto and Luvre Franc **Testnet** Workers and their separate D1
databases. This is an operator procedure for demo funds only. It does not
authorize mainnet settlement, manual `PAID` flags, or database edits.

## Check the evidence

1. Check `/api/ready` on both deployed Workers. A 200 response only confirms
   configured dependencies, not payment correctness.
2. Open the `druto-d1-testnet-reconciler` Worker in Cloudflare Workers Logs and
   Issues. Find the latest *scheduled* invocation and the
   `druto_testnet_reconciliation` report. Record its time, status, counts, and
   exception codes without copying buyer details or secrets into a ticket.
   The scheduled audit covers Druto's ledger and Arc receipt across sellers;
   it does not assert that a marketplace fulfilled an order.
3. For the historical Luvre integration only, run the read-only operator audit:
   `node scripts/reconcile-cloudflare-testnet.mjs`. It reads both remote D1
   databases and Arc Testnet RPC; it does not modify payment state. Preserve
   the `checkedAt`, `status`, counts, and exception codes. This script audits
   at most 100 bound Luvre records; the scheduled Worker stops at 100 succeeded
   Druto payments across sellers. The scheduled report also records pages
   checked and the selected Arc RPC provider. A `PASS` from
   either tool is not proof that arbitrary unreported chain transfers are
   absent.

## Interpret the result

- Scheduled `FAIL` means Druto's payment policy, transaction row, webhook
  delivery, or Arc receipt disagrees. Pause
  new Testnet checkout issuance and investigate before relying on any order's
  fulfillment state. Do not mark an order paid or issue a replacement payment
  link for the same transfer until the transaction and recipient are clear.
- `INCOMPLETE` means the audit could not establish a result, for example D1
  binding/RPC failure or its bounded row limit. Treat it as an unknown state,
  not a clean result. Restore the dependency or expand the audit safely, then
  rerun it.
- `AUDIT_PAYMENT_LIMIT` means more than 100 succeeded payments are eligible
  for the bounded Testnet run. None may be silently omitted from a `PASS`.
  Do not merely raise the cap: measure hosted CPU/RPC usage and design a
  checkpointed or paid-plan audit before increasing the volume.
- `ARC_RPC_HTTP_429` means the primary Arc public RPC rate-limited the hosted
  Cron. The Worker can try Arc's documented dRPC Testnet endpoint only after
  checking that endpoint's chain ID. If the backup also fails, leave the audit
  `INCOMPLETE`; do not infer payment success from a local Wrangler run. Review
  the next natural scheduled report and provision a reliable Arc RPC service
  before any broader pilot.
- The separate Luvre integration script can report `pendingFulfillment > 0`.
  That means payment reconciliation succeeded but marketplace fulfillment has
  not been completed. Do not call these orders shipped or delivered. A
  `PENDING` order is not a failed payment by itself.
- A just-settled payment can have up to 10 minutes of webhook
  grace in the scheduled audit. If the next scheduled run still reports an
  exception, investigate it; do not extend the grace silently.

## Webhook recovery

Inspect the delivery status, attempts, and next-attempt time in Druto before
retrying. The two-minute Druto Cron drains due deliveries; the owner-scoped
dashboard retry path is for a failed delivery that needs operator review.
Never edit `webhookDeliveries`, `processedEvents`, `orders`, or
`fulfillmentOutbox` directly to make the counts match. A successful delivery
is not retryable through the normal claim path. After recovery, verify one
Druto succeeded delivery, one Luvre processed event, one fulfillment outbox
record, and the same intent, order, amount, recipient, and transaction hash.

The isolated D1 receiver test covers a simulated storage outage, concurrent
duplicates, replay, bad signature, changed payload, and wrong amount. A live
receiver interruption/retry drill has **not** been performed. It needs a new
Testnet delivery under a controlled window; never disrupt a real customer
payment to simulate it.

## Rollback and restoration limits

Keep the previous Worker deployment IDs and D1 exports before a traffic
cutover. A Worker rollback changes code, not D1 data or an on-chain transfer.
Do not overwrite either live D1 database or delete an old provider until a
restore drill and cross-system reconciliation have passed. Preserve the Arc
transaction hash and immutable logs as evidence. Escalate any unexplained
recipient/amount mismatch rather than compensating it with a second transfer.

The former Luvre-bound scheduled Cron path and an isolated local D1
export/import drill passed. The generalized Druto-only Cron encountered a
hosted primary RPC 429 on 2026-10-10. Its fallback deployment then returned
one natural scheduled `PASS` at 09:15 UTC, but the aggregate log does not
identify which endpoint answered. Remaining release gates include owner alert delivery, controlled live
webhook failure/replay, fulfillment ownership, durable backup retention and a
timed recovery exercise, plus a documented traffic cutover/rollback. Passing
one 2 USDC Testnet checkout does not satisfy those gates.
