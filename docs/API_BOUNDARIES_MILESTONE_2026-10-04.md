# Druto API privacy, amount and idempotency boundaries — 4 October 2026

Implemented and validated locally. No hosted deployment, production environment change, seller activation or historical payment rewrite was performed.

## Public versus private order access

`payments.getIntent` now returns the explicit allowlist in `server/payment-intent-view.ts`. It includes payment ID, public item label, atomic amount, asset/network, merchant destination, status/hash, expiry, fee/split fields, return URL and verification origin. It excludes buyerLabel, orderContext, buyerAddress, externalOrderId, tenant/account identifiers, idempotency key and internal timestamps. Future schema columns are excluded by default. Even authenticated callers get this same public view.

`payments.getPrivateIntent` requires a session and either ownership of the intent's merchant account or the explicitly provisioned operator role. Unknown and non-owned records return NOT_FOUND. Ordinary users cannot retrieve unowned legacy intents. Both lookup routes set private/no-store caching headers. The dashboard details drawer uses the private route; public checkout/receipt use the public view and the payment ID as their reference. Buyer contact/shipping details stay in the marketplace's authorized order flow. Demo preview data remains synthetic.

Create-intent responses retain the caller's order/routing fields required by server integrations, plus checkout URL and exact decimal amount, but do not return buyerLabel/orderContext. Existing seller authorization precedes idempotency lookup. A later release-branch change requires a seller-scoped API key for every production intent and confines anonymous demo creation to non-production environments; that change still needs deployment and hosted verification.

**Public-field contract:** itemName and returnUrl are intentionally public, merchant-supplied checkout fields. Do not put buyer PII or secrets in those values. This change removes dedicated private fields; it cannot classify arbitrary private text embedded in a merchant's public label/URL. Return-URL ownership/allowlisting and overall tenant-role policy remain separate work.

## Amount policy

`shared/usdc-amount.ts` uses BigInt and enforces 0.000001–1,000,000 USDC inclusive, with at most six decimal places. This is a testnet engineering ceiling matching Luvre, not an approved business/mainnet limit. Whitespace, signs, exponent notation, zero, excessive precision, excessively long input and out-of-range values are rejected before database access. The shared converter independently enforces the same bounds. Decimal output uses integer division/remainder and is stable between initial creation and retry.

Existing oversized historical records were not rewritten. Retrying their creation through the new amount policy may require explicit reconciliation; public status lookup remains available. Agree a lower pilot/business cap before accepting actual business traffic.

## Scoped idempotency and real concurrency

New writes store `druto_v2_` plus a SHA-256 digest of a serialized tuple: fixed Arc testnet environment/chain/asset, create-intent operation, resolved marketplace/seller/merchant account, and the caller's case-sensitive key. The existing 128-character unique column can hold this 73-character value; no DDL, index change or migration is required. New networks/operations must explicitly use their own namespace; this is not generic multichain support.

API-key rotation does not change account scope. Exact same requests in the same scope converge on one persisted intent. Competing inserts use the database unique index as the arbiter; the loser reads and validates the committed winner. The retry comparison includes amount, item/order, tenant, asset/network, recipient, return URL, buyer label and semantically normalized order context. Different metadata cannot silently reuse a payment. Original expiry/fees/status are returned without extending or resetting them.

Historical raw keys are supported read-only when their exact key and resolved scope match. Another tenant's legacy row is ignored rather than disclosed or reassigned. The internal prefix is reserved for new client keys; historical ambiguous prefixed keys require reconciliation rather than silently creating another intent.

**Rollout constraint:** do not run old raw-key writers and new scoped-key writers concurrently against the same database. Drain/pause intent creation during the coordinated cutover, confirm every writer uses the new code, then resume. No key backfill/rewriting was performed. A rollback to old creation code can generate a second intent for a scoped key; stop creation and use a compatible forward fix instead. Preserve existing settlement/outbox evidence. Existing memory fixtures are not evidence of production concurrency guarantees.

## Verification

- Full Druto suite: 146 passed, 1 skipped, including 40 new amount/privacy/authorization/idempotency boundary tests and rebuilt API handler smoke tests. The final persisted-snapshot check exposed incomplete legacy demo test fixtures with no receiving wallet; fixtures now configure a synthetic wallet and the router explicitly rejects missing/invalid receiving configuration before insertion.
- Security audit: 14 passed. F08 and F10 now assert rejection/redaction; other characterization cases still reproduce unresolved findings, so this is not full security clearance.
- Real TiDB: 7 new committed intent-creation scenarios on independent restricted app connections plus 1 expanded router scenario. Covered same-key races, amount conflicts, independent tenants, immutable retry expiry/context, same-tenant legacy replay, cross-tenant legacy isolation and reserved-prefix rejection. Router coverage includes private owner access/cross-owner denial and two seller API keys using the same caller key. Synthetic committed records were removed by exact generated IDs; router fixtures rolled back.
- Luvre marketplace: 48 existing unit/API/SDK tests passed. Its strict session binding remains compatible with the create response fields; no live marketplace payment was sent.
- TypeScript and complete frontend/server/both API bundle build passed. Existing Node compatibility/large-bundle warnings remain. Test logs report missing OAuth configuration; OAuth was not validated.
- Logs: audit/build/api-boundaries-build.log and audit/build/api-boundaries-tests.log.

No actual-wallet browser flow, hosted E2E, full service outage, remote deployment or current seller/database inventory was claimed by these tests.

## Remaining work

Finish full authentication/tenant-role and challenge coverage, explicit payment-mode/fee policy, positive pilot limits, release/migration readiness, target-environment verified seller credentials, hosted delivery worker, and actual Arc-to-marketplace E2E/recovery. Circle wallets, rate limits, complete SSRF controls, refunds, reporting, external fulfillment and operational/legal gates remain open.
