# Druto × Arc: A real marketplace payment loop

## Slide 1 — Title

**On-slide copy**

# Druto × Arc
## From marketplace cart to verified USDC payment

**Arc Testnet demonstration**

**Presenter notes**

Today I will show Druto through a normal marketplace purchase. A buyer will add products, check out, approve USDC from an EVM wallet or QR flow, and receive an onchain receipt. Then I will switch to the seller view and show the same verified payment in the Druto dashboard.

---

## Slide 2 — The product thesis

**On-slide copy**

# Crypto payment infrastructure that follows the order

**Marketplace** owns the catalog, cart, buyer, shipping, and fulfillment.

**Druto** owns the payment intent, hosted checkout, verification, events, and operations view.

**Arc** provides the testnet settlement rail and onchain proof.

**Presenter notes**

Druto is not trying to replace the marketplace. It creates a clean payment boundary: the marketplace starts the payment request, the buyer controls wallet approval, Arc records the transfer, and Druto verifies it before the seller fulfills.

---

## Slide 3 — The live demo in one picture

**On-slide copy**

```text
Marketplace cart
      ↓
Standard checkout
      ↓
Pay with Druto
      ↓
Wallet or QR approval
      ↓
Arc Testnet USDC transfer
      ↓
Druto verification
      ↓
Receipt + Arcscan proof
      ↓
Seller dashboard reconciliation
```

**Presenter notes**

This is the complete story I will execute live. The important distinction is that the transaction is not considered complete when the browser receives a hash. Druto verifies the intended token, chain, amount, recipient, and receipt finality first.

---

## Slide 4 — Buyer starts with a familiar checkout

**On-slide copy**

# 01 / Browse → cart → checkout

- Add one or two items
- Review seller, shipping, and total
- Choose **Pay with Druto**
- Keep the marketplace order ID attached

**Presenter notes**

The buyer experience begins like any marketplace purchase. For the first live payment I will use one seller so the payment proof is easy to follow. The marketplace keeps the order record and sends its stable order reference to Druto.

---

## Slide 5 — Druto makes the payment request legible

**On-slide copy**

# 02 / Review the payment before signing

| Buyer sees | Why it matters |
|---|---|
| Exact USDC amount | No ambiguous total |
| Arc Testnet | Correct network boundary |
| Receiving wallet | Destination is visible |
| Wallet or QR | Buyer chooses the approval method |
| Order reference | Payment can be reconciled |

**Presenter notes**

Druto creates the hosted checkout from a server-owned Payment Intent. The browser does not choose the receiving wallet. I will show the amount, asset, network, recipient, and order context before any wallet approval.

---

## Slide 6 — Buyer-controlled Arc Testnet payment

**On-slide copy**

# 03 / Wallet approval → Arc transaction

**Wallet path:** connect an injected EVM wallet and approve the displayed transfer.

**QR path:** scan the same payment request from a mobile wallet.

**Safety check:** approve only when amount and recipient match the Druto checkout.

**Presenter notes**

Druto is non-custodial in this flow. The buyer’s wallet shows the approval request, and the buyer makes the final decision. I will use the prepared disposable test wallet on Arc Testnet with testnet USDC.

---

## Slide 7 — Verification creates trustworthy proof

**On-slide copy**

# 04 / Submitted is not succeeded

```text
requires_payment → submitted → verifying → succeeded
```

Druto verifies:

- USDC token
- Arc Testnet chain
- Exact amount
- Configured recipient
- Receipt finality

**Presenter notes**

The wallet can submit a transaction before the payment is trusted. Druto checks the onchain result and only then moves the Payment Intent to succeeded. This is the boundary that protects fulfillment from frontend-only success states.

---

## Slide 8 — Receipt and independent Arcscan proof

**On-slide copy**

# 05 / Make the payment auditable

**Buyer receipt**

- Verified status
- Marketplace order reference
- USDC amount
- Seller and recipient
- Arc transaction hash

**Arcscan**

Independent proof of the testnet transfer.

**Presenter notes**

I will open the receipt, then follow the transaction hash to Arcscan. I will check the network, token, amount, sender, and recipient. This connects the human-readable order to the independent blockchain record.

---

## Slide 9 — Seller operations after verification

**On-slide copy**

# 06 / One verified payment, two useful views

**Seller sees in Druto**

- Payment status and USDC amount
- Buyer and order context
- Seller identity
- Receipt details
- Arc transaction hash
- Verified activity and balance context

**Marketplace fulfills from the signed event**

`payment.verified` → verify HMAC → reject replay → mark order paid once

**Presenter notes**

Now I will switch to the seller dashboard, refresh live data, and open the payment. The dashboard data comes from the verified Druto record. In production, the marketplace should fulfill from the signed payment.verified webhook, not from the buyer’s redirect.

---

## Slide 10 — Why this matters for Arc

**On-slide copy**

# Druto turns Arc settlement into a usable commerce primitive

**Buyer:** familiar checkout and wallet control.

**Seller:** payment operations and onchain receipt proof.

**Marketplace:** stable order mapping, idempotency, signed fulfillment events.

**Arc:** a visible testnet transaction inside a complete product flow.

**Presenter notes**

The point is not only that USDC can move. The point is that the movement is connected to a marketplace order, verified before fulfillment, visible to the seller, and auditable onchain.

---

## Slide 11 — Closing and next step

**On-slide copy**

# From testnet demonstration to marketplace integration

1. Seller self-onboards and proves wallet ownership.
2. Marketplace creates server-side Payment Intents.
3. Buyers pay USDC through hosted wallet or QR checkout.
4. Druto verifies Arc and emits signed events.
5. Seller dashboard and marketplace records stay reconciled.

**Arc Testnet today. Production hardening next.**

**Presenter notes**

This demo uses the current Arc Testnet and USDC configuration. The next work is production hardening: mainnet configuration, stronger credential policies, monitoring, reconciliation tooling, and the operational controls required for real sellers.

**Final line:**

> “Druto gives marketplaces a familiar checkout experience with an Arc-native verification and operations layer behind it.”

---

## Appendix — Live presenter checklist

**Before the room:** disposable buyer wallet funded with Arc Testnet USDC; correct Arc Testnet network; configured Druto seller account; marketplace reset; dashboard login tested; Arcscan tab ready.

**During the demo:** show the exact amount and recipient; approve only the expected transfer; wait for succeeded; open the receipt; verify Arcscan; refresh the seller dashboard; show the transaction hash and receipt details.

**If the live payment fails:** use the clearly labeled rehearsal fallback and state that it is not onchain proof. Never call a submitted transaction succeeded, and never expose wallet secrets.
