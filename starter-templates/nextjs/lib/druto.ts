import { DrutoCheckout, type PaymentIntentRequest, type PaymentSession } from "@druto/sdk";

export const druto = new DrutoCheckout({
  environment: "testnet",
  network: "arc",
  asset: "USDC",
  checkoutBaseUrl: process.env.DRUTO_CHECKOUT_BASE_URL!,
  createPayment: async (request: PaymentIntentRequest): Promise<PaymentSession> => {
    const endpoint = process.env.DRUTO_CREATE_INTENT_ENDPOINT ?? "/api/trpc/payments.createIntent";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${requireServerEnv("DRUTO_API_KEY")}`,
      },
      body: JSON.stringify({ json: request }),
    });
    if (!response.ok) throw new Error(`Druto create-intent request failed with HTTP ${response.status}`);
    const payload = await response.json() as { result?: { data?: { json?: PaymentSession } } };
    const session = payload.result?.data?.json;
    if (!session) throw new Error("Druto returned an invalid payment session");
    return session;
  },
});

export function requireServerEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
