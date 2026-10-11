# D1 backup and isolated restore drill — 2026-10-11

## Result

**PASS: a hosted Testnet SQL export was encrypted, restored into a fresh local Wrangler D1 database, re-exported and compared offline.** Live D1 was never an import/restore target. No application Worker or webhook processor was started on the restored data.

- Captured at `2026-10-11T04:44:13.777Z` (10:44 Bangladesh time).
- All **11 application/migration tables** matched, including schema definitions, column/index/foreign-key metadata, full row contents and SQLite autoincrement state. SQLite integrity and foreign-key checks passed. Reserved Cloudflare storage tables are excluded.
- Counts: 2 users, 1 merchant account, 3 payment intents, 2 payment transactions, 1 API key, 1 ownership challenge, 4 wallet-login challenges, 2 webhook deliveries, 1 webhook endpoint, 2 migration records, 0 dashboard sessions.
- CurrentUser Windows DPAPI encryption/decryption roundtrip matched the original SQL bytes. This protects the retained file at rest; it is bound to the Windows user's DPAPI keys/profile and is **not an independently portable or off-device disaster-recovery backup**.
- Temporary plaintext SQL files, local restored database and raw command logs were removed after verification. This was ordinary filesystem removal, not a claim of forensic secure erasure. The outer repository now ignores `/audit/backups/`; no backup files were tracked. The existing unrelated root worktree changes were preserved.
- Five new verifier tests passed: insertion-order independence, same-count data corruption, missing indexes/orphan records, 64-bit integer comparison, and autoincrement corruption. Full application typecheck passed. The gateway runtime was unchanged, so it was not redeployed and its already-passing full suite was not repeated for an offline script.

## Retained recovery files

Files are under the outer workspace's **`audit/backups/`**, outside the reviewed source worktree:

- `druto-d1-2026-10-11.sql.dpapi`: encrypted full SQL export, 19,014 bytes.
- `d1-backup-manifest-2026-10-11.json`: timestamp, source database, plaintext and ciphertext SHA-256, format and validation scope.
- `d1-restore-evidence-2026-10-11.json`: aggregate table counts and PASS result only.

Source bundles in that directory are Git recovery artifacts, not database backups. The encrypted export also contains session/API-key hashes and encrypted webhook secrets; do not publish decrypted SQL or row contents. Recovery of encrypted webhook values additionally requires the corresponding Worker secret, which this SQL export does not include. Worker configuration, secrets, frontend assets and onchain state have separate recovery requirements.

## Repeating an isolated drill

1. Use a new ignored local directory such as `.wrangler/recovery-<timestamp>`. Export with `wrangler d1 export druto-d1-testnet --remote --config wrangler.d1.jsonc --output <directory>/source.sql --skip-confirmation`. Capture output privately; do not print raw SQL. A running export can temporarily block database requests.
2. Protect the original bytes with Windows DPAPI `CurrentUser`, save outside Git, decrypt in memory and compare SHA-256. Preserve timestamp, file size and both hashes in a manifest. Do not discard the raw export until the encrypted roundtrip and restore comparison both pass.
3. In the fresh directory create an isolated config with database name `druto-restore-drill-only` and a dummy ID (the drill used `11111111-1111-4111-8111-111111111111`). It must not name the live database and must have no Worker bindings to live services, secrets, Cron, or app entrypoint.
4. Run `wrangler d1 execute druto-restore-drill-only --local --cwd <directory> --config wrangler.jsonc --file source.sql`. Then `wrangler d1 export druto-restore-drill-only --local --cwd <directory> --config wrangler.jsonc --output restored.sql`. Both operations must be explicitly local. Do not replace `--local` with `--remote`.
5. From the reviewed worktree, run `node scripts/verify-d1-restore.mjs <directory>/source.sql <directory>/restored.sql` with Node 24. The verifier accepts trusted Wrangler exports only and executes them in memory; never feed customer-supplied SQL. It prints only aggregates, and failures suppress SQL error text. Comparison against a re-export checks the restored data rather than simply comparing the original file to itself.
6. Record the aggregate result, then remove only that resolved temporary directory after verifying it is inside the intended workspace. Keep the encrypted backup and manifest. Do not start the payment app or replay webhooks from a copied database.

To decrypt the retained backup on the authorized Windows profile, use the following inside a **new empty local recovery directory**. Substitute the existing backup/manifest paths; do not send them or their contents to external services:

```powershell
$drutoBackup = 'ABSOLUTE_PATH_TO_SQL_DPAPI'
$drutoManifest = Get-Content -Raw 'ABSOLUTE_PATH_TO_MANIFEST_JSON' | ConvertFrom-Json
if ((Get-FileHash -LiteralPath $drutoBackup -Algorithm SHA256).Hash -ne $drutoManifest.encryptedSha256) { throw 'Backup checksum mismatch' }
$drutoPlaintext = [Security.Cryptography.ProtectedData]::Unprotect(
  [IO.File]::ReadAllBytes($drutoBackup), $null,
  [Security.Cryptography.DataProtectionScope]::CurrentUser)
$drutoDigest = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($drutoPlaintext))
if ($drutoDigest -ne $drutoManifest.plaintextSha256) { throw 'Decrypted checksum mismatch' }
if (Test-Path -LiteralPath './source.sql') { throw 'Refusing to overwrite recovery file' }
[IO.File]::WriteAllBytes((Join-Path (Get-Location) 'source.sql'), $drutoPlaintext)
Remove-Variable drutoPlaintext
```

## Incident recovery boundaries

This drill validates SQL backup portability into local D1, **not** a live Cloudflare restoration, full service recovery, measured RTO, or automatic backup schedule. It does not establish an RPO beyond this single timestamp. It does not verify an independent copy survives loss of this PC/profile.

Before a real hosted restore: stop new checkouts and outbox dispatch, take a fresh backup, choose the exact recovery point, restore into an isolated replacement database, verify schema/migration compatibility, and compare business records with Arc receipts. Invalidate restored dashboard sessions and login/ownership challenges; review API keys created/revoked after the snapshot and restore the correct encryption-key access. Reconcile missing payments and webhook delivery state before enabling traffic. A snapshot may resurrect revoked credentials or miss later payments; do not blindly replay historical webhooks or restore over the live database.

Cloudflare documents export precision limits for large numeric values. Druto stores monetary atomic amounts as text; this drill compared those values exactly. Source-to-restored equality does not independently prove that a future export has preserved every remote integer beyond JavaScript's safe range. Review numeric schema/data before larger migrations.

## Remaining work

- Follow-up: a natural hosted hourly cleanup invocation was verified at 16:17:54.183 GMT+6, outcome `ok`; see [hosted evidence](D1_SESSION_CAPACITY_2026-10-11.md). No new deployment was made by this drill.
- Owner-controlled fresh dashboard login is still outstanding; snapshot had zero dashboard sessions.
- Establish portable encrypted/off-device backup and secret-recovery policy, then a separate hosted replacement-database drill before real customer launch.
- Capacity exercise, owner-deferred email alerts, and Vercel/TiDB retirement remain open. **NO GIT PUSH** remains active.

Official references: [D1 import/export and limitations](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [D1 limits and Time Travel retention](https://developers.cloudflare.com/d1/platform/limits/). The local encrypted backup does not extend or replace Cloudflare's Time Travel retention.
