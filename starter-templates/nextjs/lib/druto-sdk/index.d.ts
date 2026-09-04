export interface PaymentIntentRequest {
  amount?: number;
  currency?: string;
  externalOrderId?: string;
  [key: string]: any;
}

export interface PaymentSession {
  id?: string;
  checkoutUrl?: string;
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
