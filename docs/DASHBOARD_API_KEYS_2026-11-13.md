# Dedicated API key console — 13 November 2026

Status: implemented locally; not pushed/deployed in this task.
Route: /dashboard?section=keys. DEV sample: /dashboard?preview=dashboard&section=keys.

API Keys no longer redirects to seller onboarding. It has its own navigation
entry and preserves section URLs on refresh/back.

Implemented:
- Active verified seller selection; merchantAccountId supplied on UI creation.
- Existing authenticated create/list/revoke APIs; ownership remains server-enforced.
- Masked key ID, seller scope, creation/last-used date and lifecycle.
- Legacy unscoped keys distinguished; no new unscoped creation through this UI.
- In-memory one-time reveal, explicit copy, saved acknowledgement before hide.
- beforeunload warns while reveal is open. In-app navigation still loses the
  secret as the screen explains.
- Creation mutation uses gcTime 0 and reset; secret is not put in list-query
  cache, localStorage or URLs. This is not a memory-zeroization guarantee.
- Synchronous in-flight guard prevents duplicate create submissions.
- Revoke confirmation requires the exact selected key name and shows masked
  credential/seller. Revocation does not change wallets, sign out sessions,
  rotate webhook secrets or delete payment history.
- Error/loading/empty/no-verified-seller/stale-list states.
- Existing light/dark design and mobile record layout.
- DEV fixtures contain masked metadata only and reject every mutation.

Validation:
- 12 tests passed across the D1 lifecycle, key material, existing key router
  and DEV transport isolation. The 5-test D1 suite was rerun after adding an
  existing-payment preservation assertion and passed.
- TypeScript and Vite D1 frontend build passed; existing large-chunk warning remains.
- One browser batch: desktop dark/light 1440x1000 and mobile light 390x844.
  One heading, zero overflow, two masked records, verified seller options only,
  disabled DEV create/revoke, no reveal secret, section links/back all passed.
- One static design scan; not a parsed accessibility/security certification.
- No production key was created/copied/revoked. Signed-in hosted create/revoke
  and browser reveal/confirmation flows still need controlled release smoke
  testing; server lifecycle was tested against local SQLite.
- Precise DEV-fixture production scan passed.

Next priorities: Developer hub checklist, Reports, real Sandbox, Risk controls.
The full product roadmap and paused security audit are not declared complete.