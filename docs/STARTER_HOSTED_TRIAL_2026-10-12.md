# Hosted standalone starter trial — prepared, not activated

Owner selected the existing verified Luvre Franc seller for a separate Testnet storefront.

## Deployed resources

- Store: https://druto-starter-testnet.robobq.workers.dev
- Worker: `druto-starter-testnet`, version `aeedc338-1056-4405-a743-5ae6fca6dd51`.
- Separate D1: `druto-starter-testnet-orders`, ID `d1593784-08a8-499a-90b2-90ac90c35a92`, APAC placement hint (not a jurisdiction guarantee).
- Deployment configuration: `wrangler.starter-testnet.jsonc`. It references the shipped starter implementation, with its own rate-limit namespace `50420102` and orders database. No duplicated application source.
- Routing verified with a read-only gateway query: account `ma_4uguzltzDSiU`, `luvre-franc / luvre-seller-1`, active and wallet-verified, receiving address `0x49b1C6BE866396d6732a16A48D39e9fc305eF4fB`.
- Applied `0001_orders.sql` only to the new orders database. Readback confirms three tables, two triggers, zero orders/events/jobs. Gateway D1 and reconciler unchanged.

Wrangler dry-run and deployment passed. Hosted `/`, `/setup`, `/app.js`, `/api/catalog` return 200; catalog reports `checkoutEnabled=false`. Order creation and webhook POST return 503 with setup incomplete. No seller secret is installed, no event registered and no payment created. Public gateway remains version `64be92dc-94ad-4885-9e6e-2586b8b620a0`.

## Activation decision approved; old endpoint paused

Gateway settlement currently fans out to **all active endpoints for a merchant account**. Reusing one seller across two independent stores therefore sends each order event to both receivers. The starter intentionally rejects unknown orders; existing marketplace receivers must not be assumed to accept unrelated orders. Avoid knowingly generating retries or falsely marking the integration healthy.

Owner explicitly approved pausing the old Luvre webhook during the trial and restoring it afterward. Endpoint `wh_YAnlEtw3ko5s` points to `https://luvre-franc-d1-testnet.robobq.workers.dev/api/webhooks/druto`. Fresh preflight confirmed active=1, updatedAt=1791477384000 and zero unfinished deliveries. The first preflight attempt was not executed because automatic approval review hit its usage limit; after the owner's continue message, the same normal approval path succeeded.

Applied one guarded endpoint update (exact ID/account/URL, active=1, no unfinished deliveries) and verified its returned row: **active=0, updatedAt=1791824487000**. No order, intent, transaction or delivery record was edited. Old-store payments must remain unused during the pause; onchain checkout itself was not disabled.

Added `https://druto-starter-testnet.robobq.workers.dev` to the gateway's exact webhook-origin allowlist, preserving the old origin. Dry-run and deployment passed: gateway version **5ff2d195-3b25-4d7a-bf37-4114c5f3f28f**. Published version binding readback confirmed both origins; health/readiness returned 200. Store and reconciler versions unchanged. The new storefront still reports checkout disabled because owner-created API/webhook credentials have not been installed. No new webhook is registered yet.

### Required restore after the trial

Disable the trial checkout/revoke its scoped key and ensure no unsettled trial payment or unfinished delivery remains. Deactivate the new trial endpoint before restoring the old one; retain all evidence. Then restore only the original endpoint's active flag (do not restore the old timestamp):

```sql
UPDATE webhookEndpoints SET active=1, updatedAt=unixepoch()*1000
WHERE id='wh_YAnlEtw3ko5s' AND merchantAccountId='ma_4uguzltzDSiU'
AND url='https://luvre-franc-d1-testnet.robobq.workers.dev/api/webhooks/druto'
AND active=0
AND NOT EXISTS (SELECT 1 FROM webhookEndpoints other
  WHERE other.merchantAccountId='ma_4uguzltzDSiU'
  AND other.id!='wh_YAnlEtw3ko5s' AND other.active=1)
RETURNING id,active,updatedAt;
```

This is a saved recovery procedure, **not executed**. Verify active=1 afterward. A restored endpoint does not retroactively receive events omitted during a pause; any unexpected payment during the trial requires attribution review, not another payment.

## After the routing decision

1. DONE: publish and verify the new exact origin while preserving the existing origin (version above).
2. Use the authenticated owner flow to generate a fresh seller-scoped key and register `https://druto-starter-testnet.robobq.workers.dev/api/webhooks/druto`. Do not create credentials through ad-hoc SQL or impersonate the owner. The existing seller is already verified, so registering the exact same seller/address should reuse it; no receiving-wallet re-verification is expected unless the account changes.
3. Owner transfers credentials privately to the new Worker as `DRUTO_API_KEY` and `DRUTO_WEBHOOK_SECRET`. Never send keys in chat, commit them, or expose them in logs. Wrangler private secret prompts may use `--config wrangler.starter-testnet.jsonc` from the reviewed worktree. Before onboarding, ensure the new origin is allowed; the current form creates a key before registering the webhook and a registration failure can leave a newly created key to clean up.
4. Confirm catalog enabled, create an order from the new browser storefront, and let the owner approve one Arc Testnet payment. Never operate the owner's wallet.
5. Verify gateway intent/transaction, successful delivery to the exact new endpoint, store paid order and one queued fulfillment job. Replay the same delivery through the supported retry flow where appropriate, confirming no duplicate fulfillment. Do not label a queued job delivered.
6. If the owner approved temporary endpoint switching, disable the new endpoint after the trial and restore the old endpoint, and disable the trial checkout/credentials to avoid further misrouted events. Preserve trial records and evidence. Longer-term multi-store routing remains product work.

No hosted end-to-end payment is claimed yet. No Git push, owner-deferred alerts/portable backup, or legacy resource removal is part of this preparation.
