# Druto dependency remediation — 2026-10-10

The production dependency audit changed from **1 critical / 26 high / 76 moderate / 10 low** to **0 critical / 0 high / 35 moderate / 9 low**. This is a registry advisory check of the dependency graph, not proof that the application has no vulnerabilities. The 44 remaining moderate/low findings require a separate review, particularly the markdown/rendering and legacy wallet dependency trees.

## Changes

| Package | Previously resolved | Patched version | Scope |
| --- | --- | --- | --- |
| drizzle-orm | 0.44.7 | 0.45.2 | Direct D1/MySQL query library |
| axios | 1.12.2, 1.16.0 | 1.20.0 | Direct dependency and affected 1.x transitives |
| nanoid | 5.1.6 | 5.1.16 | Direct identity/challenge generation |
| proxy-addr | 2.0.7 | 2.0.8 | Express transitive |
| path-to-regexp | 0.1.12 | 0.1.13 | Express transitive; retained 0.1 API family |
| lodash / lodash-es | 4.17.21 | 4.18.0 | Existing 4.x transitives |
| ws | 8.18.0, 8.18.3 | 8.21.0 | Existing 8.x transitives |
| form-data | 4.0.4 | 4.0.6 | Existing 4.x transitive |

Direct updates are pinned. Transitive overrides match only the affected major/version range and should be removed when parent dependency updates naturally resolve the patched versions. No major wallet SDK migration or database schema migration was made. Installs used `--ignore-scripts`; the checked-in lockfile was then installed with `--frozen-lockfile`.

`pnpm audit:prod` is the repeatable high/critical advisory gate. Moderate/low findings are not suppressed or allowlisted. Some existing peer/deprecation warnings remain (Privy/wallet dependencies, Vite plugin, and Recharts), and require planned updates rather than blind major upgrades.

## Verification

- 221 tests passed, one existing test skipped.
- Full application and Cloudflare TypeScript checks passed.
- SDK archive rebuilt with the same SHA-256 as before; D1 frontend build passed using bundled Node **24.19.0**. The system Node **22.11.0** is still below Vite's stated supported floor; use the supported runtime for builds. Global Node was not changed.
- Wrangler deployment dry run passed.
- A separate **local-only** D1 store accepted all existing schema migrations. The local Worker smoke test passed wallet sign-in, challenge replay rejection, seller ownership, token-free login JSON, API key creation, cookie-free server checkout, idempotent retry/conflict, public lookup, seller reporting, and API key revocation. All generated identities were disposable test identities; no remote data or onchain funds were changed.
- The smoke helper now supplies the browser Origin for cookie-backed mutations. Replay checks require the expected 400/409 response so a CSRF 403 cannot falsely count as successful replay protection.
- `pnpm audit:prod` returned exit 0 at the high/critical threshold and reported the remaining 35 moderate / 9 low findings.
- Deployed Druto Arc Testnet Worker version `4e5ab4c1-524e-4e55-ac18-35c40f380f22`. Hosted health, readiness and developer page returned 200; the existing `pi_nXi5jBv0Bxe4` public receipt still returned `succeeded`, 2 USDC and 0 bps. A foreign-origin cookie POST returned 403. No new hosted wallet login or onchain payment was performed in this pass.

The next dependency pass should triage the remaining DOMPurify/markdown/Mermaid, query-parser, and legacy wallet-tree findings against actual D1 bundle reachability. Session revocation, account-email alerts, capacity testing, old infrastructure retirement, and real-customer launch gates remain separate.

Primary advisory references: [Drizzle identifier escaping](https://github.com/advisories/GHSA-gpj5-g38j-94v9), [proxy-addr trusted subnet](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [ws fragment handling](https://github.com/advisories/GHSA-96hv-2xvq-fx4p), [lodash template imports](https://github.com/advisories/GHSA-r5fr-rjxr-66jc).
