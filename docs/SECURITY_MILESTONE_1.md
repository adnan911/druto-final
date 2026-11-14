# Security milestone 1 — local implementation

Implemented 2026-09-26. Not deployed. This is a bounded remediation, not production certification.

## Changes

- Removed unauthenticated `auth.directAccountLogin` and its email-only UI.
- Wallet and verified Privy login create ordinary users; duplicate login no longer grants admin.
- Wallet login uses the signing wallet identity. Merchant receiving addresses cannot select another user's identity.
- New sessions carry version 2 and issued-at; verification rejects older versions, another app ID, and legacy direct-account identities.
- Request authentication checks database identity consistency and ignores historical admin roles. Only the exact configured `OWNER_OPEN_ID` receives operator privileges. Do not configure an email or an unverified legacy account as this ID.
- Seller API keys require matching marketplace, seller and merchant account scope. Unlinked keys cannot create payment intents. The resolved account is pinned to the key's merchant account.
- Production database configuration is required; initialization failures cannot activate the demo memory database in production.
- Production session signing requires an explicit JWT secret of at least 32 characters. Generate it randomly; length alone is not entropy.

## Verification

- Application tests: 92 passed, 1 skipped, including 6 session-security cases.
- TypeScript check passed.
- Both Vercel API handlers and frontend production build succeeded; handler tests passed. Frontend build reports unsupported Node 22.11 and oversized chunks.
- Audit suite: 14 passed. F01 and F02 now assert prevention; remaining cases still demonstrate unresolved vulnerabilities. This is NOT 14 fixed vulnerabilities.
- No live authentication, transaction, database migration or deployment performed. User supplied the Druto and marketplace URLs; the web retrieval tool could not access them.

## Deployment prerequisites

- [ ] Select and provision durable MySQL-compatible database, configure TLS and apply reviewed migrations in staging.
- [ ] Establish verified operator identity and set exact `OWNER_OPEN_ID` in staging. Empty value deliberately gives nobody admin access.
- [ ] Set a randomly generated production JWT secret and rotate any credentials whose exposure is confirmed.
- [ ] Inventory existing users, seller ownership and issued API keys. Historical unsafe onboarding may have created unauthorized records; these changes do not repair them.
- [ ] Reissue seller-scoped credentials to legitimate marketplace integrations. Retest order creation with their actual routing IDs.
- [ ] Expect all existing sessions to require sign-in again. Old direct-email accounts require controlled identity/ownership migration; do not automatically link them by email or payout address.
- [ ] Run staging buyer → checkout → seller → dashboard flow before deployment.

## Unresolved work, in order

1. Wallet challenge atomic consumption, domain/purpose binding, rate limits and operator step-up authentication. Current wallet binding is not a complete account-linking design.
2. Verified seller onboarding, immutable tenant ownership, controlled payout-address changes, and API-key ownership/revocation after account reassignment.
3. Remove unauthenticated demo payment paths from production and replace demo memory data in integration tests with real database tests.
4. Correct payment state transitions, transfer-to-order binding, expiry rules, concurrent verification, duplicate settlement and dashboard reconciliation.
5. Protect public buyer/shipping data; fix webhook SSRF, durable outbox/retries and delivery observability.
6. Establish production deployment, backups, restore drills, monitoring and incident recovery. Upgrade Node to a supported version; current Vite build warns about Node 22.11.

## User decisions

- Live Druto: https://druto-final.vercel.app/
- Marketplace: https://luvrefranc.vercel.app/
- Database provider and operator authentication are not finalized.
- Circle Wallets is being evaluated; no Circle integration was added in this milestone.
- Initial recommendation: retain external EVM wallets and evaluate optional Circle user-controlled wallets to preserve seller transaction approval. Developer-controlled wallets give the backend control of fund movement and change this custody design.
- Official reference: https://developers.circle.com/wallets/account-types . Arc production availability and country eligibility require separate verification before launch.

Pre-edit snapshots of touched implementation/bundle files are stored in ignored `audit/baseline/security-20260926/`; pre-existing application changes were retained.
