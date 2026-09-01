# Druto Storefront Developer Master Integration Guide

Complete end-to-end guide for building, connecting, and deploying an online storefront integrated with Druto for native USDC checkout and automated dashboard synchronization on Arc Testnet.

---

## 1. Overview & Architecture

Druto provides a server-controlled stablecoin payment infrastructure on the **Arc Testnet**. When a customer buys from your storefront:

```
 ┌──────────────────────┐         ┌──────────────────────┐         ┌──────────────────────┐
 │ 1. Storefront Server │ ──────► │   2. Druto Engine    │ ──────► │ 3. Buyer Checkout UI │
 │                      │         │                      │         │                      │
 │ • Calculates Total   │         │ • Validates API Key  │         │ • Connects EVM Wallet│
 │ • Creates Intent     │         │ • Resolves Wallet    │         │ • Sends Arc USDC     │
 └──────────────────────┘         └──────────────────────┘         └──────────────────────┘
                                             │
                                             ▼
 ┌──────────────────────┐         ┌──────────────────────┐
 │ 5. Seller Dashboard  │ ◄────── │ 4. Arc Onchain Verify│
 │                      │         │                      │
 │ • Live Gross Volume  │         │ • Confirms Finality  │
 │ • Recent Orders      │         │ • Emits Signed Event │
 │ • Arcscan Proof Link │         │ • Dispatches Webhook │
 └──────────────────────┘         └──────────────────────┘
```

### Key Security & Design Principles:
1. **Never Accept Destination Wallets or Prices from the Browser**: All Payment Intents are created server-to-server with your `DRUTO_API_KEY`.
2. **Direct Settlement**: Buyer USDC transfers settle directly to the seller's registered EVM wallet on Arc Testnet with zero escrow custody.
3. **Fulfill from Signed Events, Not Redirects**: Orders are marked as `PAID` only when your backend verifies the HMAC-SHA256 signature on the `payment.verified` webhook.
4. **Instant Dashboard Sync**: Every verified payment automatically updates the seller's revenue, order queue, and ledger inside the Druto Dashboard.

---

## 2. Included Starter Packages

In the [`guide/`](./) directory, you will find three pre-built packages:

| Package | Filename | Description |
|---|---|---|
| **Core SDK** | `druto-sdk-finalX-0.1.0.zip` | Standalone `@druto/sdk` TypeScript package containing typed API clients, payment intent builders, and webhook verification helpers. |
| **Next.js Starter** | `druto-nextjs-starter-finalX-0.1.0.zip` | Full Next.js (App Router) ecommerce store template with product catalog, cart, checkout button, and `/api/webhooks/druto` receiver. |
| **Integration Kit** | `druto-seller-integration-kit-finalX-0.1.0.zip` | Combined bundle with SDK, Next.js starter, and security runbooks. |

---

## 3. Step-by-Step Integration

### Step 1: Register on the Druto Dashboard & Get Credentials

1. Open the **Druto Dashboard** (`https://druto.xyz/dashboard` or `http://localhost:3000/dashboard`).
2. Sign in with your **EVM Wallet** (MetaMask, Coinbase, Rainbow) or **Privy** (Email / Google).
3. Navigate to **Seller Setup / Start with Druto**:
   - **Marketplace ID**: `mystore` *(your store brand/platform slug)*
   - **Seller ID**: `seller_main` *(your unique seller identifier)*
   - **Display Name**: `Acme Boutique`
   - **Payment Destination**: `0x1234...` *(your Arc Testnet USDC receiving wallet address)*
   - **Webhook URL**: `https://mystore.com/api/webhooks/druto` *(or `http://localhost:3000/api/webhooks/druto` for local dev)*
4. Click **Create Seller Workspace**.
5. Druto will display your one-time credentials. **Copy and save both immediately**:
   - **`DRUTO_API_KEY`**: `druto_sk_live_...`
   - **`DRUTO_WEBHOOK_SECRET`**: `whsec_...`

---

### Step 2: Configure Environment Variables

In your storefront project root, create a `.env.local` file (and configure these in your Vercel Project Settings):

```env
# -------------------------------------------------------------
# Druto Server Credentials (KEEP SECRET — NEVER EXPOSE ON CLIENT)
# -------------------------------------------------------------
DRUTO_API_KEY=druto_sk_live_your_api_key_here
DRUTO_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# -------------------------------------------------------------
# Druto Endpoints
# -------------------------------------------------------------
DRUTO_CHECKOUT_BASE_URL=https://druto.xyz
DRUTO_CREATE_INTENT_ENDPOINT=/api/trpc/payments.createIntent

# -------------------------------------------------------------
# Storefront Identity
# -------------------------------------------------------------
NEXT_PUBLIC_DRUTO_MARKETPLACE_ID=mystore
NEXT_PUBLIC_DRUTO_SELLER_ID=seller_main
NEXT_PUBLIC_SHOP_URL=https://mystore.com
```

---

### Step 3: Create the Server-Side Payment Intent Endpoint

Create an API route in your storefront backend (e.g. `app/api/druto/create-payment/route.ts` in Next.js App Router):

```typescript
// app/api/druto/create-payment/route.ts
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { orderId, items, customerEmail, shippingAddress } = await request.json();

    // 1. Recalculate trusted total from your product database (never trust client amounts)
    const trustedTotal = items.reduce(
      (sum: number, item: any) => sum + item.unitPrice * item.quantity,
      0
    );

    const drutoUrl = `${process.env.DRUTO_CHECKOUT_BASE_URL}${process.env.DRUTO_CREATE_INTENT_ENDPOINT}`;

    // 2. Call Druto API with your server API key
    const response = await fetch(drutoUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.DRUTO_API_KEY}`,
      },
      body: JSON.stringify({
        externalOrderId: orderId,
        idempotencyKey: `order-${orderId}`,
        amount: trustedTotal.toFixed(2), // e.g. "49.00"
        itemName: items.map((i: any) => `${i.name} (x${i.quantity})`).join(", "),
        buyerLabel: customerEmail,
        returnUrl: `${process.env.NEXT_PUBLIC_SHOP_URL}/orders/${orderId}?intent={INTENT_ID}`,
        seller: {
          marketplaceId: process.env.NEXT_PUBLIC_DRUTO_MARKETPLACE_ID,
          sellerId: process.env.NEXT_PUBLIC_DRUTO_SELLER_ID,
        },
        orderContext: {
          items: items.map((i: any) => ({
            productId: i.id,
            name: i.name,
            seller: process.env.NEXT_PUBLIC_DRUTO_SELLER_ID,
            unitPrice: i.unitPrice,
            quantity: i.quantity,
          })),
          delivery: "Standard Delivery",
          shippingAddress: shippingAddress,
          buyerEmail: customerEmail,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      console.error("[Druto Intent Error]", data.error);
      return NextResponse.json(
        { error: data.error?.message || "Failed to create Druto payment intent" },
        { status: 400 }
      );
    }

    const paymentSession = data.result?.data;

    // 3. Return the hosted checkout URL to frontend
    return NextResponse.json({
      checkoutUrl: paymentSession.checkoutUrl,
      paymentIntentId: paymentSession.id,
    });
  } catch (error: any) {
    console.error("[Create Payment Error]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

---

### Step 4: Add the "Pay with Druto (USDC)" Frontend Button

In your storefront checkout component:

```tsx
// components/CheckoutButton.tsx
"use client";

import { useState } from "react";

export function DrutoCheckoutButton({ orderId, items, customerEmail, shippingAddress }: any) {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/druto/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          items,
          customerEmail,
          shippingAddress,
        }),
      });

      const data = await response.json();

      if (data.checkoutUrl) {
        // Redirect to Druto's secure hosted payment page
        window.location.href = data.checkoutUrl;
      } else {
        alert(data.error || "Checkout could not be initialized");
      }
    } catch (err: any) {
      alert("Network error starting checkout");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleCheckout}
      disabled={loading}
      className="w-full bg-[#2458d6] hover:bg-[#1b44ab] text-white py-3 px-6 rounded-lg font-medium transition flex items-center justify-center gap-2"
    >
      {loading ? "Preparing Arc Checkout…" : "Pay with Druto (USDC on Arc)"}
    </button>
  );
}
```

---

### Step 5: Implement the Signed Webhook Receiver

When the buyer pays on Arc Testnet, Druto validates the onchain transfer and delivers an HTTP POST with the `Druto-Signature` header:
`t=1725184800,v1=6a7b8c9d0e...`

Create `app/api/webhooks/druto/route.ts`:

```typescript
// app/api/webhooks/druto/route.ts
import { NextResponse } from "next/server";
import crypto from "node:crypto";

function verifyDrutoSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
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

    // Reject requests older than 5 minutes to prevent replay attacks
    const ageSeconds = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
    if (ageSeconds > 300) return false;

    // Calculate expected HMAC-SHA256 signature
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("druto-signature");

  if (!signatureHeader || !verifyDrutoSignature(rawBody, signatureHeader, process.env.DRUTO_WEBHOOK_SECRET!)) {
    return NextResponse.json({ error: "Invalid Druto webhook signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);

  // Handle payment.verified event
  if (event.type === "payment.verified") {
    const {
      eventId,
      paymentIntentId,
      externalOrderId,
      amountAtomic,
      transactionHash,
      buyerAddress,
      merchantAddress,
    } = event.data;

    console.log(`[Druto Webhook] ✅ Verified Payment for Order ${externalOrderId}:`, {
      eventId,
      paymentIntentId,
      usdcAmount: Number(amountAtomic) / 1_000_000,
      transactionHash,
      buyerAddress,
      merchantAddress,
    });

    // 1. Check if eventId was already processed (deduplication)
    // 2. Mark order as PAID in your store database
    // 3. Send order confirmation email / trigger fulfillment
  }

  return NextResponse.json({ received: true });
}
```

---

## 4. Testing the Integration on Arc Testnet

1. **Arc Testnet Network Specs**:
   - **Network Name**: `Arc Testnet`
   - **RPC URL**: `https://rpc.testnet.arc.io`
   - **Chain ID**: `5042002`
   - **Currency Symbol**: `USDC` (18 decimals native, 6 decimals ERC20)
   - **USDC Contract Address**: `0x3600000000000000000000000000000000000000`
   - **Block Explorer**: [https://explorer.testnet.arc.io](https://explorer.testnet.arc.io)

2. **Get Testnet USDC**:
   - Visit the **Circle Faucet**: [https://faucet.circle.com/](https://faucet.circle.com/)
   - Select Arc Testnet and request test USDC.

3. **Verify the Payment Loop**:
   - Place a test order in your storefront and click **Pay with Druto**.
   - Complete the USDC transfer on the hosted checkout page.
   - Confirm your store received the webhook and marked the order as paid.
   - Open your **Druto Dashboard** (`/dashboard` and `/payments`) to see your revenue balance updated and inspect the onchain **Arcscan transaction proof**!
