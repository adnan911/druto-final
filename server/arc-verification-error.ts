import { TRPCError } from "@trpc/server";

const buyerFacingFailures = new Set([
  "Arc transaction reverted",
  "Unexpected RPC chain",
  "Payment transaction is outside the checkout time window",
  "Payment settlement terms are inconsistent",
  "Payment requires the quoted split transaction",
  "No matching USDC transfer or payment split found on Arc",
  "Direct payment requires payer confirmation signature",
  "Invalid payer confirmation signature",
]);

export function arcVerificationError(error: unknown): TRPCError {
  const message = error instanceof Error ? error.message : "";
  if (buyerFacingFailures.has(message)) {
    return new TRPCError({ code: "BAD_REQUEST", message });
  }
  // RPC transport errors may contain a full upstream response or URL. Keep
  // those details in server-side diagnostics, never in the buyer response.
  return new TRPCError({ code: "SERVICE_UNAVAILABLE",
    message: "Arc verification is temporarily unavailable. Check the payment status before sending funds again." });
}
