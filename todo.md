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
