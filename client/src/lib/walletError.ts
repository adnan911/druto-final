export function checkoutWalletError(error: unknown, transactionSubmitted: boolean): string {
  if (transactionSubmitted) {
    return "Transaction may have been sent. Check wallet activity and retry verification from this checkout; do not send another payment.";
  }
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  if (code === "4001" || /user rejected|user denied|request rejected/i.test(message)) {
    return "Wallet confirmation was cancelled. No payment was submitted by this checkout.";
  }
  if (/insufficient funds/i.test(message)) {
    return "Wallet reports insufficient Arc Testnet USDC for payment or gas.";
  }
  return "Wallet could not submit the payment. Check wallet activity and Arc Testnet RPC before retrying.";
}
