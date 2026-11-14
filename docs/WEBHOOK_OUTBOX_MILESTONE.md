# Durable webhook outbox — 29 September 2026

Local implementation complete; hosted delivery is not activated. No deployment, provider signup or live webhook was performed.

## Hosting decision: Vercel Hobby

Official documentation checked on 29 September 2026:

- Hobby Cron has a minimum interval of once per day and imprecise execution within its scheduled hour: [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing).
- Hobby is for personal, non-commercial use: [Vercel Hobby](https://vercel.com/docs/plans/hobby).

Assessment: daily scheduling cannot provide prompt marketplace recovery. Do not describe a daily cron as a reliable low-latency payment worker. Non-commercial eligibility must also be established; using testnet does not automatically establish it. Commercial launch requires hosting whose terms allow the intended use. No paid upgrade or external scheduler has been selected.

The worker is portable Node code, so development can proceed without buying hosting. Running it locally is useful for testing; it is not an always-on service. No cron was added to `vercel.json`. The later review branch contains a disabled-by-default, token-protected HTTP drain route for an external scheduler; it is not activated in Production.

## What changed

1. `enqueuePaymentVerified` writes endpoint-specific immutable payloads into existing `webhookDeliveries` rows inside the same SQL transaction as payment success and transaction attribution. Any insertion error aborts the entire transaction. No HTTP, signing or secret decryption occurs inside settlement.
2. The outbox snapshots active seller endpoints at settlement time. No endpoint means no delivery record; this does not backfill subscriptions added later or repair historical payments missing events. Already successful payments do not regenerate payloads.
3. Worker claims lock a delivery row, increment `attempts`, and reserve it for 60 seconds through `nextAttemptAt`. Network requests happen after releasing the SQL transaction. The monotonically increasing attempt number fences the final update, preventing a stale worker from replacing a newer result.
4. HTTP attempts time out after 10 seconds. Failures retain the payload and use exponential retry deadlines. Automatic processing stops at 10 claims, including claims interrupted by crashes. The authenticated seller/operator retry route may make one additional attempt after a lease/retry deadline; it does not reset the fencing counter or bypass tenant authorization.
5. `drainWebhookOutbox` selects at most three eligible rows per invocation. An independent scheduler or supervisor must invoke it repeatedly. Retry deadlines are eligibility times, not a delivery latency guarantee.
6. The sender signs the unchanged payload with a fresh timestamp each attempt. The legacy `signature` column is left empty for new queued rows; it is not used as the wire signature. Event identity is stable across attempts.
7. Sending fails closed unless the destination HTTPS origin is present in operator-controlled `DRUTO_WEBHOOK_ALLOWED_ORIGINS`. Embedded URL credentials and redirects are rejected. Later draft-branch work adds DNS/IP-pinned HTTPS delivery with public-address classification; endpoint-domain ownership and hosted validation remain open.

## Draft-branch Cloudflare Cron adapter — 5 October 2026

The draft branch adds `POST /api/internal/webhook-outbox/drain`. It is unavailable without a separate 32-byte random `DRUTO_OUTBOX_DRAIN_TOKEN` encoded as 64 hex characters. The handler compares Bearer credentials with `timingSafeEqual` before database work, checks database/key/origin readiness, and drains at most two deliveries per call to leave time within the configured 60-second Vercel function duration. It returns aggregate counts only; a failed delivery stays in the existing retry state. The endpoint is intended for a scheduler, not a marketplace or browser SDK.

`workers/webhook-cron` is a minimal Cloudflare scheduled handler. Its public HTTP handler always returns 404. Each UTC-minute cron invocation sends one authenticated HTTPS POST to an exact configured Druto URL, rejects redirects, stops waiting after 45 seconds, and fails its own invocation on HTTP or delivery errors so the operator can inspect Cron Events/Logs. It holds no TiDB or webhook-encryption credentials. Cloudflare's Workers Free limits and Cron behavior must be evaluated against measured usage and availability; a free tier does not promise a payment SLA. [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/).

Activation sequence for an isolated **Preview test only**:

1. Generate one new random 32-byte token locally. Save it as a Secret in both the Druto Vercel Preview branch (`DRUTO_OUTBOX_DRAIN_TOKEN`) and the Cloudflare Worker (`DRUTO_OUTBOX_DRAIN_TOKEN`); never add it to source, a query string, or chat.
2. Set Cloudflare `DRUTO_DRAIN_URL` to the exact branch Preview HTTPS URL ending in `/api/internal/webhook-outbox/drain`. If Vercel Deployment Protection blocks the request, use a separate project-level Automation Bypass secret in the Cloudflare secret `VERCEL_AUTOMATION_BYPASS_SECRET`; that bypass grants access to protected deployments and must be treated as sensitive. Do not turn off Preview protection to make the cron work. [Vercel Protection Bypass for Automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).
3. Deploy the Worker only after both secrets and URL are checked, then inspect at least two Cron invocations and Vercel request logs. Verify `selected=0` while the queue is empty, then use a controlled receiver failure/recovery fixture and confirm one signed delivery plus retry. Confirm no Production URL or database is reached.
4. Add backlog age, exhausted-attempt and cron-failure alerts before calling this operational. A one-minute scheduled trigger is a polling interval, not a one-minute delivery guarantee. Clock skew, Vercel outages, Cloudflare limits, database outages and endpoint backoff still affect latency.

No Cloudflare Worker or drain token was deployed/configured in this code milestone. Commercial-use eligibility of the current Vercel Hobby hosting still needs an explicit product decision before a real customer/payment launch. The Preview branch and existing Production database must remain isolated.

No schema migration or database grants were required. Existing app permissions (SELECT/INSERT/UPDATE) suffice. A queue index and a more explicit event/attempt history schema should be designed before scaling. Clock synchronization between worker hosts is assumed for lease deadlines.

## Delivery semantics and receiver obligation

This is at-least-once delivery with bounded automatic attempts, not exactly-once network delivery. If a receiver accepts an event but the sender loses its acknowledgement, a lease recovery can send that event again. A received HTTP 2xx also does not prove order fulfillment was persisted.

The marketplace must atomically insert a unique processed-event ID, check the trusted order/amount/asset/network/seller, and update the order in its own database before acknowledging. External fulfillment should have its own outbox. The checked-in starter currently logs and acknowledges; its comments are not an implemented durable consumer. Luvrefranc source is required to validate or fix the real consumer.

Follow-up: the user supplied Luvrefranc's repository. Focused review found an unauthenticated signed-event simulator and process-local order storage. See LUVRE_RECEIVER_REVIEW_2026-09-29.md and LUVRE_CONTAINMENT.patch. Containment tests pass locally; a durable marketplace consumer and deployment remain outstanding.

Release follow-up: marketplace containment PR #1 was subsequently merged and its production smoke checks passed. Durable marketplace storage/consumer and Druto outbox deployment remain outstanding; only the marketplace containment release was deployed.

## Explicit local worker configuration

Use a Git-ignored local environment file such as `.env.webhook-worker.local`. Configure:

- `DATABASE_URL`: the limited `druto_app` identity for `druto_testnet`, never root.
- `DRUTO_WEBHOOK_ENCRYPTION_KEY`: a dedicated 32-byte random key encoded as 64 hex characters, identical on the API and worker. Production readiness fails without it. Newly registered secrets use `v1` ciphertext; old unversioned records encrypted with `JWT_SECRET` are not automatically readable. Re-register or explicitly migrate any retained endpoint after a reviewed cutover. Keep the old database intact.
- `DRUTO_WEBHOOK_ALLOWED_ORIGINS`: comma-separated, exact, operator-reviewed HTTPS origins. An origin approval trusts all paths on that origin.

With the project's installed dependencies, run one bounded batch using:

```powershell
node --env-file=.env.webhook-worker.local --import tsx scripts/run-webhook-worker.ts
```

Do not put credentials on the command line or send them in chat. The CLI validates the TiDB host suffix, testnet database and app-user suffix, enforces TLS and logs counts only. It does not implicitly load `.env` or admin credentials. The CLI was built but was not run against existing endpoint records in this milestone.

## Test evidence

- Full ordinary Vitest: **106 passed, 1 skipped**, including rebuilt API handler smoke tests.
- Security audit: **14 passed**; unresolved characterization tests remain, so this is not a clean security certification.
- New real TiDB outbox integration: **5 passed**. SQL was real, on two independent app connections; Arc verification and HTTP were mocked. Tests cover atomic commit and idempotent payment retry, crash before commit with rollback of all three records, receiver 500 then recovery, competing/stale workers, and capped automatic/manual retry behavior.
- Synthetic fixture rows were scoped by random IDs and cleaned up. The old `test` database was not touched.
- TypeScript, both serverless API bundles and standalone worker bundle passed. No frontend changes were made in this milestone.
- The existing TiDB router scenario and four payment concurrency scenarios also passed after the outbox refactor (five additional SQL tests).

## Remaining acceptance work

- Configure and verify an eligible scheduler/worker host, including Cron Events/log monitoring, availability expectations and budget limits. The draft Cloudflare adapter is code only; no free-host reliability or commercial permission has been assumed.
- Configure trusted test receiver origins and consistent encryption configuration in a staging environment; deploy API and worker together. Deploying only the API now queues notifications without sending them automatically.
- Add backlog/oldest-event/exhausted-attempt monitoring, a delivery-review UI and audit records for manual attempts.
- Implement origin ownership validation before allowing arbitrary marketplace destinations. Draft-branch DNS/IP-pinned delivery is unit-tested, but hosted validation is outstanding; exact operator allowlisting is still only a pilot gate.
- Design key rotation and per-endpoint key identifiers before rotating `DRUTO_WEBHOOK_ENCRYPTION_KEY`; replacing it without re-encrypting records will stop delivery.
- Validate receiver deduplication using the actual Luvrefranc source and database. Test acknowledgement loss, DB outage and fulfillment retries end to end.
- Review historical successful payments with missing delivery records separately; no automated backfill or silent reassignment was added.
- Run real browser-to-Arc-to-Druto-to-marketplace acceptance before release. This milestone sent no live payments or webhooks.
