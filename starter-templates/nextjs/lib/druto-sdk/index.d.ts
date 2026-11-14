export interface PaymentIntentRequest {
  amount: string | number;
  currency?: string;
  externalOrderId?: string;
  [key: string]: any;
}

export class Druto {
  constructor(options: { apiKey: string; baseUrl?: string; network?: "arc-testnet" });
  paymentIntents: {
    create(params: PaymentIntentRequest): Promise<PaymentSession>;
    retrieve(id: string): Promise<PaymentSession>;
  };
}

export function verifyDrutoWebhook(input: { payload: string; signature: string; secret: string }): Promise<boolean>;

export interface PaymentSession {
  id: string;
  checkoutUrl: string;
  redirectUrl?: string;
  [key: string]: any;
}

export class DrutoCheckout {
  constructor(options: {
    environment?: string;
    network?: string;
    asset?: string;
    checkoutBaseUrl?: string;
    createPayment?: (request: PaymentIntentRequest) => Promise<PaymentSession>;
  });
  createPayment(request: PaymentIntentRequest): Promise<PaymentSession>;
  openCheckout(session: PaymentSession): void;
}

export function verifyWebhookSignature(secret: string, rawBody: string, signature: string): Promise<boolean>;

export function parsePaymentVerifiedEvent(rawBody: string): {
  id: string;
  type: string;
  data: {
    externalOrderId: string;
    [key: string]: any;
  };
} | null;
