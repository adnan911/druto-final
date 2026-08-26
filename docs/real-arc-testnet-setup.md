# Real Arc Testnet setup

## Current implementation

Druto now creates Payment Intents on the server, fixes the amount to USDC on Arc Testnet, uses the configured merchant wallet `0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217`, opens a hosted checkout URL, supports injected EVM wallets, generates a QR code for the checkout URL, waits for an Arc receipt, verifies the exact USDC Transfer event, and exposes the resulting intent in transaction history.

The router smart contract, Circle-managed wallets, automated webhooks, refunds, and production custody remain intentionally deferred.

## Arc Testnet wallet settings

Use the official Arc settings:

| Setting | Value |
|---|---|
| Network | Arc Testnet |
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.io` |
| Currency symbol | `USDC` |
| Explorer | `https://testnet.arcscan.app` |
| USDC contract | `0x3600000000000000000000000000000000000000` |

Arc’s native gas balance uses 18 decimals, while the ERC-20 USDC interface uses 6 decimals. Druto uses the ERC-20 interface and converts checkout amounts to 6-decimal atomic units.

## Funding a disposable buyer wallet

Create or use a separate test-only EVM wallet. Never use a production wallet and never paste a private key or seed phrase into Cursor, chat, GitHub, or project files. Add Arc Testnet using the settings above, then request testnet USDC from [Circle Faucet](https://faucet.circle.com/). Keep the amount small for the first test.

The seller address is public and may be displayed in a testnet checkout. The buyer must have enough testnet USDC to cover both the payment and Arc gas.

## Local test

Run the upgraded project from `/home/ubuntu/druto-platform`:

```bash
pnpm install
pnpm dev
```

Open the dashboard. Choose **Create payment**, enter a small amount such as `1.00`, and submit. Druto creates a server-side Payment Intent and redirects to a URL like `/checkout/pi_...`.

Open the checkout in the browser that contains the buyer wallet. Verify the displayed amount, Arc Testnet network, and merchant destination in the wallet prompt. Only then approve the transfer. Druto waits for the receipt, verifies the recipient, amount, token contract, and transaction success, and then marks the intent as succeeded.

Never mark an order paid from the browser callback alone. The database status is authoritative only after the backend verification succeeds.

## QR test

On the checkout page, scan the displayed QR code with a mobile device. It opens the same hosted checkout URL. Complete the wallet connection and approval on the mobile wallet. The current QR encodes the checkout URL, not an unaudited raw transfer request, so the customer still sees the server-derived payment details before signing.

## What is not required yet

A WalletConnect project ID is not required for the first milestone because injected browser wallets are supported. Circle API credentials are not required for a buyer-signed direct transfer. They will be needed if the project later adds Circle-managed wallets, developer-controlled wallets, or Circle APIs.

## Safety boundary

The implementation never receives or stores a private key. It only asks the buyer’s wallet to sign the exact ERC-20 transfer. A real testnet transfer must be approved by the user in the wallet UI after checking the network, recipient, token, and amount.
