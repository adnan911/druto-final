import { parseMarketplaceOrderContext } from "./marketplace";

export type ClipboardWriter = { writeText: (value: string) => Promise<void> };

export async function copyReceiptValue(value: string, clipboard?: ClipboardWriter): Promise<boolean> {
  const writer = clipboard ?? (typeof navigator !== "undefined" ? navigator.clipboard : undefined);
  if (!writer?.writeText) return false;
  try {
    await writer.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function buildReceiptSummary(intent: { amountAtomic: number | string; status: string; itemName: string; buyerLabel?: string | null; orderContext?: string | null }) {
  const orderContext = parseMarketplaceOrderContext(intent.orderContext);
  const lineItems = orderContext?.items?.length ? orderContext.items : [{ productId: "fallback", name: intent.itemName, seller: "Merchant", unitPrice: Number(intent.amountAtomic) / 1_000_000, quantity: 1 }];
  return {
    amount: (Number(intent.amountAtomic) / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2 }),
    isSucceeded: intent.status === "succeeded",
    orderContext,
    lineItems,
    buyerEmail: orderContext?.buyerEmail ?? intent.buyerLabel ?? "Wallet buyer",
    shipping: orderContext?.shippingAddress,
  };
}
