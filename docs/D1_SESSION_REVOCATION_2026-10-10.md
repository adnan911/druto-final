# D1 dashboard session expiry and revocation — 2026-10-10

The D1 dashboard now uses an opaque random session token backed by a D1 row. This replaces its one-year stateless JWT. The Testnet policy is a **24-hour absolute lifetime**, with server-side revocation on logout and token rotation on a fresh wallet login. Existing legacy JWT cookies are deliberately rejected after deployment; users must sign in again. User, seller and payment records are preserved.

## Behavior and security boundary

- A verified wallet challenge creates a fresh **256-bit random** token, delivered only as the existing host-only `app_session_id` HttpOnly cookie with SameSite=Lax and a 24-hour Max-Age. The existing cookie helper sets Secure for HTTPS requests. No token is returned in the JSON response or stored in browser web storage by this flow.
- `dashboardSessions` stores only the SHA-256 token digest, user ID, creation time, expiry and revocation time. Tokens are not logged. Authentication joins the session row to the current user and checks expiry/revocation on every request, with no application cache or D1 read-replica session.
- D1 accepts session credentials only from this cookie, not a Bearer header. Seller server API keys continue to use their separate authorization path. Their revocation and payment behavior are unchanged.
- Logout waits for the D1 revocation write **before** clearing the cookie or returning success. A copied cookie fails on subsequent requests after logout. Database failure does not fall back to JWT validation or report a successful logout.
- New wallet login inserts the fresh session and revokes the previous browser token in one D1 batch. Other browser/device sessions remain valid. If inserting the new session fails, its batch does not revoke the previous session; a consumed wallet challenge may require a fresh signature attempt.
- Revocation does not cancel requests that were already authenticated and in flight, including procedures sharing a tRPC batch context. This is not a promise to undo an already-authorized operation or blockchain transfer.
- No idle timeout, background refresh, device-session management UI or all-device logout was added. A session cannot be extended beyond 24 hours without signing in again. Expired/revoked rows are harmless for authentication but a bounded retention cleanup job remains to be added before sustained usage.
- The old Vercel/TiDB authentication path is unchanged. Its JWT SDK remains for legacy code. The existing D1 configuration still checks the already-configured JWT secret, but the new D1 dashboard sessions do not use it. Do not interpret this change as retirement of the old infrastructure.

The design follows [OWASP's session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) on unpredictable identifiers, protected cookies, server-side expiration and logout invalidation. The 24-hour lifetime is our Testnet policy choice, not a claim that OWASP mandates that duration or approves real-money use.

## Migration and recovery

- `0001_dashboard_sessions.sql` adds one table, two indexes and a user foreign key with cascade on user deletion. It does not update or delete business records. Readiness now requires the session table.
- Hosted Wrangler initially listed `0000_cool_tempest.sql` as pending despite existing tables. Compared all **23** original application table/index/trigger definitions against an in-memory database built from that exact migration: all matched. The only extra non-filtered object was Cloudflare's `_cf_KV` table.
- Only after that comparison, registered `0000_cool_tempest.sql` in `d1_migrations` as the existing baseline. Wrangler then listed only `0001_dashboard_sessions.sql`, which was applied successfully. Do not replay the original schema against an initialized database.
- Captured the pre-migration Cloudflare D1 Time Travel bookmark locally at `audit/backups/d1-pre-session-migration-bookmark.json`. Its availability is time-limited by the account's Time Travel retention; this is not a permanent SQL backup or a completed restore drill.
- Before migration, hosted aggregate counts were **2 users, 1 seller, 3 intents, 2 transactions**.
- Prefer a forward fix if session code needs repair. Rolling back to the earlier Worker would restore its old JWT acceptance and lose this revocation guarantee. A database restore could also restore revoked sessions or discard newer payments; coordinate maintenance, invalidate sessions after a restore, and reconcile payments before reopening traffic. Never blindly restore just the session migration.
- For an incident requiring revocation of every current D1 dashboard session, an authorized operator can update non-revoked rows' `revokedAt` in D1; per-user revocation additionally filters `userId`. Do not put raw tokens into SQL, shell history, tickets or logs. This operation has not been run on customer sessions in this change.

## Validation

- **237 tests passed; one existing Privy live test skipped.** Seven new SQLite-backed tests execute the actual migrations and SQL: hash-only persistence, exact expiry boundary, copied-token logout replay, per-session isolation, login rotation, failed-creation rollback, malformed/legacy/Bearer credential rejection, database failure and deleted users.
- Tests passed on bundled Node 24.19.0 and through standard `pnpm test` on system Node 22.11.0. Vitest worker processes explicitly enable that older Node version's experimental SQLite builtin. No new dependency was added.
- Full application and Cloudflare TypeScript checks passed. Wrangler deployment dry run and diff whitespace checks passed. Frontend and SDK artifacts are unchanged from the previously verified wallet-only build.
- **16 local Wrangler D1 smoke checks passed**, including cookie flags/24-hour lifetime, replay of a copied cookie after logout, fresh login preserving seller linkage, rotation invalidating the replaced cookie, and existing payment/API-key behavior. Disposable local identities were used; no wallet UI or hosted seller signature was accessed.
- No new onchain payment was sent. No key rotation or secrets disclosure was required.
- Deployed Druto Arc Testnet Worker **`c6c0ef43-1578-485b-a3be-9ec6274c5888`**. Hosted health, readiness, dashboard and developers returned 200. Synthetic legacy-shaped and unknown session cookies returned anonymous `auth.me` and 401 for seller records. Cross-origin logout returned 403. The existing receipt remained succeeded / 2 USDC / 0 bps. Business counts after migration matched the pre-migration counts; no session rows had yet been created remotely. Wrangler reported no pending migrations. A fresh hosted sign-in by the owner remains a user-controlled follow-up; no hosted authenticated-session replay is claimed here.

Git push remains deferred by the owner. Capacity, alerting, retention/restore operations, legacy retirement and real-money launch gates remain open.
