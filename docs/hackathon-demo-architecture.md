# Druto marketplace-to-payment hackathon demo

## Short answer

Yes, the complete presentation narrative is possible. The safest hackathon implementation is a **hybrid demo**: make the user journey and dashboards fully real in the browser, use a real Arc Testnet USDC transaction only if wallet and chain integration are stable before the presentation, and keep a deterministic demo fallback so the presentation cannot fail because of a faucet, wallet, RPC, or indexer problem.

The audience should experience one continuous story:

```text
Buyer marketplace → Item checkout → Pay with Druto
→ Druto payment window → Wallet or QR → Arc Testnet USDC
→ Payment final → Buyer receipt + Seller dashboard update
```

## Recommended architecture

| Component | Responsibility | Hackathon implementation |
|---|---|---|
| Marketplace | Shows products, cart, item detail, and order checkout | Frontend page with one demo product and an order ID |
| Marketplace order state | Stores the item, price, buyer, and order status | Local state or a small shared demo store |
| Druto Payment Intent | Defines the expected amount, asset, network, recipient, and order ID | Mock object first; real server endpoint later if available |
| Druto payment window | Shows USDC, Arc Testnet, destination, wallet/QR options, and payment status | Reuse the standalone checkout UI |
| Arc Testnet | Source of truth for a real transfer | Optional real testnet transfer; otherwise explicit simulated event |
| Seller dashboard | Shows transaction, sold item, balance, and settlement state | Reads the same shared demo transaction state |
| Buyer receipt | Shows transaction ID, item, amount, and payment status | Reads the same shared demo transaction state |
| Reconciliation/webhook | Connects a verified payment to marketplace fulfillment | Simulated event locally; real webhook is future infrastructure |

## The exact demo sequence

### 1. Start in the marketplace as the buyer

Show a product card with:

- Product name: `Northstar API Pro — annual access`.
- Price: `$1,240.00 USDC`.
- Seller: `Northstar AI`.
- Button: `Buy with Druto`.

When the buyer clicks the button, create an order context:

```json
{
  "order_id": "NS-1842",
  "item_id": "api-pro-annual",
  "item_name": "Northstar API Pro — annual access",
  "amount": "1240.00",
  "asset": "USDC",
  "network": "Arc Testnet",
  "buyer": "Demo buyer",
  "seller": "Northstar AI",
  "status": "requires_payment"
}
```

### 2. Open Druto checkout

The marketplace opens the Druto hosted checkout or an embedded modal with the order context. The checkout must visibly show the same item/order reference and exact amount so the audience can see that the marketplace and payment request agree.

The Druto window should display:

- `Order NS-1842`.
- `Northstar API Pro — annual access`.
- `$1,240.00 USDC`.
- `Arc Testnet`.
- Merchant wallet or payment-router destination.
- `Connect wallet` and `Pay with QR`.
- Expiration and test environment labels.

### 3. Pay with wallet or QR

For the main presentation path, use **Connect wallet** because the audience can see a clear wallet approval step. Keep QR as a secondary path in case the presenter wants to show mobile-wallet support.

If the real wallet integration is stable, the customer approves a real Arc Testnet USDC transfer. If not, the presenter clicks `Simulate payment` after the UI has shown the wallet connection. The button must be labelled clearly as a demo action and should move through:

```text
Ready to pay → Wallet connected → Submitted → Verifying → Payment final
```

Do not claim a simulated state is a blockchain-confirmed payment.

### 4. Show payment completion

After the payment reaches `Payment final`, the checkout should show:

- A transaction reference.
- The marketplace order ID.
- Amount and asset.
- Arc Testnet label.
- A `Return to marketplace` action.

The marketplace order should change from `Payment required` to `Paid / Fulfillment ready`.

### 5. Show the seller dashboard

Switch to the seller view and show the same transaction in three places:

| Seller view | Expected result |
|---|---|
| Transaction history | A new `Succeeded` transaction for `$1,240.00 USDC` appears with `NS-1842`. |
| Sold items | `Northstar API Pro — annual access` appears as sold. |
| Balance | Available balance increases by the demo amount, or the UI clearly shows an expected/available distinction if settlement is pending. |

The seller dashboard should also show the payment method, buyer reference, destination, testnet, and transaction hash or demo transaction reference.

### 6. Show the buyer transaction view

Switch to the buyer receipt or buyer transaction page and show:

- `Northstar API Pro — annual access`.
- `$1,240.00 USDC`.
- `Paid`.
- `Arc Testnet`.
- Payment Intent ID.
- Transaction hash or explicit demo transaction ID.
- Seller name.
- Timestamp.

The buyer and seller views should read from the same transaction record. That is the key demonstration that Druto is the shared payment truth between marketplace participants.

## Shared transaction record

Use one normalized record for all three surfaces:

```ts
{
  id: "pay_01J8N2F4",
  orderId: "NS-1842",
  itemId: "api-pro-annual",
  itemName: "Northstar API Pro — annual access",
  buyerId: "buyer_demo_01",
  buyerName: "Demo buyer",
  sellerId: "seller_northstar",
  sellerName: "Northstar AI",
  amount: 1240,
  asset: "USDC",
  network: "Arc Testnet",
  destinationType: "merchant_wallet",
  destination: "0x4e2C…91a8",
  status: "succeeded",
  paymentIntentId: "pi_01J8N4W2",
  transactionHash: "0x7a2b…d91c",
  createdAt: "2026-08-21T09:42:18Z",
  finalizedAt: "2026-08-21T09:42:20Z",
  source: "demo" 
}
```

When real chain integration is added, `source` can become `arc_testnet` and `transactionHash` can be populated from the actual transfer. The seller dashboard and buyer view should not need to be redesigned.

## Demo mode versus real testnet mode

Use an explicit environment switch:

```ts
const DEMO_MODE = true;
```

In demo mode, the application runs a deterministic local state transition and marks the record with `source: "demo"`. In testnet mode, the payment window connects to an EVM wallet, requests or executes the transfer, waits for backend verification, and updates the shared record only after the verified event.

The presentation should use a visible `Demo mode` or `Arc Testnet` badge that accurately describes the active path.

## What should be real for the hackathon

The strongest compromise is:

1. The marketplace product and checkout journey are real UI interactions.
2. The Druto payment window is a real reusable component.
3. The buyer and seller views share one normalized transaction state.
4. The Arc Testnet wallet transfer is real only if it has been tested repeatedly before the presentation.
5. The fallback simulation is always available and clearly labelled.
6. The dashboard balance is a demo balance unless it is backed by verified ledger logic.

## Presentation script

> “This is a marketplace order for Northstar API Pro. The buyer chooses Pay with Druto, and the marketplace creates a payment request for exactly 1,240 USDC on Arc Testnet. Druto opens the payment window with the merchant destination, wallet and QR options, and the order reference. The buyer approves the payment. Once the payment reaches finality—or the demo event is verified—the buyer receives a receipt and the seller sees the same payment in transaction history, sold items, and balance. Druto is the shared payment layer between the marketplace and the seller.”

## Failure recovery during the presentation

Keep a `Reset demo` control that returns the order and payment record to `requires_payment`. Prepare a second known-good demo transaction in case the first wallet connection or RPC call fails. If a real transaction is not confirmed within the presentation window, switch to demo mode and say: “The same flow is now running in deterministic demo mode; the production boundary is the verified Arc event and webhook.”

## Important limitation to state honestly

The current frontend and standalone ZIP can demonstrate this entire narrative visually with simulated payment states. They cannot yet prove a real Arc Testnet transaction unless the wallet connector, USDC transfer, transaction observer, backend state, and webhook path are implemented and tested together.
