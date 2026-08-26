import { parsePaymentVerifiedEvent, verifyWebhookSignature } from "@druto/sdk";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("druto-signature") ?? "";
  const eventId = request.headers.get("x-druto-event-id") ?? "";

  const valid = await verifyWebhookSignature(
    process.env.DRUTO_WEBHOOK_SECRET ?? "",
    rawBody,
    signature,
  );
  if (!valid) return new Response("invalid signature", { status: 401 });
  if (!eventId) return new Response("missing event id", { status: 400 });

  const event = parsePaymentVerifiedEvent(rawBody);
  if (!event) return new Response("invalid event", { status: 400 });

  // Replace these comments with your database transaction:
  // 1. Return 200 immediately if eventId is already processed.
  // 2. Match event.data.externalOrderId to the store order.
  // 3. Mark the order paid exactly once and store transactionHash.
  // 4. Record eventId before fulfillment can be retried.
  console.info("[Druto] verified event", event.id, event.type, event.data.externalOrderId);

  return Response.json({ received: true });
}
