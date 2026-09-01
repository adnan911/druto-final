import { parsePaymentVerifiedEvent, verifyWebhookSignature } from "@druto/sdk";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MARKETPLACE_ID = process.env.NEXT_PUBLIC_DRUTO_MARKETPLACE_ID ?? "luvre-franc";
const SELLER_ID = process.env.NEXT_PUBLIC_DRUTO_SELLER_ID ?? "luvre-main";

export async function POST(request: Request) {
  // Important: read the raw body first. Do not call request.json() before
  // verifying the signature because the signature is calculated over raw bytes.
  const rawBody = await request.text();
  const signature = request.headers.get("druto-signature") ?? "";
  const eventId = request.headers.get("x-druto-event-id") ?? "";
  const secret = process.env.DRUTO_WEBHOOK_SECRET ?? "";

  if (!secret) {
    return Response.json({ error: "Webhook is not configured" }, { status: 503 });
  }

  if (!eventId || eventId.length > 200) {
    return Response.json({ error: "Missing or invalid event ID" }, { status: 400 });
  }

  const signatureIsValid = await verifyWebhookSignature(secret, rawBody, signature);
  if (!signatureIsValid) {
    return Response.json({ error: "Invalid Druto signature" }, { status: 401 });
  }

  const event = parsePaymentVerifiedEvent(rawBody);
  if (!event || event.id !== eventId) {
    return Response.json({ error: "Invalid or mismatched Druto event" }, { status: 400 });
  }

  const payment = event.data;
  if (payment.marketplaceId !== MARKETPLACE_ID || payment.sellerId !== SELLER_ID) {
    return Response.json({ error: "Event is for a different seller" }, { status: 403 });
  }

  if (payment.asset !== "USDC" || payment.network !== "arc-testnet") {
    return Response.json({ error: "Unsupported payment rail" }, { status: 422 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Create a unique event record first. Add a unique constraint on eventId.
      // If Druto retries the same event, this prevents double fulfillment.
      await tx.webhookEvent.create({
        data: {
          eventId,
          type: "payment.verified",
          paymentIntentId: payment.paymentIntentId,
        },
      });

      const order = await tx.order.findUnique({
        where: { externalOrderId: payment.externalOrderId },
      });

      if (!order) {
        throw new Error("ORDER_NOT_FOUND");
      }

      // Never trust the amount from the browser. Compare the verified Druto
      // amount with the amount stored on the order when the intent was created.
      if (Math.abs(Number(order.totalUsdc) - Number(payment.amount)) > 0.000001) {
        throw new Error("AMOUNT_MISMATCH");
      }

      // Idempotent update: a paid order remains paid if Druto retries an event.
      if (order.status !== "PAID") {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: "PAID",
            drutoPaymentIntentId: payment.paymentIntentId,
            transactionHash: payment.transactionHash,
            paidAt: new Date(),
          },
        });
      }
    });
  } catch (error) {
    // Prisma error code P2002 means the eventId unique constraint already exists.
    // Returning 200 tells Druto the duplicate was safely received.
    if (isUniqueConstraintError(error)) {
      return Response.json({ received: true, duplicate: true, eventId });
    }

    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
      console.error("[Druto webhook] order not found", { eventId, externalOrderId: payment.externalOrderId });
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    if (error instanceof Error && error.message === "AMOUNT_MISMATCH") {
      console.error("[Druto webhook] amount mismatch", { eventId, paymentIntentId: payment.paymentIntentId });
      return Response.json({ error: "Payment amount mismatch" }, { status: 409 });
    }

    console.error("[Druto webhook] order update failed", { eventId, error });
    return Response.json({ error: "Temporary order update failure" }, { status: 500 });
  }

  return Response.json({ received: true, verified: true, eventId });
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002",
  );
}
