# Druto product context

Facts and scope confirmed by the existing implementation and the user-approved dashboard reference, 13 November 2026.

Druto is a stablecoin payment gateway being developed for marketplaces and storefronts. The current application supports Arc Testnet USDC. The current direct-payment MVP sends funds from the buyer wallet to the seller receiving wallet with a 0% platform fee. Druto verifies and reports payment evidence; this dashboard is not a custodial balance, payout account or proof of regulatory approval.

The dashboard serves authenticated marketplace/seller users reviewing their own authorized payment activity, seller registration, receiving-wallet ownership and integration configuration. Existing server authorization controls define data scope.

## Supported dashboard work

- Review payment intents and verified transfers using existing authenticated API responses.
- Filter by date/status, search, open payment details and export the loaded/filtered records.
- Inspect registered receiving destinations and wallet ownership status.
- Register a seller, verify its receiving wallet and provision server integration credentials through existing onboarding.
- Read integration documentation and manage the existing user profile.
- Keep unavailable standalone links, invoices, recurring billing and custodial payout features outside the active navigation.

## Development and release boundaries

Development preview renders the same UI with synthetic fixtures, an isolated in-memory tRPC link, no real credentials and no mutation/HTTP fallback. A visible notice labels this mode. Production builds exclude the preview and use normal authenticated data. Mainnet, legal/country eligibility, fiat conversion and new custody models are separate decisions and are not enabled by this visual implementation.

## Visual commitment

The user selected a supplied dark-glass dashboard screenshot and the existing Druto glass HTML demo. Retain its charcoal/teal ground, subtle lavender receiving-wallet material, mint actions, Manrope, payment-first table and compact sidebar. Preserve responsive navigation, keyboard/focus support, readable amounts, reduced motion and honest loading/empty/error states. DESIGN.md scopes these tokens to the dashboard and its payment-detail dialog; public landing, checkout and receipt styling is not being redesigned.