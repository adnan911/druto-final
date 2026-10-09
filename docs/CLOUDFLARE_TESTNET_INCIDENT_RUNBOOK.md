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
3. From the Druto feature checkout, run the read-only operator audit:
   `node scripts/reconcile-cloudflare-testnet.mjs`. It reads both remote D1
   databases and Arc Testnet RPC; it does not modify payment state. Preserve
   the `checkedAt`, `status`, counts, and exception codes. This script audits
   at most 100 bound records; the scheduled Worker stops at 20. A `PASS` from
   either tool is not proof that arbitrary unreported chain transfers are
   absent.

## Interpret the result

- `FAIL` means a payment, marketplace record, or Arc receipt disagrees. Pause
  new Testnet checkout issuance and investigate before relying on any order's
  fulfillment state. Do not mark an order paid or issue a replacement payment
  link for the same transfer until the transaction and recipient are clear.
- `INCOMPLETE` means the audit could not establish a result, for example D1
  binding/RPC failure or its bounded row limit. Treat it as an unknown state,
  not a clean result. Restore the dependency or expand the audit safely, then
  rerun it.
- `PASS` with `pendingFulfillment > 0` means payment reconciliation succeeded
  but marketplace fulfillment has not been completed. Do not call these orders
  shipped or delivered. A `PENDING` order is not a failed payment by itself.
- A just-settled payment can have up to 10 minutes of cross-system webhook
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

Current release gates: verified real scheduled Cron run, owner alert delivery,
controlled live webhook failure/replay, fulfillment ownership, backup/restore
drill, and a documented traffic cutover/rollback. Passing one 2 USDC Testnet
checkout does not satisfy those gates.
