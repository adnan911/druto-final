"use client";

import { useState } from "react";

type PaymentState = "idle" | "loading" | "ready" | "error";

export function PayWithDrutoButton({
  orderId,
  itemName,
  amount,
  buyerEmail,
  marketplaceId,
  sellerId,
}: {
  orderId: string;
  itemName: string;
  amount: string;
  buyerEmail?: string;
  marketplaceId: string;
  sellerId: string;
}) {
  const [state, setState] = useState<PaymentState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const startPayment = async () => {
    setState("loading");
    setErrorMessage("");
    try {
      const response = await fetch("/api/druto/create-payment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId,
          itemName,
          amount,
          buyerEmail,
          marketplaceId,
          sellerId,
          returnUrl: `${window.location.origin}/orders/${orderId}/paid`,
        }),
      });
      const session = await response.json() as { checkoutUrl?: string; error?: string };
      if (!response.ok || !session.checkoutUrl) throw new Error(session.error ?? "Could not open Druto checkout");

      setState("ready");
      window.setTimeout(() => window.location.assign(session.checkoutUrl!), 500);
    } catch (error) {
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Could not start payment");
    }
  };

  const isBusy = state === "loading" || state === "ready";
  const label = state === "loading" ? "Preparing secure checkout…" : state === "ready" ? "Checkout ready — opening…" : "Pay with Druto";

  return <div className="druto-pay-shell">
    <button type="button" onClick={startPayment} disabled={isBusy} aria-describedby="druto-payment-status">
      {isBusy && <span className="druto-spinner" aria-hidden="true" />}
      <span>{label}</span>
    </button>
    <p id="druto-payment-status" className={`druto-pay-status druto-pay-${state}`} role="status" aria-live="polite">
      {state === "loading" && "Creating a server-side Payment Intent."}
      {state === "ready" && "Payment session created. Redirecting you to Druto."}
      {state === "error" && errorMessage}
    </p>
  </div>;
}
