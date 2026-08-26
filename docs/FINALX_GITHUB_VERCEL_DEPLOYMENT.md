# Druto finalX GitHub and deployment guide

This document explains which finalX package to use and how to move the source into GitHub and deployment environments without exposing credentials.

## Package selection

Use `druto-platform-finalX-0.1.0.zip` for the complete Druto platform source, including the public landing page, Developer Hub, dashboard, Arc Testnet payment flows, database schema, migrations, tests, documentation, and presentation materials. Use `druto-sdk-finalX-0.1.0.zip` for the standalone `@druto/sdk`. Use `druto-seller-integration-kit-finalX-0.1.0.zip` for seller onboarding materials, webhook examples, Dashda synchronization guidance, and the Next.js starter. Use `druto-nextjs-starter-finalX-0.1.0.zip` when starting a new seller website from the smallest integration template. Use `druto-brand-kit-finalX-0.1.0.zip` for logos and brand assets.

## GitHub workflow

Extract the selected ZIP into a new repository folder. Create a private GitHub repository, initialize Git, commit the source, and push it. Do not commit `.env`, private keys, API keys, webhook secrets, database passwords, or wallet seed phrases. The packages intentionally exclude dependencies, local logs, build caches, and credentials.

## Vercel workflow

The standalone Next.js seller starter is the most direct Vercel deployment path. Import the repository into Vercel, select Next.js, and add the server environment variables from `.env.example` in Vercel Project Settings. The create-payment and webhook routes must remain server-side.

The full Druto platform contains a Node/Express server and a MySQL-compatible database layer in addition to the Vite client. Deploying the full platform to Vercel may require an adapter or separate always-on Node host for the API process. Do not assume that a Vite frontend deployment alone provides the backend. Keep the database on a managed MySQL/TiDB provider and configure the required server environment variables in the host.

## Required secret boundaries

At minimum, configure the database connection, JWT/session secret, Arc Testnet configuration, Druto API credentials, webhook signing secret, and Privy credentials where those features are enabled. Add secrets through the deployment provider’s encrypted environment settings. Never prefix server-only secrets with `NEXT_PUBLIC_` or `VITE_`.

## First deployment order

First deploy the seller starter or Dashda backend with a health page and database connection. Then configure the Druto API key and webhook secret. Register the webhook URL in Druto. Test Payment Intent creation with a small Arc Testnet USDC amount. Confirm the signed webhook changes the Dashda order to paid. Finally, perform the complete marketplace-to-receipt-to-dashboard demonstration.

## Production warning

These packages are configured around Arc Testnet and USDC for demonstration. Before accepting mainnet funds, complete mainnet configuration review, API-key scopes and rotation, webhook monitoring, rate limiting, reconciliation, refund/dispute policy, backups, audit logging, and incident response procedures.
