# Webhook console implementation — 13 November 2026

Source of visual direction: presentations/druto-glass-suite/webhooks.html.
Product reference: dashboard product plan dated 12 November 2026.
Status: implemented locally; not pushed or deployed in this task.

## Demo to working product

| Demo capability | Implemented behavior |
| --- | --- |
| Delivered / queued counters | Database-derived succeeded / pending / failed totals, scoped by authenticated seller ownership and selected endpoint. Counts are independent of log search/status filters. |
| Storefront endpoint | Registered destinations from merchantAccounts.listMine; seller labels, active/paused state, selector and copy. Configuration opens seller setup; no arbitrary resend URL. |
| Signature verification | Clear receiver instruction and documentation link. This is a requirement, not a claim that the receiver has implemented it. |
| Delivery log | Persistent delivery rows, order/event/payment references, attempt count, lease/retry time, status filters, debounced search, stable timestamp+ID cursor pagination. |
| View payload | Authenticated detail read with an explicit allowlist. Buyer email/address, order context, signatures, lastError content and credentials are omitted. This is not the raw signed payload. |
| Replay sample | Actual retry endpoint with confirmation outside DEV preview. Preserves original event ID and payload; sends only to registered endpoint through existing allowlist/transport and fenced lease. Delivered events are skipped. |
| Preview behavior | Isolated fixtures; all mutations, including retryWebhook, rejected without HTTP fallback. |

## Product rules enforced

- Authentication on every console/detail/retry API.
- Owner scoping enforced on the server; admin read scope remains explicit.
- Inactive endpoints cannot retry. Future retry/lease deadlines cannot be bypassed.
- HTTP acknowledgement never means fulfillment, shipment or a new payment.
- No mark-paid override, signing-secret reveal/rotation, destination override or new transfer.
- Retry requests/results emit structured actor/delivery/event audit messages. These
  are Worker logs, not a new immutable database-backed activity journal.
- Main navigation includes Webhooks, Overview links to it, and section query parameters
  preserve navigation on refresh/back. Unsupported billing/payout modules remain absent.
- Same dark/light material, reduced-motion selection surface, responsive detail drawer.
- Mobile log exposes its details action without horizontal scrolling.

## Validation

28 tests passed across:
- server/webhook-console.test.ts (8 new real SQLite/D1 tests);
- server/d1-payment-concurrency.test.ts (8);
- server/webhook-delivery.test.ts (9);
- client/src/dev/dashboardPreviewLink.test.ts (3).

TypeScript, Vite D1 frontend and Wrangler D1 Worker dry-run checks passed.
Worker dry-run compiles API code against existing dist assets; it is not a deployment.
One batched desktop-dark/desktop-light/mobile-light inspection plus one confirmation:
one main heading; no page overflow; visible mobile detail actions; filters, empty
results, safe payload inspection, contained dialog focus and browser back passed.
One static Impeccable scan was run; parsed contrast rules were not part of that scan.
Frontend keeps the existing >500kB bundle-size warning.

## Explicit follow-ups before calling the full product plan complete

- Persist HTTP status and per-attempt response metadata if a full response timeline is required.
  Current UI correctly says that HTTP response is not retained.
- Database-backed immutable action history and retention policy; current retry trace uses logs.
- Endpoint pause/edit and signing-key rotation need dedicated reviewed API/lifecycle design.
- Real signed synthetic test-event flow is separate; do not fake its success.
- A signed-in hosted smoke test after an intentional release; no real customer
  webhook was triggered during this implementation.
- Existing paused security-audit findings and SDK/starter version drift remain separate.

No audit reports/progress deleted or rewritten. No migration or remote data change.