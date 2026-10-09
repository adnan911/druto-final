import type { PaymentIntent } from '../drizzle/schema';
import { formatAtomicUsdc } from '../shared/usdc-amount';

// Explicit allowlist: adding a DB column must never silently publish it.
// itemName and returnUrl are merchant-supplied public checkout fields; no PII there.
export function publicPaymentIntent(intent: PaymentIntent, verificationOrigin: string) {
  return { id: intent.id, itemName: intent.itemName, amountAtomic: intent.amountAtomic,
    asset: intent.asset, network: intent.network, merchantAddress: intent.merchantAddress,
    status: intent.status, transactionHash: intent.transactionHash, expiresAt: intent.expiresAt,
    platformFeeBps: intent.platformFeeBps, platformFeeAmount: intent.platformFeeAmount,
    merchantPayoutAmount: intent.merchantPayoutAmount, splitContractAddress: intent.splitContractAddress,
    returnUrl: intent.returnUrl, verificationOrigin };
}
export function privatePaymentIntent(intent: PaymentIntent, verificationOrigin: string) {
  return { ...publicPaymentIntent(intent, verificationOrigin), externalOrderId: intent.externalOrderId,
    marketplaceId: intent.marketplaceId, sellerId: intent.sellerId, merchantAccountId: intent.merchantAccountId,
    buyerLabel: intent.buyerLabel, orderContext: intent.orderContext, buyerAddress: intent.buyerAddress,
    createdAt: intent.createdAt, updatedAt: intent.updatedAt };
}
export function createdPaymentSession(intent: PaymentIntent, baseUrl: string) {
  return { ...publicPaymentIntent(intent, new URL(baseUrl).origin), externalOrderId: intent.externalOrderId,
    marketplaceId: intent.marketplaceId, sellerId: intent.sellerId, merchantAccountId: intent.merchantAccountId,
    displayAmount: formatAtomicUsdc(intent.amountAtomic), checkoutUrl: `/checkout/${intent.id}`,
    redirectUrl: `${baseUrl.replace(/\/$/, '')}/checkout/${intent.id}` };
}
