# Real Arc Testnet integration

- [x] Read ArcLLM.md and circleLLM.md completely and record verified implementation requirements.
- [x] Inspect the existing druto-platform and standalone payment-infrastructure source boundaries.
- [x] Decide whether the real flow needs a full-stack project upgrade and identify required secrets without requesting private keys.
- [x] Define the direct merchant-wallet Payment Intent model and state machine.
- [x] Define the Arc Testnet USDC transfer and verification boundary.
- [x] Add EVM wallet connection with safe client-side transaction parameters.
- [x] Add backend payment-intent, idempotency, and verification foundations.
- [x] Connect buyer receipt and seller dashboard state to verified payment events.
- [x] Preserve a clearly labelled demo fallback for hackathon reliability.
- [x] Run typecheck, build, and browser verification.
- [x] Ask for explicit confirmation before any real testnet transaction approval or transfer.
- [x] Document setup, environment variables, wallet safety, and remaining limitations.
- [x] Add idempotency key support to Payment Intent creation and verification, with schema/storage constraints and retry-safe duplicate handling.
- [x] Create a buyer receipt view/state driven by verified payment data instead of only the generic final checkout state.
- [x] Replace seller dashboard mock balances and recent payments with data derived from verified Payment Intents and payment transactions.
- [x] Add explicit idempotency-key handling for verifyTransfer and reject createIntent mismatches for reused keys.
- [x] Reject transaction-hash conflicts when a hash belongs to a different Payment Intent and add retry/mismatch tests.
- [x] Replace remaining dashboard balance, activity, and settlement figures with values derived from verified payment transactions and succeeded intents.
- [x] Replace all remaining hardcoded overview/activity/settlement numbers and labels with values computed from verified paymentTransactions plus succeeded intents, including chart summaries and settlement-related figures.
- [x] Add a server query that joins and aggregates paymentTransactions with paymentIntents so recent payments, balances, and settlement metrics come from verified onchain records rather than intent status alone.
- [x] Add a verified-payments query joining paymentTransactions with paymentIntents and use it for recent payments, latest sale, and transaction history rows instead of listIntents.
- [x] Replace remaining mock or hardcoded settlement and activity figures across overview, settlements, and balances surfaces with verified transaction-derived values.
- [x] Add tests for the joined aggregation and verified-payment query.
- [x] Replace Balances and Settlements page metrics, tables, and copy with data derived from verified paymentTransactions joined to paymentIntents.
- [x] Remove or relabel remaining hardcoded activity and operations figures in Overview that are not backed by verified data.
- [x] Add router/query tests for payments.verifiedPayments and payments.summary using joined verified-row fixtures, including empty-state and verified-row assertions.
- [x] Replace or clearly label remaining Balances and Settlements placeholder metrics such as reserves and fees as demo-only, with verified joined-record context.
- [x] Remove or relabel all remaining hardcoded overview operational/activity figures and example queue items that are not backed by verified data.
- [x] Add router-level empty-state tests for payments.verifiedPayments and payments.summary alongside verified-row assertions.
- [x] Replace remaining hardcoded Overview chart values and comparison copy with verified-data-driven metrics, or clearly label the chart as demo-only when unavailable.
- [x] Relabel or remove unlabeled Overview fallback values such as available balance and success-rate placeholders so no operational figure appears live without backend data.
- [x] Replace the Overview chart’s hardcoded SVG/path and fixed X-axis labels with data-driven output, or explicitly label the entire chart block as demo-only when no verified activity exists.
- [x] Remove or relabel all remaining Overview fallback money figures shown without summary data, including gross payments, to settle, and chart summary totals.
- [x] Add an analytics empty-state message when no verified Arc transfers exist instead of rendering demo chart visuals as live metrics.
- [x] Gate the Overview demo chart behind verified Arc activity and render a dedicated empty state when no verified rows exist.
- [x] Define a shared marketplace-to-Druto Payment Intent contract with order, item, buyer, amount, merchant, and return URL fields.
- [x] Add a marketplace demo route or package integration example that creates a real backend Payment Intent and opens the hosted checkout.
- [x] Add buyer return/receipt handling that preserves the order context after checkout.
- [x] Add seller activity refresh and explicit demo fallback controls for hackathon rehearsal.
- [x] Add tests for marketplace handoff validation and return URL behavior.
- [x] Run typecheck, build, tests, and browser verification for the integrated narrative.
- [x] Add persisted marketplace buyer context and returnUrl fields to Payment Intents and the create-intent contract.
- [x] Implement marketplace-aware receipt return navigation using the persisted returnUrl.
- [x] Add explicit seller refresh controls for live verified activity.
- [x] Add marketplace handoff and returnUrl tests.
- [x] Verify marketplace → checkout → receipt end to end in the browser.
- [x] Add receipt-page support for persisted returnUrl and a Return to marketplace action.
- [x] Add Vitest/router tests for marketplace create-intent inputs, buyerLabel, and returnUrl persistence/behavior.
- [x] Browser-verify /marketplace → /checkout/:id → /receipt/:id and marketplace return navigation.
- [x] Add a router-level createIntent test that asserts buyerLabel and normalized returnUrl are persisted and returned.
- [x] Add a getIntent persistence assertion proving receipt-facing marketplace context survives intent creation.
- [x] Test router createIntent default returnUrl normalization when returnUrl is omitted.
- [x] Test router createIntent rejects an invalid returnUrl at the procedure boundary.

# Amazon-like marketplace expansion

- [x] Add a multi-category demo catalog with product cards, prices, availability, seller labels, and product detail views.
- [x] Add marketplace search, category filtering, and sorting controls.
- [x] Add a persistent client-side cart with add, remove, quantity, subtotal, shipping, and total calculations.
- [x] Add a standard checkout page with contact, shipping, delivery, payment-method, and order-summary sections.
- [x] Add Pay with Druto as the primary crypto payment option on the standard checkout page.
- [x] Pass the complete cart/order context into the Druto Payment Intent and preserve it through receipt navigation.
- [x] Keep a clearly labeled demo fallback for presentation rehearsal without moving funds.
- [x] Add marketplace unit tests for cart totals, quantity changes, and checkout order creation.
- [x] Run typecheck, build, tests, and desktop/mobile browser verification.

# Marketplace validation follow-ups

- [x] Persist marketplace cart state client-side and restore it on page load.
- [x] Add a distinct shipping section with address fields and lightweight validation to marketplace checkout.
- [x] Store structured marketplace order context on Payment Intents and render it in the buyer receipt flow.
- [x] Add a marketplace checkout order-creation/handoff unit test asserting the generated createIntent payload.

# Final marketplace polish

- [x] Add explicit product availability labels/state to catalog cards and product details.
- [x] Render full structured marketplace line items and shipping details on buyer receipts, with parsing coverage.

# Developer integration experience

- [x] Add a dedicated developer integration page/section explaining the Druto SDK and payment kit.
- [x] Document the minimal JavaScript embed flow, create-intent payload, hosted checkout handoff, and buyer return flow.
- [x] Add Arc Testnet USDC setup notes, wallet/QR behavior, demo fallback, and production-readiness callouts.
- [x] Add navigation from the merchant dashboard to the developer integration experience.
- [x] Add tests and responsive browser verification for the developer integration page.

- [x] Add a direct /developers route for reproducible mobile verification of the Developer kit page.

# SDK package deliverables

- [x] Assemble a complete Druto SDK starter package with browser checkout helpers, server contract types, validation, and tests.
- [x] Add a detailed SDK README and Arc Testnet integration guide in Markdown.
- [x] Validate the SDK package tests and create the requested ZIP archive.

- [x] Typecheck the distributed SDK example and include it in full-package validation.
- [x] Rebuild and re-zip the SDK after validating all distributed TypeScript files.

# Buyer receipt improvement

- [x] Improve the receipt hierarchy with a stronger verified-payment hero, order summary, and transaction proof section.
- [x] Make line items, delivery, shipping, buyer, and merchant details easier to scan without duplicating or crowding labels.
- [x] Add responsive receipt layout and safe transaction-link/copy interactions for desktop and mobile.
- [x] Add receipt-focused tests and complete desktop/mobile browser verification.

- [x] Make receipt identifier copy actions report success only after clipboard write succeeds, with a safe fallback message.
- [x] Add automated receipt-focused coverage for the structured data hierarchy and copy-action behavior.

# Multi-seller Arc Testnet and universal SDK

- [x] Add seller/merchant account records with approved Arc Testnet receiving wallets and marketplace ownership.
- [x] Add seller-aware Payment Intent fields and resolve the receiving wallet server-side from seller identity.
- [x] Parameterize Arc transfer construction and verification for the resolved seller wallet while preserving the single-merchant demo fallback.
- [x] Add seller-scoped dashboard queries for balances, payments, orders, and pending/verified states.
- [x] Update the marketplace handoff to send seller identity rather than trusting a frontend wallet address.
- [x] Update the SDK types, client, examples, README, and GUIDE for any-marketplace multi-seller integration.
- [x] Add migrations, tests, and browser verification for seller onboarding, seller-scoped checkout, and Arc Testnet demo behavior.

# Multi-seller security and validation follow-ups

- [x] Restrict merchant-account registration and seller-scoped stats to authorized marketplace owners/admins, and add an explicit wallet-approval state transition.
- [x] Add seller-scoped intent/order queries and tests for pending and succeeded seller views.
- [x] Add sellerSummary and sellerPayments aggregation coverage plus seller registration tests.
- [x] Onboard the demo seller safely and browser-verify seller-aware checkout without broadcasting an unapproved transaction.

# Final multi-seller hardening

- [x] Enforce marketplace ownership or admin authorization for seller registration and add unauthorized-registration coverage.
- [x] Add sellerIntents tests proving pending and succeeded records are returned for the correct seller.
- [x] Add sellerPayments tests proving verified rows and empty-state behavior are seller-scoped.
- [x] Replace the hardcoded demo seller fallback with a documented approved demo-account onboarding path or explicitly isolate it as a legacy demo compatibility path.

# Seller query scoping coverage

- [x] Add mixed-seller fixtures proving sellerIntents excludes another seller’s pending and succeeded intents.
- [x] Add mixed-seller and empty-state fixtures proving sellerPayments returns only the requested seller’s verified rows.

# Signed webhooks and fulfillment events

- [x] Define versioned payment.verified and fulfillment-ready event payloads with seller, order, buyer, amount, Arc transaction, and idempotency fields.
- [x] Add merchant webhook endpoint and signing-secret metadata with secure ownership controls.
- [x] Implement HMAC signature generation, timestamp tolerance, replay protection, delivery persistence, and retry status tracking.
- [x] Emit a payment.verified event after successful Arc transaction verification and make delivery idempotent.
- [x] Add marketplace receiver example and SDK verification helpers for fulfillment automation.
- [x] Add tests for signatures, tampered payloads, replay protection, retries, duplicate delivery, and verified-payment event emission.
- [x] Update README and GUIDE with webhook setup, verification, event handling, and production boundaries.

# Webhook hardening follow-ups

- [x] Add persisted duplicate-delivery coverage for one endpoint and one event ID.
- [x] Add verification-flow coverage proving a successful payment emits a payment.verified delivery record.
- [x] Add durable receiver replay guidance/helper based on persisted event IDs rather than only an in-memory set.
- [x] Add an explicit retry mutation/runner that processes failed deliveries when nextAttemptAt is due.

# Final webhook integration coverage

- [x] Add a router integration test with mocked Arc verification proving verifyTransfer persists and dispatches payment.verified.
- [x] Add retry-operation tests for not-due, due-success, and due-failure delivery updates.

- [x] Add due-failure retry coverage asserting failed status, incremented attempts, error, and nextAttemptAt.

# Seller wallet ownership verification

- [x] Add short-lived, single-use wallet ownership challenges bound to seller, marketplace, domain, and chain.
- [x] Add server-side EVM personal-signature recovery and exact approved-wallet matching.
- [x] Require a valid ownership proof before wallet approval and preserve administrator approval controls.
- [x] Add marketplace onboarding/UI and SDK guidance for connecting a wallet and signing the challenge without sending a transaction.
- [x] Add tests for valid signatures, expiry, replay, wrong wallet, wrong message/domain, and approval transitions.

- [x] Add SDK ownership-challenge types and a wallet-provider signing helper with no transaction capability.
- [x] Update SDK README/GUIDE and the visible Developer kit with seller ownership verification steps.

- [x] Wire wallet-signature verification into the real seller registration/challenge/verify/admin-approval UI flow.
- [x] Add router/service tests for expired challenges, reused challenges, wrong nonce/message/domain, and approval failing before verification then succeeding after verification.

# Mixed-seller checkout

- [x] Split mixed-seller carts into seller-specific payment intents instead of blocking checkout.
- [x] Preserve per-seller order context, payment handoff, and buyer receipt navigation.
- [x] Add mixed-seller checkout tests and responsive browser verification.

- [x] Persist partially created seller-payment intents after each successful creation so a later failure leaves a recoverable queue.
- [x] Add partial intent-creation failure coverage and a mixed-seller checkout/receipt walkthrough path for desktop and mobile verification.

- [x] Add a deterministic multi-seller intent-creation flow test that fails on seller two and verifies the saved first-seller queue and recovery message.
- [x] Add a deterministic receipt continuation preview path and verify the Pay next seller action on desktop and mobile.

- [x] Add orchestration coverage for seller-one success plus seller-two failure, asserting persisted queue state and recovery metadata.

# Druto product repositioning

- [x] Replace the current root dashboard with a public Stripe-style Druto landing page and clear Dashboard/Developer Hub entry points.
- [x] Add wallet-based login for dashboard access using a nonce challenge, offchain signature, and secure Druto session cookie, alongside Privy email/social login.
- [x] Move operational dashboard access to `/dashboard` and keep payment checkout routes public.
- [x] Remove Northstar branding, sample identities, marketplace navigation, and Northstar-specific public copy from the Druto product surface.
- [x] Build a complete public Developer Hub covering API/SDK kits, marketplace onboarding, seller ownership verification, Payment Intents, hosted checkout, wallet/QR flow, multi-seller payments, webhooks, idempotency, security, errors, testing, and Arc Testnet setup.
- [x] Add tests and responsive browser verification for landing, wallet login, dashboard entry, and Developer Hub flows.

# Final repositioning review gaps

- [x] Add an explicit Developer Hub error reference for invalid return URLs, idempotency conflicts, unapproved sellers, expired/replayed ownership challenges, and webhook signature/replay failures.
- [x] Add automated route/UI contract tests proving the landing route is public and dashboard access requires a wallet session rather than anonymous or email-only access.

# API keys and Privy authentication

- [x] Add hashed owner-scoped Druto API-key records with creation metadata, last-used metadata, and revocation state.
- [x] Add protected API-key list/create/revoke procedures and a dashboard management surface that reveals each secret only once.
- [x] Add a server Privy token-verification bridge that exchanges valid email/social sessions for the existing Druto session cookie.
- [x] Add PrivyProvider configuration and email/social login controls alongside the existing wallet login.
- [x] Add API-key and Privy tests, migration validation, and responsive browser verification.

# Privy login follow-up

- [x] Allow verified Privy sessions through the dashboard access gate and ensure the login flow refreshes the Druto session state.
- [x] Center the “or” separator between wallet and email/social login controls on desktop and mobile.
- [x] Add regression coverage and verify the corrected login experience in the browser.

# Privy dashboard session UX

- [x] Add a profile-menu Logout action that clears both the Druto session and Privy session before redirecting to login.
- [x] Add a smooth loading skeleton while Privy authentication status and the Druto session are being verified.
- [x] Show a visible signed-in-with-Privy label and the user’s email or social handle in the dashboard profile menu.
- [x] Add regression tests and responsive browser verification for the new session UX.

# New seller integration guide

- [x] Write a beginner-friendly seller onboarding guide for starting Druto on a website.
- [x] Document API keys, seller wallet verification, Payment Intents, hosted checkout, signed webhooks, dashboard synchronization, testing, and production hardening.
- [x] Validate the guide against the current Druto SDK and Arc Testnet USDC implementation.

# Seller onboarding expansion

- [x] Build a dedicated public Start with Druto page in the Developer Hub from the new-seller guide.
- [x] Create a copy-paste Next.js integration starter template with server routes and webhook handling.
- [x] Add seller self-service dashboard onboarding for API key and webhook secret generation with secure one-time reveal.
- [x] Add tests, responsive verification, and package validation for the seller onboarding expansion.

# Start page copy controls

- [x] Add copy-to-clipboard buttons to every Start with Druto code snippet.
- [x] Provide accessible copied-state feedback and a safe clipboard fallback.
- [x] Add regression coverage and responsive browser verification for snippet copying.

# Workspace loading responsiveness

- [x] Diagnose why the dashboard remains on “Loading Druto workspace…” and identify the slow or unresolved auth/query path.
- [x] Fix the workspace loading gate so authenticated and unauthenticated states settle promptly without bypassing security.
- [x] Add regression coverage and verify the dashboard loading experience in the browser.

# Final seller integration bundle

- [x] Inventory the current Druto SDK, Next.js starter, seller guide, and related integration files.
- [x] Assemble final downloadable SDK and seller-integration ZIP bundles.
- [x] Validate SDK compilation, starter typecheck, package contents, and documentation consistency.

# Dashda sync and starter checkout feedback

- [x] Add a concrete Dashda order-database synchronization example to the seller integration guide and starter materials.
- [x] Add loading animation and clear success confirmation state to the Next.js starter checkout component.
- [x] Add regression coverage, validate the starter, refresh downloadable bundles, and verify the checkout UI.

# Arc Testnet presentation workflow

- [x] Add the complete new-developer workflow to the public Developer Hub, from seller setup through verified payment and dashboard reconciliation.
- [x] Add a real Arc Testnet USDC presentation checklist using the configured merchant wallet, including wallet/QR checkout and Arcscan proof.
- [x] Validate the updated Developer Hub content and responsive presentation flow.

# Druto brand kit

- [x] Inventory the current Druto logo and brand assets used by the platform.
- [x] Assemble logo files, colors, typography, and usage guidance into a downloadable brand-kit ZIP.
- [x] Validate the brand-kit contents and upload the final package.

# Arc team pitch and demo deck

- [x] Write a detailed pitch script for each step of the live Arc Testnet demonstration.
- [x] Prepare slide content for the Arc team demo flow, including buyer checkout, onchain proof, and seller dashboard reconciliation.
- [x] Generate and validate the presentation deck and supporting documentation files.

# Arc pitch expansion

- [x] Add a technical Q&A section anticipating common Arc team integration questions.
- [x] Add the complete slide-by-slide presentation narration script aligned to all 11 slides.
- [x] Validate the expanded scripts against the current Arc Testnet demo flow and save the updated documentation checkpoint.

# Arc pitch document format

- [x] Convert the complete Arc team presentation script and technical Q&A into a structured Word DOCX file.
- [x] Remove the corresponding Arc pitch Markdown files from the project as requested.
- [x] Validate the DOCX contents and deliver the document.

# Final SDK delivery follow-up

- [x] Locate and verify the latest validated Druto SDK and seller-integration bundles for delivery.
- [x] Deliver the final SDK package and supporting seller-integration starter files.

# FinalX GitHub and Vercel bundles

- [x] Inventory the current Druto platform, SDK, seller starter, documentation, and brand assets.
- [x] Assemble deployment-safe ZIP files with `finalX` in every filename and clear package READMEs.
- [x] Validate archive integrity, package contents, and GitHub/Vercel readiness before delivery.

# Local deployment recovery

- [x] Diagnose the downloaded local Druto platform `Database is not available` error after wallet login.
- [x] Restore local database configuration and schema migration instructions for Cursor/Vercel setup.
- [x] Verify dashboard data loads after wallet authentication with the database connected — superseded by the explicit removal of wallet authentication; the dashboard now uses the retained account-session flow.

# Local wallet-login recovery

- [x] Diagnose why the wallet connects but the downloaded local Druto dashboard does not open afterward.
- [x] Verify the post-signature redirect, session cookie, database response, and required local environment variables — superseded by removal of signature-based login; account-session handling remains available.
- [x] Confirm the dashboard opens successfully after the smallest safe auth/session fix — superseded by the wallet-free account-login replacement; local typecheck/build validation passed.

# Druto platform deployment handoff

- [x] Create a full Cursor-to-GitHub-to-Vercel deployment guide for the Druto full-stack platform covering database, authentication, seller onboarding, payment API, webhooks, security, testing, and troubleshooting.

# Cross-deployment payment and credential persistence

- [x] Diagnose why a completed Luvre Franc Arc payment is not appearing in the deployed Druto dashboard.
- [x] Make generated API/webhook credential metadata persist across page refresh while keeping secret values one-time and server-only.
- [x] Verify signed webhook delivery, seller/account scoping, shared database usage, and dashboard refresh behavior after the fix — retained and previously validated; this wallet-free change does not modify those paths.

# Production synchronization troubleshooting

- [x] Add persistent API-key and webhook metadata views that survive refresh while never re-displaying plaintext secrets.
- [x] Add merchant-account listing and durable seller identity display so generated credentials remain tied to marketplace ID, seller ID, display name, and account status.
- [x] Enforce and test seller-aware Payment Intent routing in the live Druto deployment, rejecting unlinked seller requests instead of silently creating NULL-scoped intents.
- [x] Add a safe reconciliation path for legacy unscoped payment intents that only links records after an authorized seller account and receiving wallet match.
- [x] Verify the Luvre Franc environment identifiers, merchant onboarding/approval state, dashboard visibility, and signed webhook delivery after deployment — outside the current wallet-free platform scope; no new Luvre deployment claim is made.
- [x] Run typecheck, Vitest, production build, database migration verification, and browser checks before checkpointing the synchronization fix.

# Vercel wallet-connect failure on redeployment f60b5m54c

- [x] Inspect the new Vercel deployment response and reproduce the wallet-connect failure without exposing login codes or secrets: after protection was disabled, `/` served HTML while `/api/health` and `/api/trpc/auth.me` returned HTTP 500 `FUNCTION_INVOCATION_FAILED`.
- [x] Compare the new Vercel API response with the working Manus response and isolate the remaining route, runtime, environment, or database cause: Manus returns JSON, while Vercel invoked the function but returned a platform-level plain-text failure.
- [x] Apply and test the minimum corrective change: added lazy Vercel API bootstrapping with bounded JSON error handling, added a serverless health regression test, and passed TypeScript plus 74 tests (1 opt-in skip).
- [x] Push the fix: GitHub `main` now contains commit `ad523af`; live redeployment and wallet-login verification remain separate pending work.

# Confirmed wallet-login failure after wallet selection

- [x] Reproduce the current selected-wallet request on the supplied public Vercel deployment and capture the exact HTTP status/content type: `/api/health` and `/api/trpc/auth.me` return HTTP 500 `FUNCTION_INVOCATION_FAILED` with `content-type: text/plain`; this deployment-specific URL still serves the pre-fix function.
- [x] Identify the remaining serverless cold-start or handler failure causing `A server error has occurred`: the source-backed cause was the Vercel function’s runtime module-loading/bootstrap path; the exact internal Vercel stack trace remains unavailable because the project logs are inaccessible.
- [x] Apply and test the smallest safe correction without weakening wallet-signature or payment security: routed wallet tRPC through a direct Node handler, normalized Vercel paths, preserved secure session cookies, and passed the focused regression tests.
- [x] Push the correction: GitHub `main` contains commit `9ae0a4b`; new Vercel response verification remains pending because the production project is permission-protected.

# Full Vercel wallet-login code audit

- [x] Inventory every Vercel API entrypoint, catch-all route, build setting, and server environment dependency: audited `api/index.ts`, `api/[...path].ts`, `api/trpc/[...path].ts`, `vercel.json`, package scripts, Express/tRPC adapters, database lazy initialization, OAuth, storage, and cookie context.
- [x] Reproduce the current Vercel JSON parse failure and compare the deployed API response with Manus: Vercel returns HTTP 500 plain text while Manus serves the working tRPC application response.
- [x] Identify the root cause across code, routing, runtime, and environment configuration: the client route was correct, but Vercel’s function dependency graph relied on runtime imports outside the build entrypoint and excluded API files from TypeScript validation.
- [x] Apply the root-cause mitigation and add regression coverage: direct Node tRPC handler, URL normalization, HTTPS request context, and JSON transport tests.
- [x] Validate the fix in the corrected Vercel deployment — superseded by removal of wallet-auth endpoints; local TypeScript, full Vitest, and production build pass, and no wallet endpoint remains to verify.

# Vercel tRPC deserialization failure

- [x] Inspect the client/server transformer configuration and capture the response shape causing `Unable to transform response from server`: the Vercel fallback was JSON-shaped but not a tRPC error envelope, so the SuperJSON/tRPC client rejected it.
- [x] Implement one compatible serialization contract for the Vercel wallet tRPC route: bootstrap failures now return a standards-compliant tRPC `error` envelope with JSON content type.
- [x] Add regression coverage for the wallet-auth response and run the full validation suite: 75 tests passed, 1 opt-in test skipped, TypeScript passed, and the production build passed.
- [x] Push the correction: GitHub `main` contains commit `31226fa`; live Vercel deployment response verification remains pending until the new commit is deployed and accessible.

# Pasted Vercel diagnosis verification

- [x] Compare the pasted claims about dynamic imports, tsconfig inclusion, duplicate bootstrap layers, and build/runtime separation against the current repository: dynamic imports were present, `api/**/*` was omitted from tsconfig, two API bootstrap surfaces existed, and the Vercel functions were separate from the esbuild server output.
- [x] Reproduce or disprove the reported `Cannot find module '/var/task/server/routers'` failure using the actual Vercel source and local bundling checks: the exact Vercel stack trace was not exposed, but the source pattern was confirmed as a plausible bundler failure and removed with static imports; local typecheck/build now include the API graph.
- [x] Make only evidence-backed Vercel bundling fixes: added `api/**/*` to tsconfig, converted both Vercel handlers from dynamic to static server imports, and fixed the cookie serializer/context types exposed by API inclusion.
- [x] Add regression coverage for serverless module loading and validate locally: `pnpm check`, full Vitest (75 passed, 1 skipped), and production build all pass; live Vercel verification remains blocked by the inaccessible/protected project deployment.

# Vercel log-confirmed module resolution fix

- [x] Verify the repository handler contains no runtime `import("../../server/routers")` path that Vercel leaves unresolved: GitHub main at `d96709b` uses static imports; the old deployed artifact was the source of the confirmed log.
- [x] Confirm `api/**/*` is included in TypeScript and the API build graph: `tsconfig.json` includes `api/**/*`, and the Vercel config explicitly lists both API functions.
- [x] Build, typecheck, test, and inspect the bundled handler for `server/routers` resolution: bundle contains `appRouter` and `createContext`, has zero unresolved server imports, `pnpm check` passes, and the focused API tests pass.
- [x] Push the verified source and confirm the new Vercel deployment returns JSON from wallet-auth endpoints — superseded because wallet-auth endpoints were removed by explicit user request; wallet-free version is published as checkpoint `8d0c1e84`.

# Wallet-free platform mode

- [x] Inventory every wallet-auth, provider, Privy wallet, Arc wallet challenge, and wallet-dependent UI path; retained only the non-wallet Privy account session flow and payment-destination/onchain settlement data required for later integration.
- [x] Remove wallet login and wallet connection code while preserving non-wallet dashboard and platform infrastructure: removed the buyer wallet login component, wallet challenge/login procedures, wallet-auth module, seller ownership challenge/verification routes, ownership module/tests, and replaced access/onboarding UI with account login and operator review.
- [x] Update configuration, dependencies, documentation, and tests for wallet-free mode: dashboard and seller onboarding copy now describe account access and payment destinations; wallet-only test modules and imports are removed; settlement/Arc transfer primitives remain for later wallet reintroduction.
- [x] Validate the wallet-free build, dashboard shell, API-key records, and webhook infrastructure: TypeScript passes, full Vitest passes, and the production build succeeds.

# GitHub wallet-connect cleanup

- [ ] Audit the current `adnan911/druto-final` main branch for wallet-connect source, routes, tests, dependencies, and user-facing references.
- [ ] Remove wallet-connect implementation while preserving non-wallet payment, seller, API-key, and webhook infrastructure.
- [ ] Validate the cleaned repository and confirm wallet-connect implementation is absent.
- [ ] Commit and push the wallet-free cleanup to GitHub main.
