# D1 session retention — 2026-10-11

## Policy and implementation

- Druto Testnet retains every dashboard session row until seven days after its original absolute expiry, including revoked sessions. Revocation still takes effect immediately for subsequent authentication; retention never extends access. With the current 24-hour lifetime, rows become eligible eight days after creation.
- An hourly `17 * * * *` Cron on the existing Druto Worker deletes at most 100 eligible rows per invocation using the existing expiry index and a single atomic DELETE/subquery. No new provider, dependency, schema migration or secret is required.
- The separate `*/2 * * * *` webhook route is preserved. Explicit schedule dispatch prevents a webhook delivery failure from suppressing cleanup and prevents cleanup from triggering deliveries. Shared configuration/readiness failure still fails the invocation.
- Logs contain only deleted count and a batch-limit flag. Reaching 100 logs a warning that further rows *may* remain; it does not prove backlog. Database errors propagate. Repeat runs safely process any remaining eligible rows without authenticating deleted tokens.
- This is a bounded Testnet policy, not unlimited retention/scaling: at most 2,400 rows/day at the normal hourly schedule, less if runs fail. Sustained creation above cleanup capacity or repeated limit warnings require review. Oldest eligible rows are selected first. No immediate retry loop or automatic quota expansion.
- Only `dashboardSessions` rows are deleted. Seller, user, API-key, payment and webhook data are not cleanup targets. Existing backup snapshots may retain deleted session rows until their own retention expires. This is not a financial audit-log retention policy or a secure-erasure guarantee.

Cloudflare documents [batching large D1 mutations and using indexes](https://developers.cloudflare.com/d1/platform/limits/) and [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/). Seven-day retention and 100 rows/hour are our design choices. Trigger changes may take time to propagate; successful deployment alone does not verify a natural scheduled run.

## Verification

- Full suite: **241 passed, 1 existing live test skipped**. Added real SQL retention-boundary, batch-cap, repeat-run, active-session preservation, removed-token rejection and query-index checks; schedule tests cover routing, delivery failures, cleanup failures and unexpected schedules.
- Full and Cloudflare typechecks passed. Corrected the narrow Worker event declaration to expose `cron` and `scheduledTime`; no runtime type assertion was used. Wrangler dry run and whitespace checks passed.
- Local Wrangler D1 scheduled endpoint returned 200 and logged zero deletions; after inserting a deliberately expired local fixture, it reported one deletion, then zero on repeat. Only local disposable data was used. The initial `/__scheduled` probe returned frontend HTML and was not counted as a Cron check; the correct `/cdn-cgi/handler/scheduled` endpoint produced the evidence above. Local dev stopped.
- Frontend and SDK unchanged. No new payment or hosted wallet login performed. Fresh owner login remains outstanding from the previous session-security change.
- Deployed Testnet version `499a5902-a3b9-475c-8015-f40f4805359f`; Wrangler confirmed both schedules. The first attempt failed on Cloudflare's deployments GET with HTTP 500; one retry succeeded. Post-deploy health, readiness, dashboard and developers returned 200; existing receipt `pi_nXi5jBv0Bxe4` remained succeeded / 2,000,000 atomic / 0 bps. A natural hosted hourly cleanup run has **not yet been observed**. Do not treat local Cron evidence as that verification.

## Operations

- Inspect `[D1 session cleanup]` logs and scheduled failures. Repeated batch-limit warnings require aggregate backlog/capacity review before increasing limits.
- Keep the 24-hour expiry/revocation checks enabled if cleanup fails. Authentication safety does not depend on physical deletion.
- To pause cleanup, remove only its hourly trigger; do not roll back to the legacy JWT Worker. Removing the cleanup trigger does not restore deleted session rows, which were already expired. Users can sign in again.
- Email alert configuration remains owner-deferred. Git push remains prohibited. Vercel/TiDB retirement and a database restore drill are still open.
