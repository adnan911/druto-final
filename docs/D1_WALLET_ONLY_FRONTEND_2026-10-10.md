# D1 wallet-only frontend — 2026-10-10

The frontend now uses the existing EVM wallet challenge and Druto cookie session without a Privy browser provider. This completes the remaining dependency-tree remediation: `pnpm audit --prod` reports **0 critical, 0 high, 0 moderate, 0 low** at this check. An empty registry advisory report does not prove application security or production readiness.

## Changes and scope

- Removed `@privy-io/react-auth` from the application manifest and lockfile, along with its legacy x402/wallet tree. The affected uuid and decode-uri-component packages are no longer in the lockfile; no major-version override or advisory suppression was used. Removed the now-unused hono and fast-copy overrides.
- Removed Privy initialization, token exchange and logout hooks from `main.tsx`, `AccountLoginCard`, `Home` and the shared `useAuth` hook. Sidebar no longer calls `usePrivy()` without a provider. Dashboard access still depends on the server's `auth.me` result; connecting a wallet alone does not grant a session. Server logout is called directly.
- The current frontend no longer offers email/social/embedded-wallet login, including non-D1 builds from this branch. D1 already disabled these routes; its EVM signature login is retained. This does not modify the old deployed Vercel frontend. The legacy backend Privy verifier and its tests remain for separate retirement; the D1 `privyLogin` endpoint remains disabled.
- Added an explicit optional `window.ethereum` declaration using viem's EIP-1193 provider type, replacing an accidental transitive type declaration from Privy. Checkout now gives a reconnect error if the injected provider disappears before transaction submission. This is not a new wallet integration or a guarantee of support for every EVM wallet.
- Added a D1 Vite bundle policy that examines every emitted JavaScript chunk, including lazy chunks, and rejects retired Privy/x402/URI-decoder modules. The actual D1 build checked **585 emitted modules** successfully. This is a narrow regression guard, not a general vulnerability scanner.
- Tightened `pnpm audit:prod` from the high-severity threshold to **low**, so future known low/moderate production advisories also fail the gate.

## Validation

- **230 tests passed, one existing Privy live test skipped.** New tests render anonymous, loading and verified-wallet dashboard states without a Privy provider, and verify bundle-policy rejection including lazy chunks. These are server-rendered component tests, not an interactive wallet extension test. Vitest now uses the same automatic JSX runtime as the application's React plugin.
- Full application and Cloudflare TypeScript checks passed.
- SDK and D1 frontend builds passed using bundled Node **24.19.0**. SDK archive SHA-256 remains `a53f66e69006fd02f0804a063e9db4477631ee4283e2e0958c0e5c2a668ca237`.
- Main JavaScript decreased from approximately **1,186.44 kB / 333.91 kB gzip** to **990.20 kB / 280.30 kB gzip**. The existing large-chunk warning and remaining peer/deprecation warnings still need separate maintenance.
- **12 local D1 smoke checks passed**, including wallet signature/replay handling, seller ownership, cookie-only session delivery, seller API keys, checkout idempotency, reporting, key revocation and logout. Logout clears the cookie and subsequent seller reads return 401. This does **not** prove revocation of a copied JWT; server-side session revocation remains open.
- Wrangler D1 deployment dry run and `git diff --check` passed. No database migration, new hosted wallet signature or onchain transfer was performed.
- Deployed Druto Arc Testnet Worker version **`4f7a8185-e132-42de-8aae-ba1771a619d6`**. Hosted health, readiness, dashboard and developers routes returned 200. Downloaded main JavaScript matched the local tested asset by SHA-256 (990,196 bytes). Anonymous `auth.me` returned null; the existing 2 USDC receipt remained succeeded with 0 bps; a foreign-origin cookie POST returned 403. These hosted checks do not replace a fresh user-controlled wallet login/payment test. The separate reconciler was not redeployed.

## Next release gates

1. Shorter session lifetime and server-side revocation; define how existing Testnet sessions are invalidated.
2. Cloudflare account-email alert remains deferred by the owner.
3. Capacity/backup/restore exercises and retirement of the old Vercel/TiDB setup remain open.
4. Any real-money launch still requires separate payment lifecycle, operational and jurisdiction-specific review.

Git push remains deferred by the owner.
