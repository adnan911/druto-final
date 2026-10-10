# Druto dependency remediation — 2026-10-10

The latest production dependency audit reports **0 critical / 0 high / 3 moderate / 0 low**. The first pass reduced the original **1 critical / 26 high / 76 moderate / 10 low** to **0 critical / 0 high / 35 moderate / 9 low**; the second pass below reduced those 44 findings to three. These are registry advisory checks of the dependency graph, not proof that the application has no vulnerabilities.

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

## Second pass: moderate/low triage

- Removed the direct `streamdown` dependency. Its only source consumer was `AIChatBox`, used only by the unrouted `ComponentShowcase` demo. The demo now renders escaped plain text using React; it no longer supports formatted Markdown. Active checkout/dashboard routes did not use it. The lockfile no longer contains its Mermaid, DOMPurify, KaTeX or mdast rendering tree. `template.json` is an old scaffold snapshot, not the application dependency manifest.
- Added scoped overrides: `qs` 6.x to **6.16.0**, `body-parser` 1.x to **1.20.6**, `hono` 4.x to **4.13.7**, and `fast-copy` 3.x to **3.1.0**. Express parsing is used by the D1 app. The other updates patch retained transitive trees without a wallet SDK major migration.
- The registry reports three moderate findings covering **two distinct advisories**: `uuid` **8.3.2 and 9.0.1**, and `decode-uri-component` **0.2.2**. The reported paths enter through `@privy-io/react-auth` / x402 / older wallet connectors. They remain visible to `pnpm audit`; no advisory is suppressed.
- The [uuid advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq) concerns missing output-buffer bounds checks in the v3/v5/v6 APIs. Its compatible maintenance fix for 11.x does not establish compatibility with the installed 8.x/9.x parents; no blanket major override was applied.
- The [decode-uri-component advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) concerns CPU exhaustion from malformed encoded input. The patched **0.5.0** package is ESM-only, while installed `query-string` **7.1.3** uses CommonJS `require()` and expects a callable export. A direct transitive override would need explicit module-interoperability validation; it was not applied.
- D1 hides Privy login with `VITE_D1_WALLET_ONLY=true`, but `main.tsx` and `AccountLoginCard.tsx` still statically import Privy. Hiding the button is **not proof that the vulnerable code is excluded from browser output**. Follow-up: isolate/remove legacy Privy from the D1 frontend or upgrade its parent wallet tree with browser integration tests. This remains a release gate, not an accepted claim of harmlessness.
- Verification after the second pass: **221 tests passed, one skipped**; full and Cloudflare typechecks passed; Node **24.19.0** SDK/D1 build passed; all **11 local D1 smoke checks** passed; Wrangler dry run and diff whitespace check passed. SDK SHA-256 remained `a53f66e69006fd02f0804a063e9db4477631ee4283e2e0958c0e5c2a668ca237`. No new wallet payment was sent. Existing large frontend chunk and peer/deprecation warnings remain.
- Deployed second-pass Druto Arc Testnet Worker version **`355965d9-d95e-4dc7-be35-4addcf7b0105`**. Hosted health, readiness and developers routes returned 200; the existing receipt remained `succeeded`, `amountAtomic: "2000000"`, `platformFeeBps: 0`; the synthetic foreign-origin cookie POST returned 403. An initial ad-hoc receipt assertion used the wrong field name `feeBps`; corrected to the API's `platformFeeBps`, it passed without any application change. No new remote login, payment or database migration was performed. The separate reconciler Worker was unchanged.

Parser references: [qs advisory](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g), [body-parser advisory](https://github.com/advisories/GHSA-v422-hmwv-36x6). The current D1 body-size limit is the valid constant `1mb`; the parser patch still prevents retaining the vulnerable package version.

Session revocation, account-email alerts, capacity testing, old infrastructure retirement, and real-customer launch gates remain separate.

Primary advisory references: [Drizzle identifier escaping](https://github.com/advisories/GHSA-gpj5-g38j-94v9), [proxy-addr trusted subnet](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [ws fragment handling](https://github.com/advisories/GHSA-96hv-2xvq-fx4p), [lodash template imports](https://github.com/advisories/GHSA-r5fr-rjxr-66jc).
