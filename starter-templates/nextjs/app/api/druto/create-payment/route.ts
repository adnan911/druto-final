import { druto } from "../../../../lib/druto";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      orderId?: string;
      itemName?: string;
      amount?: string | number;
      buyerEmail?: string;
      marketplaceId?: string;
      sellerId?: string;
      returnUrl?: string;
    };

    if (!body.orderId || !body.itemName || body.amount === undefined || !body.marketplaceId || !body.sellerId || !body.returnUrl) {
      return Response.json({ error: "orderId, itemName, amount, seller, and returnUrl are required" }, { status: 400 });
    }

    // In a real store, load the order from your database here and recalculate the amount.
    const session = await druto.createPayment({
      orderId: body.orderId,
      itemName: body.itemName,
      amount: body.amount,
      buyerEmail: body.buyerEmail,
      seller: { marketplaceId: body.marketplaceId, sellerId: body.sellerId },
      returnUrl: body.returnUrl,
    });

    return Response.json(session);
  } catch (error) {
    console.error("[Druto] create payment failed", error);
    return Response.json({ error: "Unable to create Druto payment" }, { status: 502 });
  }
}
