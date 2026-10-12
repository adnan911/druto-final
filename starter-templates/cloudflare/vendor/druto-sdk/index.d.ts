/** Druto Arc Testnet SDK. Keep API keys in server/Worker secrets, never browser code. */
export declare const DRUTO_TESTNET_URL = "https://druto-d1-testnet.robobq.workers.dev";
export type Seller = {
    marketplaceId: string;
    sellerId: string;
    merchantAccountId?: string;
};
export type OrderContext = {
    items: Array<{
        productId: string;
        name: string;
        seller: string;
        unitPrice: number;
        quantity: number;
    }>;
    delivery: string;
    shippingAddress: {
        name: string;
        line1: string;
        city: string;
        postalCode: string;
        country: string;
    };
    buyerEmail: string;
};
export type CreatePayment = {
    externalOrderId: string;
    idempotencyKey: string;
    itemName: string;
    amount: string;
    seller: Seller;
    returnUrl?: string;
    buyerLabel?: string;
    orderContext?: OrderContext;
};
export type PaymentSession = {
    id: string;
    externalOrderId: string;
    marketplaceId: string;
    sellerId: string;
    merchantAccountId: string;
    amountAtomic: string;
    displayAmount: string;
    asset: "USDC";
    network: "arc-testnet";
    merchantAddress: string;
    platformFeeBps: 0;
    status: string;
    expiresAt: string;
    checkoutUrl: string;
    redirectUrl: string;
};
export type PaymentStatus = {
    id: string;
    amountAtomic: string;
    asset: "USDC";
    network: "arc-testnet";
    merchantAddress: string;
    status: string;
    transactionHash: string | null;
    expiresAt: string;
    platformFeeBps: 0;
};
export type PaymentVerifiedEvent = {
    id: string;
    type: "payment.verified";
    version: string;
    createdAt: string;
    data: {
        paymentIntentId: string;
        externalOrderId: string;
        marketplaceId: string;
        sellerId: string;
        merchantAccountId: string;
        status: "succeeded";
        amount: string;
        amountAtomic: string;
        asset: "USDC";
        network: "arc-testnet";
        buyerAddress: string | null;
        merchantAddress: string;
        transactionHash: string;
        orderContext: OrderContext | null;
    };
};
export declare class DrutoApiError extends Error {
    readonly status: number;
    readonly code?: string | undefined;
    constructor(message: string, status: number, code?: string | undefined);
}
type DrutoOptions = {
    apiKey: string;
    baseUrl?: string;
    fetcher?: typeof fetch;
    timeoutMs?: number;
};
export declare class Druto {
    private readonly key;
    private readonly origin;
    private readonly fetcher;
    private readonly timeoutMs;
    constructor(options: DrutoOptions);
    private call;
    createPayment(input: CreatePayment): Promise<PaymentSession>;
    /** Read-only reconciliation aid; a browser return or hash alone never authorizes fulfillment. */
    getPayment(id: string): Promise<PaymentStatus>;
}
/** Verify the exact raw request body before JSON parsing. Returns null for invalid events. */
export declare function verifyPaymentWebhook(input: {
    secret: string;
    rawBody: string;
    signature: string;
    eventId?: string;
    nowSeconds?: number;
}): Promise<PaymentVerifiedEvent | null>;
export {};
