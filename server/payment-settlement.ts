import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { paymentIntents, paymentTransactions } from '../drizzle/schema';
import { getDb } from './db';
import { ARC_CHAIN_ID, ARC_USDC_ADDRESS, verifyArcUsdcTransfer } from './arc';
import { enqueuePaymentVerified } from './webhook-delivery';

export const paymentVerificationOrigin = () => new URL(process.env.DRUTO_API_URL || 'https://druto-final.vercel.app').origin;
function success(intentId: string, tx: typeof paymentTransactions.$inferSelect) {
  return { paymentIntentId: intentId, transactionHash: tx.transactionHash, fromAddress: tx.fromAddress, toAddress: tx.toAddress, amountAtomic: tx.amountAtomic, status: 'succeeded' as const };
}
export async function settlePayment(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, input: { paymentIntentId: string; transactionHash: string; payerSignature?: string }) {
  const hash = input.transactionHash.toLowerCase() as `0x${string}`;
  const [initial] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, input.paymentIntentId)).limit(1);
  if (!initial) throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment Intent not found' });
  if (initial.status === 'succeeded') {
    if (initial.transactionHash?.toLowerCase() !== hash) throw new TRPCError({ code: 'CONFLICT', message: 'Payment Intent already succeeded with another transaction' });
    const [stored] = await db.select().from(paymentTransactions).where(eq(paymentTransactions.transactionHash, hash)).limit(1);
    if (!stored || stored.paymentIntentId !== initial.id) throw new TRPCError({ code: 'CONFLICT', message: 'Payment ledger requires review' });
    return success(initial.id, stored);
  }
  if (!['requires_payment', 'submitted', 'verifying', 'expired'].includes(initial.status)) throw new TRPCError({ code: 'CONFLICT', message: 'Payment state does not allow verification' });
  // RPC failure or invalid proof never changes durable payment state.
  let verified;
  try {
    verified = await verifyArcUsdcTransfer(hash, initial.amountAtomic, initial.merchantAddress, initial.id, {
      createdAt: initial.createdAt, expiresAt: initial.expiresAt,
      payerSignature: input.payerSignature as `0x${string}` | undefined, origin: paymentVerificationOrigin(),
      platformFeeBps: initial.platformFeeBps ?? 200, splitterAddress: initial.splitContractAddress,
    });
  } catch (error) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Arc verification failed' });
  }
  let committed;
  try {
    committed = await db.transaction(async tx => {
      const [intent] = await tx.select().from(paymentIntents).where(eq(paymentIntents.id, initial.id)).limit(1).for('update');
      if (!intent || intent.amountAtomic !== initial.amountAtomic || intent.merchantAddress !== initial.merchantAddress || intent.platformFeeBps !== initial.platformFeeBps || intent.splitContractAddress !== initial.splitContractAddress || intent.createdAt.getTime() !== initial.createdAt.getTime() || intent.expiresAt.getTime() !== initial.expiresAt.getTime()) throw new TRPCError({ code: 'CONFLICT', message: 'Payment details changed during verification' });
      const [existing] = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.transactionHash, hash)).limit(1).for('update');
      if (existing && existing.paymentIntentId !== intent.id) throw new TRPCError({ code: 'CONFLICT', message: 'Transaction already belongs to another Payment Intent' });
      if (intent.status === 'succeeded') {
        if (!existing || intent.transactionHash?.toLowerCase() !== hash) throw new TRPCError({ code: 'CONFLICT', message: 'Payment Intent already succeeded with another transaction' });
        return { intent, transaction: existing, inserted: false };
      }
      if (!['requires_payment', 'submitted', 'verifying', 'expired'].includes(intent.status)) throw new TRPCError({ code: 'CONFLICT', message: 'Payment state changed during verification' });
      const [attached] = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.paymentIntentId, intent.id)).limit(1).for('update');
      if (attached && attached.transactionHash.toLowerCase() !== hash) throw new TRPCError({ code: 'CONFLICT', message: 'Payment Intent already has a recorded transaction' });
      const recorded = { paymentIntentId: intent.id, transactionHash: hash, fromAddress: verified.fromAddress, toAddress: verified.toAddress, treasuryAddress: verified.treasuryAddress, tokenAddress: ARC_USDC_ADDRESS, amountAtomic: verified.amountAtomic, platformFeeAmount: verified.platformFeeAmount ?? '0', merchantPayoutAmount: verified.merchantPayoutAmount ?? verified.amountAtomic, chainId: ARC_CHAIN_ID, finalizedAt: new Date() };
      if (!existing) await tx.insert(paymentTransactions).values(recorded);
      await tx.update(paymentIntents).set({ status: 'succeeded', buyerAddress: recorded.fromAddress, transactionHash: hash, platformFeeAmount: recorded.platformFeeAmount, merchantPayoutAmount: recorded.merchantPayoutAmount }).where(eq(paymentIntents.id, intent.id));
      const [updated] = await tx.select().from(paymentIntents).where(eq(paymentIntents.id, intent.id)).limit(1);
      const [transaction] = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.transactionHash, hash)).limit(1);
      await enqueuePaymentVerified(tx, updated, transaction);
      return { intent: updated, transaction, inserted: true };
    });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY' || error?.cause?.code === 'ER_DUP_ENTRY') throw new TRPCError({ code: 'CONFLICT', message: 'Transaction was concurrently claimed; refresh payment status' });
    throw error;
  }
  return success(initial.id, committed.transaction);
}
