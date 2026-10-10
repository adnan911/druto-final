# Druto Cloudflare D1 security review — 2026-10-10

Scope: the active Arc Testnet D1 Worker (`workers/druto-d1-app`, `api/d1-app.ts`, `server/d1-router.ts`) and its payment/webhook boundaries. This is a targeted code review and regression check, not a certification, penetration test, or approval for customer funds.

## Fixed in this review

1. **Session JWT exposure (high):** `auth.verifyWalletLogin` set an `HttpOnly` cookie but also returned the same JWT in the JSON response. The D1 response now returns only non-secret account information. The dashboard ignores the old `token` field, so its login flow does not need a frontend change. Existing sessions are not revoked by this patch.
2. **Cookie mutation origin check (medium):** POSTs with a cookie and no `Origin` previously bypassed the D1 CSRF guard. Cookie-backed POSTs now require an exact same-origin `Origin` or, when Origin is absent, a same-origin `Referer`. Missing, `null`, malformed, or cross-origin sources fail with 403. Cookie-free server-to-server SDK calls remain available. The HTTP regression test covers both paths.
3. **Arc RPC error disclosure (medium):** `payments.verifyTransfer` previously returned arbitrary upstream error messages to the buyer. Known payment-rejection messages remain actionable; unexpected RPC/transport errors now use a generic `SERVICE_UNAVAILABLE` response that tells the buyer to check payment status before sending funds again. Settlement still fails closed.

## Boundaries reviewed and retained

- Intent creation requires a seller-scoped API key and an active, separately verified receiving wallet. D1 intents quote 0 bps platform fee and the seller's wallet as recipient.
- Direct settlement checks the Arc chain, receipt status and mined time, USDC transfer log, amount and destination, and a payer signature tied to the intent and transaction. Ledger transaction and webhook outbox insert are one D1 batch.
- Seller reads and webhook retry check merchant ownership. Public payment views use an explicit field allowlist. Webhook registration is restricted to operator-allowed HTTPS origins; delivery signs the payload and does not follow redirects.
- Worker ingress has IP and credential rate-limit bindings; the scheduled outbox and read-only reconciler are separate. These controls are useful but do not establish fraud, sanctions, or regulatory compliance.

## Open release gates

- **Sessions:** JWTs last one year, with no per-session server-side revocation. Decide a shorter lifetime and revocation/rotation procedure before a real seller pilot. Existing Testnet sessions issued before this patch may have been visible to browser JavaScript; there is no evidence of compromise, but rotating the Testnet JWT signing secret would invalidate them all.
- **Old infrastructure:** the legacy Vercel/TiDB path remains online. This patch is for the Cloudflare D1 Worker; old endpoints must be separately retired after dependency checks. Do not treat this review as covering legacy code.
- **Operational alert:** the Cloudflare account-email failure alert remains unconfigured because the owner deferred the dashboard step. Logs/Cron results are not guaranteed paging.
- **Capacity:** the read-only reconciler is bounded at 100 succeeded payments per run. Its hosted trace passed with two real payments, not 100. Payment API, D1 concurrency, RPC provider limits, and webhook throughput need measured load tests before broad access.
- **Payment lifecycle:** direct onchain transfers are practically irreversible. A refund is a new authorized transfer, not a reversal; refund, dispute, underpayment, duplicate-transfer, and payout operations are not production-ready.
- **Commercial launch:** jurisdiction-specific legal review, seller KYC/KYB/sanctions controls, incident ownership, key rotation, privacy/retention policy, and production backup/restore objectives remain open. Arc Testnet success is not mainnet approval.

## Verification

- 221 tests passed, one skipped. New HTTP CSRF and Arc error-boundary tests passed.
- Cloudflare TypeScript check, SDK build, Vite D1 build, Wrangler D1 dry run, and `git diff --check` passed.
- Vite warned that local Node 22.11.0 is below its stated 22.12+ support floor; the build completed. Upgrade the build runtime before making this a repeatable release gate.
- Deployed to the Arc Testnet D1 Worker as version `e0a0e083-4789-45fb-9d8b-2c0ba1b45447`. Hosted `/api/health`, `/api/ready`, and `/developers` returned 200. Synthetic POSTs with a cookie and missing or foreign Origin returned 403; same-origin and cookie-free POSTs reached the expected 404 probe route.
- This review did not send funds or write payment records. Git push was explicitly deferred by the owner.

Reference: [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) for exact origin checking, missing-source rejection, and SameSite as defense in depth; [MDN HTTP cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies) for the protection provided by `HttpOnly` cookies.
