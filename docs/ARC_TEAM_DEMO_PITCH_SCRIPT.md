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
