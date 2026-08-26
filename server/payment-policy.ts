export type ExistingIntentDetails = {
  externalOrderId: string;
  itemName: string;
  amountAtomic: string;
};

export function assertIdempotentMatch(existing: ExistingIntentDetails, requested: ExistingIntentDetails) {
  if (existing.externalOrderId !== requested.externalOrderId || existing.itemName !== requested.itemName || existing.amountAtomic !== requested.amountAtomic) {
    throw new Error("Idempotency key was already used with different payment details");
  }
}

export function normalizeMarketplaceReturnUrl(value?: string) {
  if (!value) return "/";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.toString();
  } catch { /* invalid URL handled below */ }
  throw new Error("Return URL must be a relative path or an http(s) URL");
}

export function assertTransactionOwnership(storedIntentId: string, requestedIntentId: string) {
  if (storedIntentId !== requestedIntentId) throw new Error("Transaction hash is already attached to another Payment Intent");
}
