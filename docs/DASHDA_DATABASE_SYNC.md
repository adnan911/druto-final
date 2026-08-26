# Dashda order database synchronization

This example shows how a Dashda backend can connect verified Druto payments to its own order database. The browser redirect is not payment proof. Dashda should mark an order paid only after the signed `payment.verified` webhook has passed signature and replay checks.

## Recommended order-payment fields

Add these fields to the Dashda order or order-payment table:

```prisma
model OrderPayment {
  id                    String   @id @default(cuid())
  orderId               String   @unique
  drutoPaymentIntentId  String?  @unique
  arcTransactionHash    String?
  amountUsdc            Decimal?
  status                String   @default("pending")
  paidAt                DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}

model DrutoWebhookEvent {
  eventId     String   @id
  eventType   String
  receivedAt  DateTime @default(now())
}
```

Adapt the types to the ORM already used by Dashda. The important properties are the unique Druto event ID, unique Payment Intent ID, transaction hash, status, and the Dashda order ID.

## Server-only webhook route

Install the SDK in the Dashda server and preserve the raw request body. Do not parse JSON before signature verification.

```ts
import { parsePaymentVerifiedEvent, verifyWebhookSignature } from "@druto/sdk";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("druto-signature") ?? "";
  const eventId = request.headers.get("x-druto-event-id") ?? "";

  if (!eventId) return new Response("missing event id", { status: 400 });

  const valid = await verifyWebhookSignature(
    process.env.DRUTO_WEBHOOK_SECRET ?? "",
    rawBody,
    signature,
  );
  if (!valid) return new Response("invalid signature", { status: 401 });

  const event = parsePaymentVerifiedEvent(rawBody);
  if (!event || event.type !== "payment.verified") {
    return new Response("invalid event", { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.drutoWebhookEvent.findUnique({
      where: { eventId },
    });
    if (existing) return;

    const orderId = event.data.externalOrderId;
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error(`Dashda order not found: ${orderId}`);

    await tx.orderPayment.upsert({
      where: { orderId },
      create: {
        orderId,
        drutoPaymentIntentId: event.data.paymentIntentId,
        arcTransactionHash: event.data.transactionHash,
        amountUsdc: event.data.amount,
        status: "paid",
        paidAt: new Date(),
      },
      update: {
        drutoPaymentIntentId: event.data.paymentIntentId,
        arcTransactionHash: event.data.transactionHash,
        amountUsdc: event.data.amount,
        status: "paid",
        paidAt: new Date(),
      },
    });

    await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus: "paid" },
    });

    await tx.drutoWebhookEvent.create({
      data: { eventId, eventType: event.type },
    });
  });

  return Response.json({ received: true });
}
```

In a production implementation, use a fulfillment queue or an outbox record inside the same transaction. Do not send email, ship goods, or decrement inventory before the database transaction commits. If a duplicate event arrives, return HTTP 200 without repeating fulfillment.

## Create-payment connection

When Dashda creates a Payment Intent, save the returned intent ID immediately:

```ts
const payment = await druto.createPayment({
  orderId: order.id,
  itemName: `${order.items[0].name} × ${order.items[0].quantity}`,
  amount: order.totalUsdc,
  buyerEmail: customer.email,
  seller: { marketplaceId: "dashda", sellerId: order.sellerId },
  returnUrl: `https://dashda.example/orders/${order.id}/paid`,
});

await prisma.orderPayment.upsert({
  where: { orderId: order.id },
  create: {
    orderId: order.id,
    drutoPaymentIntentId: payment.paymentIntentId,
    amountUsdc: order.totalUsdc,
    status: "pending",
  },
  update: {
    drutoPaymentIntentId: payment.paymentIntentId,
    amountUsdc: order.totalUsdc,
    status: "pending",
  },
});

return Response.json({ checkoutUrl: payment.checkoutUrl });
```

The exact response property may be named `paymentIntentId` or `id` depending on the Druto transport adapter used by Dashda. Store the identifier returned by the adapter and confirm it against the SDK type definition.

## Dashboard synchronization

The Druto dashboard receives the payment because Dashda created the Payment Intent through Druto and Druto verified the Arc Testnet USDC transfer. Dashda does not push a second “mark paid” command to the Druto dashboard. Instead, the shared identifiers connect both systems: `externalOrderId` connects to Dashda, `paymentIntentId` connects the payment lifecycle, and `transactionHash` provides the onchain proof.

Use HTTPS for the webhook endpoint, keep `DRUTO_API_KEY` and `DRUTO_WEBHOOK_SECRET` server-only, and test success, expired payment, wrong amount, duplicate webhook, and failed delivery before accepting customer funds.
