export function paymentProofMessage(input: { origin: string; paymentIntentId: string; transactionHash: string; merchantAddress: string; amountAtomic: string }) {
  return `Druto payment confirmation\nOrigin: ${input.origin}\nChain ID: 5042002\nPayment Intent: ${input.paymentIntentId}\nTransaction: ${input.transactionHash.toLowerCase()}\nRecipient: ${input.merchantAddress.toLowerCase()}\nUSDC atomic amount: ${input.amountAtomic}\nI authorize Druto to apply this transaction to this payment intent. This signature does not transfer funds.`;
}
