# Druto × Arc Team Demonstration Pitch Script

**Audience:** Arc team

**Demo objective:** Show a real marketplace purchase using Druto on Arc Testnet, from cart creation through buyer-controlled USDC approval, onchain proof, and seller-side dashboard reconciliation.

**Recommended duration:** 8–12 minutes, including one live Arc Testnet transaction.

> **Important boundary:** This is a real testnet demonstration using USDC on Arc Testnet. It is not a mainnet payment and it is not a production settlement flow. The buyer controls wallet approval; Druto verifies the transfer before the seller treats the order as paid.

## 1. Opening: frame the problem

**Action:** Begin on the Druto landing page or Developer Hub. Do not begin with code. Start with the user journey the Arc team can observe.

**Say:**

> “Today I want to show Druto as a payment infrastructure layer for marketplaces. I will use a normal marketplace purchase rather than a dashboard-only simulation. A buyer will add products to a cart, check out, choose Pay with Druto, approve a real USDC transfer on Arc Testnet, and receive an onchain receipt. Then I will switch to the seller view and show the same verified payment in the Druto dashboard.”

**Point out:** Druto is designed around a complete payment loop: server-created Payment Intents, hosted wallet/QR checkout, Arc verification, signed events, and operational visibility.

**Transition:**

> “The important thing is that the marketplace experience remains familiar. Crypto is introduced at the payment boundary, while the seller gets the same operational record and proof needed to fulfill an order safely.”

## 2. Prepare the live environment

**Action:** Briefly show the browser tabs: marketplace, Druto dashboard, wallet extension or mobile wallet, and Arcscan.

**Say:**

> “I have prepared a disposable buyer wallet on Arc Testnet with testnet USDC. The receiving wallet is already configured in Druto. I will not expose any private key, and I will approve only the amount and recipient that Druto displays.”

**Checklist before continuing:**

| Check | Expected state |
|---|---|
| Buyer wallet network | Arc Testnet |
| Buyer balance | Enough testnet USDC for the order and any required testnet gas |
| Druto receiving account | Configured and approved for the demo seller |
| Marketplace | Cart is empty or reset |
| Dashboard | Seller can sign in and refresh live payment data |
| Arcscan | Ready to open the final transaction hash |

**Recovery line if asked about mainnet:**

> “This demo intentionally stays on Arc Testnet. The same integration boundary is designed to be hardened for production later, but I am not presenting testnet behavior as mainnet readiness.”

## 3. Buyer opens the marketplace

**Action:** Open the marketplace demo. Browse products and show seller labels, price, availability, and product detail information.

**Say:**

> “This is the marketplace layer. It owns the catalog, cart, buyer details, shipping information, and order context. Druto does not replace those commerce responsibilities. It becomes the payment boundary when the buyer chooses a crypto payment method.”

**Action:** Add one or two products from the same seller to the cart.

**Say:**

> “For the first live payment I am keeping the cart to one seller. That makes the proof easy to follow. Druto also supports a multi-seller flow by creating one seller-specific Payment Intent per seller, but the first demonstration should make one payment and one receipt unmistakable.”

**Show:** Cart quantity, subtotal, shipping, total, and seller identity.

## 4. Buyer reaches standard checkout

**Action:** Open checkout and slowly review the order summary.

**Say:**

> “This is a normal marketplace checkout. The buyer sees the order total before crypto enters the story. The marketplace creates its own order record and keeps the order ID. That order ID is passed to Druto as external order context so the payment can be reconciled later.”

**Show:** Buyer contact information, delivery details, payment methods, and the `Pay with Druto` option.

**Say:**

> “The checkout button does not contain a private key, a merchant secret, or an untrusted wallet destination. It asks the marketplace backend to create a Druto Payment Intent. The browser receives only the safe handoff needed to open hosted checkout.”

## 5. Buyer clicks Pay with Druto

**Action:** Click **Pay with Druto**.

**Say:**

> “Now the marketplace hands the payment request to Druto. The request includes the marketplace order ID, seller identity, amount, asset, network, and return URL. Druto resolves the approved receiving wallet on the server instead of trusting a wallet address from the browser.”

**Show in hosted checkout:**

| Field | What to explain |
|---|---|
| Amount | The exact USDC amount for this order |
| Asset | USDC only for this current demo |
| Network | Arc Testnet |
| Recipient | The configured seller destination shown to the buyer |
| Order context | The marketplace order reference |
| Payment method | Injected EVM wallet or QR flow |

**Say:**

> “This is the point where Druto makes the payment legible. The buyer can inspect the amount, network, asset, and destination before approving anything.”

## 6. Wallet or QR payment

**Action:** Choose one path for the primary demo. Use the injected wallet if the browser wallet is stable. Keep QR as the secondary explanation or fallback.

**Wallet narration:**

> “I am choosing the connected EVM wallet. Druto is not taking custody of this wallet. The wallet itself will show the approval request, and the buyer remains responsible for confirming the transaction.”

**QR narration:**

> “The alternative is QR checkout. The buyer can scan the request from a mobile wallet. The payment still resolves to the same Druto intent and the same verified Arc transaction boundary.”

**Before approval, say:**

> “I am checking two things before approving: the displayed USDC amount and the receiving address. If either one were unexpected, I would reject the request.”

**Action:** Approve the transfer in the wallet. Do not narrate or show any secret material.

## 7. Wait for Arc Testnet verification

**Action:** Wait through submitted, verifying, and succeeded states. Do not refresh aggressively.

**Say:**

> “The wallet has submitted a transaction, but submitted is not the same as paid. Druto now checks the transaction on Arc. The verification boundary confirms the intended token, chain, amount, recipient, and receipt finality before the payment becomes succeeded.”

**If the audience asks why this matters:**

> “A frontend redirect or transaction hash alone can be incomplete or misleading. The seller should fulfill only after the server-side payment state is verified and the signed event is accepted.”

**Show:** The transition to the verified receipt. Emphasize the distinction between a transaction hash and a verified payment state.

## 8. Buyer receipt and Arcscan proof

**Action:** Open the buyer receipt. Point to the amount, order context, seller, status, and transaction hash.

**Say:**

> “This is the buyer-facing receipt. It gives the buyer a readable record, but the strongest proof is the onchain transaction link. The receipt connects the marketplace order to the Druto Payment Intent and to the Arc transaction hash.”

**Action:** Click **View on Arcscan** or copy the transaction hash and open the Arcscan page.

**Say:**

> “Here is the independent onchain proof. I am checking the Arc Testnet transaction, the USDC token, the amount, the sender, and the configured recipient. This is what makes the payment auditable outside the marketplace UI.”

**Do not claim:** Do not claim mainnet settlement, irreversible production finality, or a payment that is not visibly confirmed by the explorer.

## 9. Seller opens the Druto dashboard

**Action:** Open `/dashboard` in the seller tab and authenticate. Use the already configured seller account.

**Say:**

> “Now I am switching roles. The buyer has completed the payment, and the seller wants operational confirmation. The seller dashboard is not reading a buyer-side success screen. It is showing the verified payment record associated with the seller account.”

**Action:** Open **Payments** or **Overview** and refresh live data.

**Show:**

| Dashboard proof | What to say |
|---|---|
| Verified status | “Druto accepted the payment only after verification.” |
| USDC amount | “The dashboard amount matches checkout and Arcscan.” |
| Buyer/order reference | “This connects the payment to the marketplace order.” |
| Seller identity | “The payment is scoped to the configured seller.” |
| Transaction hash | “The dashboard preserves the onchain proof.” |
| Receipt details | “Operations can inspect the same payment context.” |
| Balance/activity | “Seller activity is derived from verified payment records.” |

**Say:**

> “The seller can now see the payment listed with its onchain and receipt information. The marketplace can fulfill the order because the trusted payment boundary has completed.”

## 10. Explain the webhook and fulfillment boundary

**Action:** If time allows, open the Developer Hub Webhooks section rather than presenting backend code in depth.

**Say:**

> “The dashboard is useful for a human operator, but production fulfillment should be automated through the signed `payment.verified` webhook. The marketplace verifies the HMAC signature, rejects replayed event IDs, matches the external order ID, and marks the order paid exactly once.”

**Simple architecture narration:**

```text
Marketplace backend
  → creates Druto Payment Intent
Druto hosted checkout
  → buyer approves USDC
Arc Testnet
  → transaction is mined
Druto verifier
  → validates token, chain, amount, recipient, finality
Signed webhook
  → marketplace marks order paid
Druto dashboard
  → seller sees verified payment and receipt proof
```

## 11. Close with the product thesis

**Say:**

> “The value of Druto is not only that a buyer can send USDC. The value is that the entire marketplace payment lifecycle becomes observable and reconcilable: the order starts in the marketplace, the buyer approves from their wallet, Arc provides the transaction proof, Druto verifies the transfer, the signed event triggers fulfillment, and the seller sees the same verified payment in an operational dashboard.”

**Final one-line close:**

> “Druto gives marketplaces a familiar checkout experience with an Arc-native verification and operations layer behind it.”

## 12. If something goes wrong

| Situation | Safe response |
|---|---|
| Wallet is on the wrong network | Stop and switch to Arc Testnet before continuing. |
| Wallet balance is insufficient | Do not improvise; use the prepared disposable test wallet or switch to the backup recording. |
| Transaction is pending | Explain that submitted is not succeeded and wait for verification. |
| Receipt has no transaction hash yet | Keep the receipt open and do not claim completion. |
| Dashboard does not show the payment immediately | Wait for verification, then refresh live data once. |
| QR wallet does not connect | Use the injected wallet path if prepared, while explaining QR remains supported. |
| Recipient or amount looks wrong | Reject the wallet request and stop the live payment. |
| Live payment cannot complete | Use the clearly labelled no-broadcast rehearsal fallback and state that it is not onchain proof. |

## Presenter checklist

Before the audience arrives, confirm the marketplace is reset, the buyer wallet is disposable and funded with Arc Testnet USDC, the wallet is on Arc Testnet, the Druto seller account is approved, the dashboard login works, and the Arcscan tab is ready. During the demo, never expose private keys, never approve an unexpected recipient or amount, and never describe a submitted transaction as a verified payment. After the demo, record the transaction hash and screenshot the seller dashboard only if the payment has visibly reached the succeeded state.

## References

[1]: https://docs.arc.network/ "Arc Network documentation"
[2]: https://testnet.arcscan.app/ "Arcscan Testnet explorer"
[3]: https://docs.arc.network/quickstart/ "Arc quickstart documentation"

## Technical Q&A for the Arc team

Use these answers after the live flow. Keep answers short first, then offer to open the Developer Hub or source code if the audience wants implementation detail.

### Q1. What exactly happens when a marketplace clicks Pay with Druto?

The marketplace backend creates a Druto Payment Intent with its own external order ID, seller identity, amount, USDC asset, Arc Testnet network, and return URL. Druto returns a safe hosted-checkout handoff. The browser never supplies the authoritative receiving wallet and never receives the seller’s API secret.

### Q2. Is Druto custodial?

The current demo is non-custodial. The buyer approves the USDC transfer in the buyer’s own EVM wallet or through a QR wallet flow. Druto verifies the resulting Arc transaction and provides the operational layer; it does not require the buyer’s private key.

### Q3. How does Druto know which seller receives the funds?

The marketplace sends a stable seller ID, not an arbitrary browser-provided wallet address. Druto resolves that seller to an approved merchant account and receiving wallet on the server. Seller wallet ownership is proven through a short-lived offchain signature challenge, and activation remains a separate control.

### Q4. What does Druto verify onchain?

Druto verifies the expected USDC token, Arc Testnet chain, exact amount, resolved recipient, transaction association, and receipt finality. A transaction hash received from the wallet is treated as submitted evidence, not as payment completion.

### Q5. Why not mark the order paid immediately after the wallet returns a hash?

A browser redirect or transaction hash can arrive before the transaction is final, can refer to the wrong token or recipient, or can be replayed against a different order. The trusted boundary is server-side verification followed by a signed `payment.verified` event.

### Q6. How does the marketplace receive confirmation?

Druto sends a versioned, signed webhook to the marketplace backend. The marketplace verifies the HMAC signature and timestamp tolerance, rejects replayed event IDs, matches the external order ID and Payment Intent ID, and marks the order paid exactly once.

### Q7. What prevents duplicate orders or duplicate fulfillment?

The marketplace uses a deterministic idempotency key when creating the Payment Intent. The webhook receiver persists event IDs before treating an event as processed. The order update should also be conditional, so a repeated delivery cannot create a second fulfillment.

### Q8. What data is synchronized to the Druto dashboard?

Druto stores the payment record and the context needed for reconciliation: seller, marketplace, external order reference, buyer label when supplied, amount, USDC asset, status, transaction hash, timestamps, and verification details. The marketplace remains the source of truth for catalog, inventory, shipping, customer addresses, and fulfillment.

### Q9. Can one marketplace support multiple sellers?

Yes. The marketplace sends a seller identity for each order. Druto resolves each seller’s approved wallet server-side. For a mixed cart, the integration can create separate seller-specific Payment Intents and continue the buyer through the seller payment queue. The first Arc team demo intentionally uses one seller so the live proof stays simple.

### Q10. How does QR payment differ from wallet connection?

The approval surface changes, but the trust model does not. The buyer scans a payment request using a mobile wallet instead of approving from an injected desktop wallet. Both paths resolve to the same Payment Intent and are verified against the same Arc transaction rules.

### Q11. What happens if the payment fails or remains pending?

The Payment Intent stays out of the succeeded state. The marketplace should keep the order pending, show a retry or support path, and avoid fulfillment. If a webhook delivery fails after verification, Druto persists the delivery state and retries it; the marketplace should remain idempotent.

### Q12. What credentials does a seller need?

A seller needs an API key for server-to-Druto requests and a separate webhook signing secret for Druto-to-server events. Both stay in server environment variables. The receiving wallet address is public, but its private key must never be sent to Druto or embedded in frontend code.

### Q13. How is seller wallet ownership verified?

Druto creates a short-lived, domain-bound challenge containing the seller identity, wallet, origin, and chain. The seller signs the exact message with an EVM personal-signature method. Druto recovers the signer address and compares it with the proposed wallet. This is an offchain signature and does not move USDC.

### Q14. What is the current network and asset scope?

This demonstration uses Arc Testnet and USDC only. The configured chain ID and token configuration are treated as environment settings, and the checkout displays the network and asset before approval. Mainnet deployment, operational monitoring, and production credential policies are follow-up hardening work.

### Q15. How would you monitor this in production?

A production integration should monitor Payment Intent state changes, webhook delivery latency and retry counts, verification failures, reconciliation mismatches, duplicate event attempts, and Arc explorer links. It should also retain the external order ID, Payment Intent ID, transaction hash, and event ID for support and audit workflows.

### Q16. What happens if the seller’s wallet changes?

The seller should register a new wallet through the ownership-verification flow rather than changing a frontend constant. A controlled account transition can require fresh signature proof and administrator or policy approval before new Payment Intents resolve to the new destination.

### Q17. What is the most important production limitation in this demo?

This is a real testnet foundation, not a claim that the system is ready for mainnet customer funds. Before mainnet, the team should complete mainnet configuration review, credential rotation and scopes, webhook monitoring, reconciliation tooling, dispute/refund policy, rate limiting, and operational incident procedures.

### Q18. What should the Arc team inspect during the demo?

The most useful checkpoints are the displayed Arc Testnet recipient and amount before approval, the succeeded Druto receipt, the Arcscan transaction showing the USDC transfer, and the seller dashboard row containing the same order reference and transaction hash. Those four views connect the buyer action, Arc settlement, Druto verification, and seller operations.
