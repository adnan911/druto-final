# Session backlog and failure recovery exercise — 2026-10-11

## Local results

Added two real-SQL tests to `server/d1-sessions.test.ts`, using the actual D1 migrations and cleanup function with an in-memory SQLite adapter:

- Seeded **10,000 retention-eligible** sessions (a mixture of revoked and unrevoked) and **10,000 unexpired** rows, plus one genuine newly created login session. One hundred calls deleted exactly 100 eligible rows each. The next call deleted zero. The oldest eligible fixture was removed first; the newest remained after the initial batch. All unexpired row values matched their original snapshot and the valid session still authenticated.
- Injected a SQLite `RAISE(ABORT)` trigger **after ten row deletions within a batch**. The cleanup rejected, and all 100 eligible rows remained after rollback. Dropping only the injected trigger allowed the next call to delete 100 and a further call to delete zero. The valid session authenticated both before and after recovery.

All **13 session/schedule tests passed** (11 session tests, 2 scheduling tests), including the existing expiry, revocation, rotation and failure-isolation checks. Full application typecheck and whitespace checks passed. No runtime code or configuration changed, no new Worker deployment, no remote database mutation or hosted load generation. These are synthetic SQL correctness/recovery checks, **not** hosted D1 latency, CPU, request-rate or payment-throughput measurements.

## Capacity implication

The current cleanup policy remains 100 rows per hourly invocation. A 10,000-row eligible backlog needs 100 successful batches: approximately 100 hours at the normal schedule, assuming no new eligible rows and no failures. Maximum normal scheduled removal is 2,400 rows/day; sustained arrivals above that rate grow the backlog. Test execution duration is not a substitute for this schedule arithmetic.

Deletion remains logically safe while delayed: expiry and revocation are checked at authentication time. However, storage growth and repeated batch-limit warnings need operator attention. Before a larger pilot, measure hosted D1 rows read/written, Cron CPU and failure rate using non-customer fixtures in an isolated environment, then size batch/frequency against observed creation rates and account quotas. Do not increase quotas, expose live data, or load-test the live gateway merely to clear this checklist item.

## Hosted verification attempt and concrete blocker

- At roughly 12:16 Bangladesh time, started a filtered live tail for `[D1 session cleanup]` ahead of the 12:17 slot. No event or confirmed connection was obtained; Wrangler's local diagnostics showed a pending POST to the tail endpoint. Stopped the tail. This does not establish whether the scheduled invocation succeeded or failed.
- Tried the documented Workers Observability keys endpoint using the existing Wrangler authentication, captured only in process memory. It returned **HTTP 403**. No token was printed, no permissions were expanded, and no historical event query was run after that refusal.
- Opened the previously authorized Cloudflare Worker dashboard. It showed **“Refresh the page to try again”**; one refresh returned the same error. No wallet, settings, credential, feedback submission or alert policy was touched. Asked the owner whether their own browser opens the dashboard.
- Thus the natural hosted hourly cleanup run remains **UNVERIFIED**. Neither an empty log file nor zero session rows proves a successful Cron. A logged `[D1 session cleanup]` result associated with the scheduled `17 * * * *` invocation and successful invocation outcome is the next evidence required. Latest deployed version remains `499a5902-a3b9-475c-8015-f40f4805359f`.
- Separately, public `/api/health` and `/api/ready` both returned HTTP 200 during this attempt. That verifies those endpoints at the time of the check, not Cron execution.

Official reference: [Workers Observability query API](https://developers.cloudflare.com/api/resources/workers/subresources/observability/subresources/telemetry/methods/query/). Its documented availability does not imply this credential currently has access.

## Remaining release gates

- Verify natural hosted cleanup when the dashboard/tail access works; keep this item open.
- Owner-controlled fresh dashboard login still pending; do not operate the wallet.
- Portable encrypted/off-device backup and secret recovery remain separate from the completed local restore drill.
- Broader checkout/webhook/reconciliation capacity exercises remain separate from session retention.
- Account-email alert setup is owner-deferred. Vercel/TiDB retirement and real-money launch gates remain open. **NO GIT PUSH** persists.
