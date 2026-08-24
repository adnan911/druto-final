"use client";

import { useState } from "react";

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
  const [loading, setLoading] = useState(false);

  const startPayment = async () => {
    setLoading(true);
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
      window.location.assign(session.checkoutUrl);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not start payment");
      setLoading(false);
    }
  };

  return <button type="button" onClick={startPayment} disabled={loading}>
    {loading ? "Opening Druto…" : "Pay with Druto"}
  </button>;
}
