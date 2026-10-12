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

## Activation decision pending

Gateway settlement currently fans out to **all active endpoints for a merchant account**. Reusing one seller across two independent stores therefore sends each order event to both receivers. The starter intentionally rejects unknown orders; existing marketplace receivers must not be assumed to accept unrelated orders. Avoid knowingly generating retries or falsely marking the integration healthy.

Existing endpoint `wh_YAnlEtw3ko5s` points to `https://luvre-franc-d1-testnet.robobq.workers.dev/api/webhooks/druto`; it is active, with zero unfinished deliveries at preflight. No endpoint state has been changed. Owner was asked whether to temporarily pause it during the isolated trial (old store must receive no new test payments), then restore it, or first implement separate integration routing. Do not pause it without the answer. A pause stops notifications for new old-store payments, even though onchain checkout could still receive funds.

## After the routing decision

1. Add only the new exact store origin to the gateway webhook allowlist, preserving the existing origin. Publish and verify the gateway configuration.
2. Use the authenticated owner flow to generate a fresh seller-scoped key and register `https://druto-starter-testnet.robobq.workers.dev/api/webhooks/druto`. Do not create credentials through ad-hoc SQL or impersonate the owner. The existing seller is already verified, so registering the exact same seller/address should reuse it; no receiving-wallet re-verification is expected unless the account changes.
3. Owner transfers credentials privately to the new Worker as `DRUTO_API_KEY` and `DRUTO_WEBHOOK_SECRET`. Never send keys in chat, commit them, or expose them in logs. Wrangler private secret prompts may use `--config wrangler.starter-testnet.jsonc` from the reviewed worktree. Before onboarding, ensure the new origin is allowed; the current form creates a key before registering the webhook and a registration failure can leave a newly created key to clean up.
4. Confirm catalog enabled, create an order from the new browser storefront, and let the owner approve one Arc Testnet payment. Never operate the owner's wallet.
5. Verify gateway intent/transaction, successful delivery to the exact new endpoint, store paid order and one queued fulfillment job. Replay the same delivery through the supported retry flow where appropriate, confirming no duplicate fulfillment. Do not label a queued job delivered.
6. If the owner approved temporary endpoint switching, disable the new endpoint after the trial and restore the old endpoint, and disable the trial checkout/credentials to avoid further misrouted events. Preserve trial records and evidence. Longer-term multi-store routing remains product work.

No hosted end-to-end payment is claimed yet. No Git push, owner-deferred alerts/portable backup, or legacy resource removal is part of this preparation.
