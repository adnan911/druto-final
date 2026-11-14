# Seller receiving-wallet verification — 2026-09-28

Implemented locally; no deployment or existing seller data migration performed.

## Behavior

- New seller accounts start pending. New seller-scoped payment intents require active status and walletVerifiedAt.
- Authenticated account owners request a dedicated five-minute receiving-wallet challenge. The signed message identifies the configured origin, Arc testnet chain ID, account, owner, marketplace, seller, wallet, nonce and expiry. It is distinct from dashboard login signatures.
- EOA signatures are verified against the registered receiving wallet. A database transaction locks the seller and challenge, checks current ownership/status/address, consumes the unexpired unused challenge conditionally, and records verification plus activation together.
- Incorrect signatures, expiry, replay, account mismatch, non-owners and disabled accounts are rejected.
- Registration cannot transfer account ownership, claim unowned legacy accounts, change a receiving wallet, or reactivate disabled sellers. Existing-account updates use a conditional write to detect concurrent state changes.
- Operator approval requires an existing receiving-wallet proof.
- Onboarding UI prompts for the receiving-wallet signature before provisioning credentials. Cancelled verification leaves a pending account, with a retry action in the saved seller list.

## Validation

- Existing application suite passed (92 tests, one skipped before the five new cases).
- Updated marketplace suite passed all 19 tests, including five additional ownership/approval boundary cases.
- Real TiDB router scenario passed with pending payment rejection, wrong signer, expired proof, disabled seller, valid activation, replay rejection and cross-owner denial, in addition to earlier login/API-key/idempotency checks.
- Integration fixture uses database savepoints inside its outer rollback transaction, avoiding a nested BEGIN that could commit fixture records. Rollback cleanup verified.
- Audit suite passed all 14 cases; F01/F02/F07 assert prevention, remaining characterization cases still reproduce unresolved findings.

## Limits and follow-up

- This is EOA receiving-wallet verification, not Circle integration. ERC-1271/smart-contract wallet verification is not implemented.
- Ownership proof is not KYB, marketplace authorization, legal approval or sanctions clearance.
- Receiving-wallet replacement is deliberately blocked until a separate re-authentication, verification and audit workflow is implemented.
- Legacy demo routing remains a separate unresolved production gate; it is not covered by the seller proof requirement.
- Existing active sellers without proof will need verification before new scoped payment intents. Existing intents retain their original destinations; no retroactive edits were performed.
- Rate controls are incomplete. The existing challenge index limits creation to one challenge per account per second; duplicate issuance returns a retryable error. Broader abuse controls remain required.
- Concurrent independent-session verification has not been load-tested. Row locking and conditional consumption are implemented; the real database scenario currently tests sequential replay.
- Browser wallet UX, HTTP/cookie middleware, onchain settlement and end-to-end checkout remain unverified in this milestone.

No schema migration is needed: the existing ownershipChallenges table and walletVerifiedAt column are used.

Final checks: TypeScript passed; frontend production build and both API bundles succeeded; rebuilt handler smoke tests passed. Existing Node-version and oversized-bundle warnings remain.
