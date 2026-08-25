# Druto × Arc — Complete Presentation Script

**Audience:** Arc team

**Format:** 11-slide presentation plus live browser demonstration

**Recommended duration:** 12–15 minutes, including one real Arc Testnet USDC approval.

**Presenter rule:** Replace all example IDs, amounts, and hashes with the values visible in the live demo. Never present example values as a real transaction.

## Slide 1 — Druto × Arc

**What the audience sees:** The title slide, “From marketplace cart to verified USDC payment,” with Arc Testnet and USDC labels.

**What to say:**

> “Hello, and thank you for the time. I am going to show Druto through a real marketplace payment journey rather than through a dashboard-only mockup. A buyer will browse a marketplace, add products to a cart, continue through a standard checkout, choose Pay with Druto, approve USDC from a wallet or QR flow on Arc Testnet, and receive an onchain receipt. Then I will switch to the seller view and show the same verified payment in the Druto dashboard.”

> “The demo is intentionally testnet-only. It demonstrates the product boundary and a real Arc Testnet transaction; it is not a claim of mainnet readiness.”

**Action:** Establish the four browser tabs: marketplace, Druto checkout/receipt, seller dashboard, and Arcscan.

**Transition:**

> “Let me first explain what each part of the system owns, then I will execute the flow.”

## Slide 2 — The product thesis

**What the audience sees:** Marketplace, Druto, and Arc responsibility bands.

**What to say:**

> “The central idea is separation of responsibility. The marketplace keeps doing what it already does: catalog, cart, buyer details, shipping, inventory, and fulfillment. Druto becomes the payment operations layer: it creates the Payment Intent, hosts the wallet and QR checkout, verifies the Arc transaction, emits signed events, and gives the seller an operational dashboard. Arc provides the settlement rail and independent onchain proof.”

> “This separation matters because a marketplace should not have to build wallet transaction handling, verification logic, webhook replay protection, and payment operations from scratch.”

**Transition:**

> “The live demo makes this boundary visible one step at a time.”

## Slide 3 — One purchase. One verified loop.

**What the audience sees:** Eight-step end-to-end flow.

**What to say:**

> “This is the complete loop. We begin with a marketplace cart. The marketplace creates its own order and passes stable context to Druto. Druto opens hosted checkout. The buyer approves a USDC transfer from an EVM wallet or QR wallet. Arc records the transaction. Druto verifies the token, chain, amount, recipient, and finality. The buyer receives a receipt and Arcscan proof. Finally, the seller sees the verified payment in the Druto dashboard.”

> “The key trust boundary is simple: submitted does not mean succeeded. Fulfillment begins after verification.”

**Transition:**

> “Now I will begin as the buyer.”

## Slide 4 — Browse, cart, and standard checkout

**What the audience sees:** Marketplace checkout and the handoff contract.

**What to say:**

> “This is a normal marketplace experience. I can browse products, see availability and seller information, add items to the cart, and review shipping and the total. Druto does not replace this commerce layer.”

**Action:** Add one or two items from the same seller. Open checkout.

> “For this first live payment I am using one seller so there is one clean payment and one clean receipt. The marketplace creates its own order record and keeps the external order ID. That order ID travels with the payment request so we can reconcile the blockchain payment back to the commerce order.”

> “The important security detail is that the browser does not contain the merchant API key or an authoritative receiving wallet. The marketplace backend creates the Druto Payment Intent.”

**Transition:**

> “The buyer now chooses the crypto payment method without leaving the marketplace story.”

## Slide 5 — Druto makes the payment request legible

**What the audience sees:** Exact amount, USDC, Arc Testnet, recipient, order reference, wallet and QR options.

**What to say:**

> “This is the hosted Druto payment request. Before the buyer signs, the buyer can inspect the exact amount, the asset, the network, the resolved recipient, and the order reference.”

> “For this demonstration the asset is USDC and the network is Arc Testnet. The receiving wallet is resolved from the approved seller configuration on the server. We are not trusting a wallet address supplied by the browser.”

> “This is a small but important UX point: crypto becomes legible. The buyer is not asked to sign an opaque request.”

**Action:** Point to the amount, network, recipient, and order reference in the live checkout.

**Transition:**

> “I will now show the two buyer-controlled approval paths.”

## Slide 6 — Buyer-controlled Arc transaction

**What the audience sees:** Wallet and QR options with the non-custodial safety boundary.

**What to say:**

> “The first path is an injected EVM wallet. The second path is a QR request that a mobile wallet can scan. The approval surface changes, but the trust model does not: the buyer’s wallet controls the signature, and Druto does not need the buyer’s private key.”

**Action:** Choose the prepared wallet path for the live approval. Keep QR visible or describe it as the alternate route.

> “Before I approve, I am checking the exact amount and the receiving address shown in Druto against the wallet request. If they did not match, I would reject the transaction.”

**Action:** Approve the transfer only after checking the values.

> “This is a real testnet approval using the prepared disposable buyer wallet. No private key is exposed during the demonstration.”

**Transition:**

> “The wallet has submitted a transaction. Druto still has work to do before the seller can fulfill.”

## Slide 7 — Submitted is not succeeded

**What the audience sees:** `requires_payment → submitted → verifying → succeeded` and the verification protocol.

**What to say:**

> “A transaction hash is evidence that a wallet submitted something. It is not yet proof that the intended payment succeeded. Druto moves through its state machine and verifies the actual Arc result.”

> “The checks include the expected USDC token contract, Arc Testnet chain, exact amount, resolved seller recipient, and receipt finality. Only after these checks pass does the Payment Intent become succeeded.”

> “This is the boundary that prevents a marketplace from fulfilling an order based only on a frontend redirect or an unverified hash.”

**Action:** Wait for the live Druto receipt to reach its verified/succeeded state.

**Transition:**

> “Once verification completes, the buyer gets a readable receipt and an independent explorer link.”

## Slide 8 — Make the payment auditable

**What the audience sees:** Buyer receipt and Arcscan proof.

**What to say:**

> “This is the buyer-facing receipt. It contains the order reference, amount, seller context, status, network, and transaction hash. The receipt makes the payment understandable to a person.”

**Action:** Click the Arcscan link from the live receipt.

> “This is the independent onchain proof. I am checking the Arc Testnet network, the USDC token transfer, the amount, the sender, and the configured recipient. The receipt and the explorer are connected by the transaction hash.”

> “Notice the difference between an application claim and independent proof. The Druto UI explains the payment; Arcscan lets us inspect the underlying transaction.”

**Transition:**

> “Now I will switch from the buyer role to the seller role.”

## Slide 9 — One verified payment, two useful views

**What the audience sees:** Seller dashboard and signed webhook event.

**What to say:**

> “The seller dashboard is the operational view. I am going to refresh live data and open the payment associated with this seller account.”

**Action:** Open `/dashboard`, authenticate, go to Payments or Overview, and refresh.

> “The seller can now see the verified status, USDC amount, buyer or order reference, seller identity, receipt details, and Arc transaction hash. These fields reconcile the marketplace order, the Druto Payment Intent, and the onchain record.”

> “For automation, the marketplace should consume the signed `payment.verified` event. It verifies the HMAC signature, rejects replayed event IDs, matches the order, and marks the order paid exactly once.”

**Transition:**

> “The dashboard is the human operations surface; the signed event is the machine fulfillment boundary.”

## Slide 10 — Druto turns Arc settlement into a commerce primitive

**What the audience sees:** Benefits for buyer, seller, marketplace, and Arc.

**What to say:**

> “The value is not merely that a buyer can send USDC. The value is that settlement becomes usable inside commerce.”

> “The buyer gets a familiar checkout and retains wallet control. The seller gets an operational payment record and onchain receipt proof. The marketplace gets stable order mapping, idempotency, and signed fulfillment events. Arc gets visible utility as the settlement rail inside a complete, auditable product flow.”

> “Druto is the layer that connects these experiences without asking the marketplace to own every blockchain-specific concern.”

**Transition:**

> “Let me close with what this means for the path from testnet demonstration to a real integration.”

## Slide 11 — From testnet demo to integration

**What the audience sees:** Five integration steps and production-hardening list.

**What to say:**

> “The integration path is straightforward. A seller self-onboards and proves wallet ownership. The marketplace creates server-side Payment Intents. Buyers pay through hosted wallet or QR checkout. Druto verifies Arc and emits signed events. The seller dashboard and marketplace order records remain reconciled.”

> “This presentation uses Arc Testnet and USDC. The next stage is production hardening: mainnet configuration, credential rotation and scopes, webhook monitoring, reconciliation tooling, and incident procedures.”

**Final close:**

> “Druto gives marketplaces a familiar checkout experience with an Arc-native verification and operations layer behind it.”

## Live Q&A handoff

After the final slide, say:

> “I am happy to go deeper into the integration boundary, seller onboarding, transaction verification, webhook security, or the multi-seller flow.”

If the team asks about the live transaction, first show the actual receipt and Arcscan page, then answer with the concrete order ID, Payment Intent ID, and transaction hash visible in the demo. Do not invent or estimate values.

## Emergency fallback script

If the wallet or network fails, say:

> “The live approval is not completing reliably, so I am stopping before making an unsafe or ambiguous approval. I will show the prepared rehearsal path to explain the UI, but I will not describe it as onchain proof. The production rule remains the same: fulfill only after Druto verification and a valid signed webhook.”

## Final presenter checklist

Before the meeting, reset the marketplace cart, fund the disposable buyer wallet with Arc Testnet USDC, select Arc Testnet, verify the configured Druto seller account, test dashboard login, and open Arcscan in a ready tab. During the meeting, show the amount and recipient before approval, wait for succeeded, open the receipt, inspect Arcscan, refresh the dashboard, and keep the transaction hash visible. Never reveal a private key, approve an unexpected recipient, or call a submitted transaction succeeded.
