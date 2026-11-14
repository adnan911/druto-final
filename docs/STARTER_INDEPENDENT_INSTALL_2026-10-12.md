# Independent starter installation and Workers runtime verification

## Findings and fixes

Following the first starter release, an independent installation review found two issues missed by the previous Node tests and repository-assisted dry-run:

1. Starter 0.1.0-testnet.1 declared `druto-platform: file:../..` in its manifest and lockfile. This depends on a parent checkout and is unsuitable for a standalone seller download. Removed that dependency and its linked lock entries; regenerated the lockfile. The archive builder now rejects non-pinned dependencies, external lockfile paths, links, non-registry resolved URLs and manifest/lock identity mismatches. Six regression tests cover these boundaries.
2. SDK 0.2.0-testnet.2 stored bare global `fetch` as an instance method. Actual workerd rejected calls with `Illegal invocation` because `this` became the SDK instance. SDK 0.2.0-testnet.3 binds its default fetch to `globalThis`; explicitly supplied custom fetchers remain supported. A receiver-sensitive unit test and real workerd integration cover the fix. The first failing runtime test reached no provider request; do not confuse this with a hosted Arc outage.

Starter **0.1.0-testnet.2** vendors SDK **0.2.0-testnet.3**. Developer downloads point to these new immutable names; old versioned files are retained as historical artifacts. Upgrade before using the earlier package in Workers. Prior dry-run and Node-test results remain valid for what they covered, but did not establish an independent successful checkout.

## Evidence

- Extracted the actual ZIP outside the repository to a normal OS temporary directory. `npm ci --no-audit --no-fund` installed 37 packages successfully, with no parent-repository dependency.
- `scripts/smoke-starter-package.mjs <extracted-directory>` resolves Miniflare from that installation and rejects a runtime resolved outside it. It executes the exact packaged Worker, catalog and SDK modules, the packaged assets and migration, a real local D1 binding and rate limiter. Only outbound Druto requests are synthetic; unexpected outbound requests fail the test.
- **Eight runtime checks pass:** three tables/two triggers installed; static storefront/setup/assets/security headers; provider outage preserves pending order; retry recovers the same order with trusted price/seller/idempotency; capability isolation and non-authoritative browser return; tampered and signed-but-mismatched webhook rejection; ten duplicate events yield one accepted event/job; a fresh runtime using persisted local D1 recovers the paid order and accepts replay without another job.
- **31 automated tests pass:** 17 starter, 6 packaging guard, 5 SDK, 3 compiled SDK/HTTP gateway integration tests. Full application TypeScript passes.
- Independently installed Wrangler `deploy --dry-run` passes. Gateway Vite D1 build and Wrangler dry-run are also required before publication. The existing large client bundle warning remains.

The test harness initially needed Miniflare v5's compatibility adapter, explicit module list, asset-router user-worker binding and `resourcePersistencePath`. These harness fixes do not modify packaged application code. Temporary diagnostic logging was removed before the final passing run. Local fixtures contain no real credentials or customer records. All runtimes dispose on completion.

## Artifacts

- Starter ZIP: `druto-cloudflare-starter-0.1.0-testnet.2.zip`, **36,282 bytes**; SHA-256 `11864c6f4ab406c75411834986a12bab0935c41131c1500578d337681e52ba66`.
- SDK ZIP: `druto-sdk-0.2.0-testnet.3.zip`, **8,094 bytes**; SHA-256 `8d9d83e18a66fa8d9d012331f76124f79cd8b0b0d5ead7cc13d85c5bf57a16d8`.
- Downloads reside under `https://druto-d1-testnet.robobq.workers.dev/downloads/`; each has an adjacent `.sha256` file.

Published on the existing gateway Worker as version **64be92dc-94ad-4885-9e6e-2586b8b620a0**, preserving D1, rate limits, webhook origin allowlist and schedules. Reconciler unchanged. Downloaded both hosted ZIPs and matched hosted/local SHA-256; reran all eight runtime checks from the hosted starter ZIP successfully. Health, readiness, developer page and preview catalog returned HTTP 200; preview checkout remains disabled. No remote database migration or new merchant deployment was performed. Previous gateway version for asset rollback: `24e7d546-1998-449d-98d3-19840df26cab` (contains the older downloads).

## Remaining gates

This establishes standalone installation and local Cloudflare runtime behavior with a synthetic payment provider, not a newly onboarded seller or hosted wallet E2E. A separate merchant deployment still needs an owner-verified seller, seller-scoped API credential, registered webhook and operator-approved origin, its own D1 database and a wallet-controlled Testnet payment. No new seller identity was invented and no hosted financial record was written for these tests. Fulfillment remains queued, not delivered. Customer recovery, capacity, independent security, country/legal and mainnet remain separate work.

No Git push, owner wallet operation, deferred backup/alert action or legacy infrastructure deletion is part of this verification.
