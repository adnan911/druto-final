# Cloudflare storefront starter — 12 October 2026

**Superseded release:** use starter `0.1.0-testnet.2` with SDK `0.2.0-testnet.3`. Independent installation subsequently found a parent-repository dependency and a Workers fetch receiver bug in the original release. Both are fixed and covered by [independent installation/runtime evidence](STARTER_INDEPENDENT_INSTALL_2026-10-12.md). The original publication record below is historical, not the current recommended download.

## Published deliverables

- [Visual preview](https://druto-d1-testnet.robobq.workers.dev/starter-preview/)
- [Starter ZIP v0.1.0-testnet.1](https://druto-d1-testnet.robobq.workers.dev/downloads/druto-cloudflare-starter-0.1.0-testnet.1.zip)
- [SHA-256](https://druto-d1-testnet.robobq.workers.dev/downloads/druto-cloudflare-starter-0.1.0-testnet.1.zip.sha256)
- [Developer download page](https://druto-d1-testnet.robobq.workers.dev/developers)

Archive: 37,221 bytes; SHA-256 `8940dc6915bb7707155f01520ebb163535b21c6bb60664ca95047f437b26f4c7`. Versioned archive includes the pinned Wrangler dependency lockfile, Worker, static frontend, migrations, setup guide and reviewed SDK `0.2.0-testnet.2` with license. Explicit allowlisted packaging excludes credentials and local runtime state. Run `node sdk/build-starter.mjs` after SDK build when rebuilding; `cf:d1:build` now includes the starter build.

The public preview reads a static catalog with `checkoutEnabled=false`. It does not create orders or connect to seller credentials. A merchant installs the template in its own Worker and separate D1 database. No new merchant Worker/database was created in the user's account for this sample.

## UX and backend

Forma is a demo storefront brand: warm ivory, graphite, lime accents, CSS sculptural artwork and a responsive three-product collection. Native dialogs provide keyboard focus management; controls have labels and visible focus; reduced-motion preference is respected. Order summary updates quantity/USDC totals with integer arithmetic, explains fees and preserves the same order on uncertain responses. Setup has a separate creator flow. Paid, pending, expired and unavailable status have distinct messages. Queued fulfillment is never presented as delivery. No external fonts, images or tracking dependencies.

Prices and seller routing are server-owned. Each anonymous browser order uses a random session-storage capability; only its SHA-256 hash is saved. The pending order is persisted before Druto is called, reusing its ID for idempotency. The intent is bound before the checkout URL is returned. Unknown order access cannot enumerate order data. Browser redirects cannot mark paid.

The raw signed webhook is verified with the SDK, with a pinned event version. Database triggers require saved order/intent/amount/seller/account/recipient and immutable transaction identity to match. Event acceptance, paid state and a unique fulfillment job commit atomically. Unique transaction and event constraints prevent reuse. Mismatches and storage failures return non-2xx for operator investigation/retry. Request bodies are bounded, API operations require rate limiting, errors do not expose credentials, and private API responses are no-store. The standalone Worker sets CSP and related response headers.

## Verification and deployment

- **17 new tests** exercise the Worker against real SQLite: 20 checkout retries, server prices, provider failure recovery, capability authorization, 20 webhook duplicates, full rollback on queue failure, each expected-value mismatch, tampered/stale signatures, unsupported version, transaction/event reuse, fail-closed configuration/rate limiting, request limits and expiry.
- With the existing compiled SDK integration/unit tests: **24 tests passed**. Full app TypeScript passed. Gateway D1-mode Vite build passed; its existing large-chunk warning remains and was not treated as a performance certification.
- Extracted the actual ZIP and ran Wrangler dry-run successfully. Applied its migration to **local** Cloudflare D1; verified all three tables and both settlement triggers. No hosted gateway database migration was needed for the starter.
- Visually checked desktop and 390×844 mobile storefront and order dialog. Increasing quantity 1→2 changes total 2→4 USDC; preview payment action is disabled. Inspected the creator setup dialog and restored normal viewport afterward.
- Published assets with main Testnet Worker version **24e7d546-1998-449d-98d3-19840df26cab**. Existing D1 binding, gateway rate limits, webhook-origin allowlist and Cron schedules are preserved. Reconciler remains **52d53de2-cfe4-4e24-840f-1c1218d99815**.
- Downloaded hosted ZIP and matched SHA-256 to the built artifact. `/api/health`, `/api/ready`, preview catalog, setup page and developer page returned HTTP 200. Confirmed public preview checkout is false and products render in the deployed browser.

## Scope and remaining work

This is an Arc Testnet starter, not a real-money marketplace certification. Tests use synthetic chain evidence; no new wallet payment was made for this release. Anonymous capabilities are limited to the creating browser session, with no email/account recovery. Merchant customer authentication/recovery and an idempotent delivery worker remain integration work. Demo products do not actually deliver files. Configure the store's own secrets, verified seller routing and operator-approved webhook origin before a hosted merchant E2E trial. Hosted load, independent security assessment, refunds, legal readiness and mainnet remain separate gates.

No Git push, wallet operation, paid service purchase, legacy Vercel/TiDB deletion or owner-deferred backup/alert action occurred. For gateway asset rollback, the previous version is `499a5902-a3b9-475c-8015-f40f4805359f`; a rollback removes the new public starter assets. Do not roll back the database just to revert these assets.
