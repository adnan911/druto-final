# Crypto payment-link model notes

## Reference model

Stripe’s official documentation describes a layered flow. A merchant can use Payment Links, hosted Checkout, embedded Elements, or a Payment Intents API integration. The server creates a PaymentIntent that represents the intent to collect a specific amount, and the client uses a client secret to complete the payment flow. For stablecoin payments, the customer is redirected to a hosted crypto payment page to connect a wallet and complete the transaction. The merchant then verifies the PaymentIntent status and handles post-payment events through webhooks.

Stripe’s Payment Links documentation describes Payment Links as shareable URLs that redirect customers to a Stripe-hosted payment page. The link can be created in a dashboard or through an API, and it carries the configured product, amount, and checkout behavior.

## Druto equivalent for the demo

The marketplace creates a Druto Payment Intent or Payment Link on the server-side integration boundary. The response contains a non-secret payment-link URL and a checkout reference. The marketplace can then use one of three integration patterns: redirect the customer to Druto Hosted Checkout, embed a Druto checkout component, or use a JavaScript SDK/API surface to open the payment window.

The Druto checkout displays merchant identity, order reference, exact USDC amount, EVM network, receiving address or contract destination, QR code, wallet-connect action, expiration, and a clear distinction between submitted and final. The demo uses local mock state and does not broadcast a real transaction.

After a future real transaction is detected, Druto would validate the chain ID, token contract, recipient, amount, and payment reference; run risk checks; wait for the configured finality state; post the ledger entry; and deliver a signed webhook. The marketplace should fulfill the order only after receiving a server-side verified success event, not merely a browser callback.

## Important distinction

A wallet address or QR code is only a payment destination. It is not proof that the correct payment was received. The real infrastructure must map the payment to a Payment Intent, validate the exact asset/network/recipient/amount, prevent duplicate ledger credits, and expose a durable payment status to the marketplace.

## Sources

- Stripe stablecoin payments: https://docs.stripe.com/payments/accept-stablecoin-payments?payment-ui=direct-api
- Stripe Payment Links: https://docs.stripe.com/payment-links/create
