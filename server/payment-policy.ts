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

export function assertTransactionOwnership(storedIntentId: string, requestedIntentId: string) {
  if (storedIntentId !== requestedIntentId) throw new Error("Transaction hash is already attached to another Payment Intent");
}
