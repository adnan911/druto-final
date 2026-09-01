# Druto Storefront Integration Guide

Connect any ecommerce storefront (Next.js, Remix, Shopify custom app, Express, or custom web shop) to Druto for automated onchain stablecoin checkout on Arc Testnet.

---

## 1. Overview & Architecture

When integrating Druto with your storefront:
1. **Storefront Server** uses your **Druto API Key** to create a **Payment Intent** when the buyer clicks checkout.
2. **Buyer** is directed to the hosted Druto checkout (`https://druto.xyz/checkout/:paymentIntentId`) or embedded component.
3. **Buyer** pays USDC on **Arc Testnet**.
4. **Druto Engine** verifies the transaction onchain and sends a signed **`payment.verified` Webhook** to your server.
5. **Your Server** verifies the HMAC signature using your **Webhook Secret** and marks the order as paid in your store database.
6. **Seller Dashboard** in Druto updates immediately with gross balance, order items, and Arcscan transaction hash.

---

## 2. Step-by-Step Setup

### Step 1: Join Druto & Get Credentials
1. Open the Druto Dashboard (`https://druto.xyz/dashboard` or `http://localhost:3000/dashboard`).
2. Sign in with your **EVM Wallet** (MetaMask, Coinbase, etc.) or **Privy** (Email / Google).
3. Navigate to **Start with Druto / Seller Setup**:
   - **Marketplace ID**: `your-store-brand` (e.g. `dashda` or `luvre-franc`)
   - **Seller ID**: `store-main` (or seller account ID)
   - **Display Name**: `My Storefront Name`
   - **Payment Destination**: Your receiving EVM wallet address on Arc Testnet (`0x...`)
   - **Webhook URL**: `https://yourdomain.com/api/webhooks/druto`
4. Copy the generated **API Key** (`druto_sk_live_...`) and **Webhook Secret** (`whsec_...`).

---

## 3. Creating a Payment Intent from your Storefront

In your storefront backend (e.g., Next.js API route or Express route):

```typescript
// app/api/checkout/route.ts (Next.js App Router)
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { orderId, items, totalAmount, customerEmail, shippingAddress } = await req.json();

  const response = await fetch("https://druto.xyz/api/trpc/payments.createIntent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.DRUTO_API_KEY}`,
    },
    body: JSON.stringify({
      externalOrderId: orderId,
      itemName: items.map((i: any) => `${i.name} (x${i.quantity})`).join(", "),
      amount: totalAmount.toFixed(2), // e.g. "49.00"
      buyerLabel: customerEmail,
      returnUrl: `https://yourdomain.com/orders/${orderId}?druto_intent={INTENT_ID}`,
      seller: {
        marketplaceId: process.env.DRUTO_MARKETPLACE_ID,
        sellerId: process.env.DRUTO_SELLER_ID,
      },
      orderContext: {
        items: items.map((i: any) => ({
          productId: i.id,
          name: i.name,
          seller: process.env.DRUTO_SELLER_ID,
          unitPrice: i.price,
          quantity: i.quantity,
        })),
        delivery: "Standard Express",
        shippingAddress: {
          name: shippingAddress.name,
          line1: shippingAddress.line1,
          city: shippingAddress.city,
          postalCode: shippingAddress.postalCode,
          country: shippingAddress.country,
        },
        buyerEmail: customerEmail,
      },
    }),
  });

  const data = await response.json();
  const paymentIntent = data.result?.data;

  // Return checkout URL to frontend
  return NextResponse.json({
    checkoutUrl: paymentIntent.checkoutUrl,
    paymentIntentId: paymentIntent.id,
  });
}
```

---

## 4. Webhook Receiver (Next.js / Node.js)

When a payment succeeds, Druto sends an HTTP POST with header `Druto-Signature`:
`t=1725184800,v1=6a7b8c...`

```typescript
// app/api/webhooks/druto/route.ts
import { NextResponse } from "next/server";
import crypto from "node:crypto";

function verifyDrutoSignature(payload: string, signatureHeader: string, secret: string): boolean {
  try {
    const parts = Object.fromEntries(
      signatureHeader.split(",").map((part) => {
        const [k, v] = part.split("=");
        return [k.trim(), v.trim()];
      })
    );

    const timestamp = parts.t;
    const signature = parts.v1;
    if (!timestamp || !signature) return false;

    // Check tolerance (5 minutes)
    const ageSeconds = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
    if (ageSeconds > 300) return false;

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (err) {
    return false;
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("Druto-Signature");

  if (!signature || !verifyDrutoSignature(rawBody, signature, process.env.DRUTO_WEBHOOK_SECRET!)) {
    return NextResponse.json({ error: "Invalid Druto webhook signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);

  if (event.type === "payment.verified") {
    const { paymentIntentId, externalOrderId, amountAtomic, transactionHash, merchantAddress, buyerAddress } = event.data;

    console.log(`[Druto Webhook] Payment Verified for Order ${externalOrderId}:`, {
      paymentIntentId,
      usdcAmount: Number(amountAtomic) / 1_000_000,
      transactionHash,
      merchantAddress,
      buyerAddress,
    });

    // 1. Mark order as paid in store database
    // await db.orders.update({ where: { id: externalOrderId }, data: { status: "PAID", txHash: transactionHash } });

    // 2. Trigger automated fulfillment / shipping email
  }

  return NextResponse.json({ received: true });
}
```

---

## 5. Testing on Arc Testnet

1. **Network Configuration**:
   - Network Name: `Arc Testnet`
   - RPC URL: `https://rpc.testnet.arc.io`
   - Chain ID: `5042002`
   - Currency Symbol: `USDC`
   - Explorer: `https://explorer.testnet.arc.io`
2. **Get Testnet USDC**:
   - Use the Circle Faucet (`https://faucet.circle.com/`) to claim testnet USDC on Arc.
3. **Execute Flow**:
   - Complete a checkout on your storefront.
   - Confirm the transaction in MetaMask.
   - Check your store database to verify the order status updated from webhook.
   - Check the **Druto Dashboard** (`/dashboard`) to verify the balance and transaction proof appear in real time!
