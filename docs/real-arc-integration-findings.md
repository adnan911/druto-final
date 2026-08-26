# Real Arc Testnet integration findings

## User-approved direction

The user wants to use both the existing `druto-platform` and the standalone payment-infrastructure demo, with real Arc Testnet USDC, direct merchant-wallet transfer, and EVM wallet support. The smart-contract router is deferred.

## Official Arc guidance from the uploaded materials

Arc is EVM-compatible and uses USDC as the gas token. The uploaded Arc material says transactions have sub-second deterministic finality, so the application should not assume Ethereum-style multi-confirmation waits. Arc is currently testnet-only in the supplied guidance. The project should use the official Arc network configuration and always verify current contract addresses from Arc documentation rather than hardcoding guessed addresses.

## Official Circle guidance from the uploaded materials

Circle distinguishes developer-controlled wallets, user-controlled wallets, and modular smart-contract wallets. For this first direct merchant-wallet flow, the buyer can use an ordinary EVM wallet connection; Circle APIs are not required to make a buyer-signed transfer. Circle API keys become relevant for Circle-managed wallet infrastructure, developer-controlled wallets, Circle APIs, and related services. Circle guidance says to use official USDC contract addresses per chain, prefer SDKs where applicable, and use webhooks for asynchronous state changes when supported.

## Current source boundary

`druto-platform` is currently a static React frontend. Its checkout state is local (`ready`, `submitted`, `final`) and its payment tables, balances, payment intents, and details are mock constants. The standalone payment-infrastructure demo is pure HTML/CSS/JavaScript with local simulated state. Neither project currently has a backend, database, wallet provider, RPC client, transaction observer, or webhook receiver.

## Required real architecture

A real implementation needs a full-stack upgrade or a separate backend service. The trusted backend should create Payment Intents, set the exact amount and merchant destination, issue a client-safe checkout session, enforce idempotency, and verify observed Arc transfers. The browser should connect an EVM wallet and request only the exact transfer derived from the server-created intent. The seller dashboard and buyer receipt should update only from a verified backend event, not from a browser callback.

## Missing user-provided input

The implementation still requires the seller’s Arc Testnet merchant receiving wallet address. The address may be shared publicly for testnet use, but the private key or seed phrase must never be shared. A disposable buyer wallet is needed later for the user’s own test, funded through the Circle Testnet Faucet.

## Browser verification checkpoint

The upgraded dashboard successfully opened the backend-connected Create payment modal. Submitting a 1.00 USDC intent created `pi_nfPy85zoTGk5` and redirected to `/checkout/pi_nfPy85zoTGk5`. The hosted checkout loaded the server-derived order reference, expiry, amount, Arc Testnet label, chain ID 5042002, and the wallet entry point. No wallet transaction was initiated during this verification.

The hosted checkout safely detected that the sandbox browser has no injected EVM wallet and displayed an install-wallet message without attempting a transaction. Real wallet signing requires the user’s own browser with MetaMask, Rabby, Coinbase Wallet, or another injected provider configured for Arc Testnet.

The hosted checkout now renders a local QR image that encodes the exact checkout URL, alongside the real injected-wallet entry point. The previously created database intent remains available and displays its server-side amount when addressed by its Payment Intent URL.
