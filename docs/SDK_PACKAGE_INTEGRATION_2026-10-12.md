# Cloudflare SDK package integration — 12 October 2026

## Verified result

Downloaded the public `druto-sdk-0.2.0-testnet.2.zip` and its checksum from `https://druto-d1-testnet.robobq.workers.dev/downloads/`. SHA-256 matched both the published checksum and the reviewed local archive:

`a53f66e69006fd02f0804a063e9db4477631ee4283e2e0958c0e5c2a668ca237`

Extracted into ignored `tmp/sdk-integration/extracted` and installed in a fresh temporary Node consumer with `npm install --offline --ignore-scripts --no-audit --no-fund`. The package installed without registry dependencies. The new suite loads that installed **compiled JavaScript**, not the SDK TypeScript source.

Three integration tests passed, alongside four existing SDK unit tests:

1. SDK → actual Express/tRPC HTTP boundary → D1 router with real SQLite constraints: seller-scoped checkout, 0% fee and expected recipient; identical retry returns the same intent; changed amount is 409, wrong seller 403; `getPayment` reads the API response correctly.
2. Synthetic chain verification → real ledger/outbox commit → actual webhook signing and HTTP receiver → SDK signature verification → merchant SQL transaction. A simulated 503 after the merchant's durable commit retries successfully and leaves one event and one fulfillment job.
3. Tampered body and expired timestamp reject with 401; a correctly signed event with the wrong expected amount rejects with 409. Neither changes the pending order to paid.

Full application TypeScript check passed. The initial test harness imports failed because Vitest's dynamic loader handled native import callbacks/Windows URL encoding differently; using the resolved compiled filesystem path fixed the harness. No SDK runtime defect was inferred from those harness failures.

## Documentation defects fixed

The older seller quick checklist recommended `pnpm add @druto/sdk`, despite no registry publication, and sent unsupported `orderId`/top-level `buyerEmail` fields. It also used Vercel-specific configuration and implied QR compatibility. It now links the Cloudflare ZIP/checksum, installs the extracted directory, uses `externalOrderId` and explicit server-side configuration, binds intent before redirect, and specifies operator webhook allowlisting and durable receiver requirements. [Current seller checklist](DRUTO_SELLER_QUICK_INTEGRATION_CHECKLIST.md).

## Repeat the package test

Download and checksum-verify the archive, extract and install it in an isolated consumer. Set `DRUTO_SDK_TEST_MODULE` to its installed `node_modules/@druto/sdk/dist/index.js` and run:

```text
vitest run server/sdk-package-integration.test.ts sdk/druto-sdk/src/index.test.ts
```

Without the override, the test uses checked-in `sdk/druto-sdk/dist/index.js`. It does not fetch code from the network during ordinary test runs. Regenerate the package with `node sdk/build-package.mjs` when changing SDK source, then repeat against the resulting archive.

## Evidence boundaries

- This is downloaded-package integration with a local HTTP API/receiver and SQLite D1 adapter. The harness maps fixed fixture HTTPS origins to local HTTP; production HTTPS validation is unchanged.
- Arc evidence is synthetic in these tests. No new wallet transfer, signature prompt, live seller credential or customer data was used. This does not certify every wallet or a new live marketplace deployment.
- The fixture receiver demonstrates durable event/order/job deduplication. It is not a shipped complete merchant application or an external shipping/delivery guarantee. A downloadable production-ready marketplace starter still needs its own trusted catalog, authentication, persistence and deployment review.
- SDK package version/content and gateway deployment were unchanged. The existing Cloudflare download remains the verified artifact. Documentation changes are local repository changes; no Git push or mainnet release occurred.
