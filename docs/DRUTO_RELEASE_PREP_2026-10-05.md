# Druto Arc Testnet release review — 5 October 2026

This branch is a review candidate, not approval to deploy or to handle real funds. It starts from GitHub `main` at `e58876c` and isolates the local remediation source without changing the existing dirty checkout. Luvre's separate persistence change is draft PR [#2](https://github.com/adnan911/luvre-franc/pull/2).

## Verified evidence

- Vercel `druto-final` Production is still built from `e58876c`. Read-only inspection of its masked `DATABASE_URL` showed database name `test`, **not** `druto_testnet`; the username is not the restricted `.druto_app` identity. No secret value was copied to source or chat. Changing this variable while the old API is deployed would be an unreviewed cutover.
- The separate TiDB `druto_testnet` target has one approved baseline migration, nine application tables, 111 columns, required unique indexes and active TLS. The `.druto_app` identity has only SELECT/INSERT/UPDATE on those tables and cannot read the old `test` database or migration ledgers, or DELETE rows. Its rollback-only write test passed again.
- This review branch adds a production startup guard that requires the exact `druto_testnet` TiDB target and restricted app username. `/api/ready` checks a real SQL session, TLS, database identity and table access; a missing or wrong configuration returns generic 503 without exposing credentials. A direct read-only probe against the restricted target returned ready.
- Production intent creation now requires seller routing and a seller-scoped API key. The old shared-wallet demo fallback remains available only outside production; it cannot create a hosted production intent.
- The legacy `db:push` command now fails deliberately. `db:verify:testnet` is read-only. New forward migrations still require a reviewed runner and a backup/restore exercise.
- Isolated branch validation: 158 tests passed, one skipped; TypeScript passed; production frontend and both serverless bundles built; rebuilt API smoke passed. The later landing-page copy change also passed TypeScript and a production build. Local Node 22.11.0 is below Vite's stated 22.12 minimum and emitted a warning, so a supported pinned runtime remains a release gate.

## Open release gates

1. Preserve and inventory the old `test` database, deployed revision, sessions, operator roles, seller destinations and webhook endpoints before any cutover. Do not copy old credentials or historical paid flags into `druto_testnet`.
2. Finish operator and cross-tenant authorization review, webhook destination SSRF protection, key separation/rotation and hosted worker scheduling. The local worker is not currently running on Vercel.
3. Establish a reviewed migration/rollback path and backup for every supported existing database. The new testnet baseline is not a migration of `test`.
4. Configure the Druto Vercel Production environment with the restricted `druto_testnet` account as a Secret only during a coordinated deployment. Verify `/api/ready`, login, seller ownership and API-key scopes on that exact deployment. Do not point the old live revision at the new database.
5. Create a seller-scoped API key and signed webhook endpoint for verified account `ma_4uguzltzDSiU`. Configure the matching Luvre server secrets and database, then deploy reviewed Luvre PR #2.
6. Run one buyer-signed Arc Testnet direct 0% payment and verify chain receipt, exact wallet/amount, Druto settlement, signed webhook, Luvre `PAID`, one fulfillment-outbox row and duplicate/recovery behavior. A Vercel Ready badge or old dashboard transaction is insufficient.

This review branch must remain draft until the open gates are addressed. Preview has branch-scoped secrets; there has been no Druto **Production** Vercel setting change, production deployment, main-branch merge or buyer-signed payment in this review milestone.

## Webhook configuration follow-up

Webhook endpoint secrets now use a dedicated `DRUTO_WEBHOOK_ENCRYPTION_KEY` (32 random bytes, 64 hex characters) rather than `JWT_SECRET`; Production readiness fails without a valid dedicated key. Both the API and outbox worker need the same secret. New ciphertext is versioned `v1`; legacy unversioned endpoint records are not silently decrypted. Exact operator-approved HTTPS origin is required at registration and dispatch; URL credentials, fragments, IP literals and local hostnames are rejected. These checks do not prevent DNS rebinding, so arbitrary third-party webhook destinations remain blocked pending IP-pinned delivery and origin ownership proof. Key rotation also remains a release gate.

## Follow-up: Preview runtime and legacy inventory

- Preview `f5200d4` built as Ready, but `/api/ready` returned `500 FUNCTION_INVOCATION_FAILED`. Vercel runtime logs identified an unresolved `./index.src` import from the API catch-all. Draft-branch commits `70575d3` and `8f5dafc` switch to the build-produced `./index.js` and add its TypeScript declaration. The later `4b62cda` Preview has `/api/ready` HTTP 200 in Vercel runtime logs; build status alone was not proof of API health.
- A read-only TLS inventory of the old `test` database found 8 users, 10 merchant accounts, 4 API keys, 4 webhook endpoints, 16 payment intents, and 10 finalized Arc Testnet transactions. Ten intents are marked `succeeded`, six `requires_payment`; all 16 store a 200 bps fee policy. Preserve and reconcile this history before any `druto_testnet` cutover. Do not treat old paid flags or 2% metadata as the new direct 0% accounting model.

## Preview configuration and hosted readiness

- The owner cannot confirm whether every row in the old `test` database belongs only to their demo. Treat it as potentially real customer/seller data; preserve it and require a reviewed backup, identity mapping and reconciliation before any cutover.
- Vercel project environment inventory initially had Production variables only. Added `DATABASE_URL` for the restricted `.druto_app` identity on `druto_testnet` and `DRUTO_WEBHOOK_ENCRYPTION_KEY` as **Secret** values scoped only to Preview branch `codex/druto-testnet-release-review`. No Production variable was changed. The worker key is retained locally in Git-ignored `.env.webhook-worker.local`; never print or commit its value.
- Redeployed commit `4b62cda` as Vercel Preview deployment `8eZ27TfcPFm4ZkT8q6MyJhnuFdhc` after those settings were saved. Vercel reports the deployment Ready. Its runtime logs show `GET /api/ready` returned HTTP 200 twice (5 October 2026, 09:05 and 09:06 UTC) and unauthenticated `GET /api/trpc/auth.me` returned HTTP 200. The in-app browser blocked direct display of the `/api/ready` JSON with `ERR_BLOCKED_BY_CLIENT`; status evidence comes from Vercel's function logs, not from a displayed response body.
- This checks Preview database/key readiness only. It does not verify seller login, Arc payment, webhook delivery, Luvre fulfillment, worker uptime or Production configuration. The subsequent landing-page change labels mock data as illustrative and removes unsupported volume, finality-latency, gasless, multi-seller batching and 24/7 dispatch claims. It still requires review on the latest Preview deployment before release.
