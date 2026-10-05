import { TRPCError } from '@trpc/server';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { getAddress, verifyMessage } from 'viem';
import { z } from 'zod';
import { merchantAccounts, ownershipChallenges } from '../drizzle/schema';
import { getDb } from './db';
import { protectedProcedure, router } from './_core/trpc';

const accountInput = z.object({ merchantAccountId: z.string().min(1).max(32) });
function assertOwner(account: typeof merchantAccounts.$inferSelect | undefined, userId: number) {
  if (!account || account.ownerUserId !== userId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Seller account ownership required' });
  if (account.status === 'disabled') throw new TRPCError({ code: 'FORBIDDEN', message: 'Disabled seller requires operator review' });
  return account;
}
export const sellerOwnershipRouter = router({
  createChallenge: protectedProcedure.input(accountInput).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'PRECONDITION_FAILED' });
    const [row] = await db.select().from(merchantAccounts).where(eq(merchantAccounts.id, input.merchantAccountId)).limit(1);
    const account = assertOwner(row, ctx.user.id);
    const id = `own_${nanoid(12)}`;
    const nonce = nanoid(32);
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    const origin = new URL(process.env.DRUTO_API_URL || 'https://druto-final.vercel.app').origin;
    const message = `Druto seller receiving-wallet verification\nOrigin: ${origin}\nChain ID: 5042002\nAccount: ${account.id}\nOwner: ${ctx.user.id}\nMarketplace: ${account.marketplaceId}\nSeller: ${account.externalSellerId}\nWallet: ${getAddress(account.receivingAddress)}\nNonce: ${nonce}\nExpires: ${expiresAt.toISOString()}\nThis signature verifies the receiving wallet; it does not transfer funds.`;
    try {
      await db.insert(ownershipChallenges).values({ id, merchantAccountId: account.id, marketplaceId: account.marketplaceId, sellerId: account.externalSellerId, walletAddress: getAddress(account.receivingAddress), message, nonceHash: createHash('sha256').update(nonce).digest('hex'), expiresAt });
    } catch (error: any) {
      if (error?.code === 'ER_DUP_ENTRY' || error?.cause?.code === 'ER_DUP_ENTRY') throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Wait one second before requesting another seller challenge' });
      throw error;
    }
    return { challengeId: id, message, expiresAt, walletAddress: getAddress(account.receivingAddress) };
  }),
  verify: protectedProcedure.input(accountInput.extend({ challengeId: z.string().min(1).max(32), signature: z.string().regex(/^0x[a-fA-F0-9]+$/).max(2048) })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'PRECONDITION_FAILED' });
    return db.transaction(async tx => {
      const [row] = await tx.select().from(merchantAccounts).where(eq(merchantAccounts.id, input.merchantAccountId)).limit(1).for('update');
      const account = assertOwner(row, ctx.user.id);
      const [challenge] = await tx.select().from(ownershipChallenges).where(eq(ownershipChallenges.id, input.challengeId)).limit(1).for('update');
      if (!challenge || challenge.merchantAccountId !== account.id || challenge.marketplaceId !== account.marketplaceId || challenge.sellerId !== account.externalSellerId || challenge.walletAddress.toLowerCase() !== account.receivingAddress.toLowerCase() || !challenge.message.includes(`\nOwner: ${ctx.user.id}\n`)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Seller challenge mismatch' });
      if (challenge.usedAt || challenge.expiresAt.getTime() <= Date.now()) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Seller challenge expired or already used' });
      const valid = await verifyMessage({ address: getAddress(account.receivingAddress), message: challenge.message, signature: input.signature as `0x${string}` }).catch(() => false);
      if (!valid) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid receiving-wallet signature' });
      const now = new Date();
      const result = await tx.update(ownershipChallenges).set({ usedAt: now }).where(and(eq(ownershipChallenges.id, challenge.id), isNull(ownershipChallenges.usedAt), gt(ownershipChallenges.expiresAt, now)));
      if (Number((result as any)[0]?.affectedRows) !== 1) throw new TRPCError({ code: 'CONFLICT', message: 'Seller challenge no longer available' });
      await tx.update(merchantAccounts).set({ walletVerifiedAt: now, status: 'active', updatedAt: now }).where(eq(merchantAccounts.id, account.id));
      return { merchantAccountId: account.id, status: 'active' as const, walletVerifiedAt: now };
    });
  }),
});
