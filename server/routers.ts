import { COOKIE_NAME } from "@shared/const";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { paymentIntents, paymentTransactions } from "../drizzle/schema";
import { getDb } from "./db";
import { amountToAtomicUsdc, buildUsdcTransferRequest, verifyArcUsdcTransfer } from "./arc";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { assertIdempotentMatch, assertTransactionOwnership } from "./payment-policy";
import { summarizeVerifiedRows } from "./payment-summary";

const paymentInput = z.object({
  externalOrderId: z.string().min(1).max(128),
  idempotencyKey: z.string().min(1).max(128).optional(),
  itemName: z.string().min(1).max(255),
  amount: z.string().regex(/^\d+(\.\d{1,6})?$/, "Amount must be a positive USDC decimal amount"),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  payments: router({
    createIntent: publicProcedure.input(paymentInput).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const idempotencyKey = input.idempotencyKey ?? input.externalOrderId;
      const amountAtomic = amountToAtomicUsdc(input.amount);
      const [existing] = await db.select().from(paymentIntents).where(eq(paymentIntents.idempotencyKey, idempotencyKey)).limit(1);
      if (existing) {
        try { assertIdempotentMatch(existing, { externalOrderId: input.externalOrderId, itemName: input.itemName, amountAtomic }); } catch (error) { throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Idempotency mismatch" }); }
        return { id: existing.id, externalOrderId: existing.externalOrderId, itemName: existing.itemName, displayAmount: (Number(existing.amountAtomic) / 1_000_000).toFixed(6), asset: "USDC" as const, network: "arc-testnet" as const, merchantAddress: existing.merchantAddress, expiresAt: existing.expiresAt, checkoutUrl: `/checkout/${existing.id}` };
      }
      const id = `pi_${nanoid(12)}`;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await db.insert(paymentIntents).values({
        id,
        externalOrderId: input.externalOrderId,
        idempotencyKey,
        itemName: input.itemName,
        amountAtomic,
        asset: "USDC",
        network: "arc-testnet",
        merchantAddress: process.env.ARC_MERCHANT_WALLET_ADDRESS!,
        status: "requires_payment",
        expiresAt,
      });
      return {
        id,
        externalOrderId: input.externalOrderId,
        itemName: input.itemName,
        displayAmount: input.amount,
        asset: "USDC" as const,
        network: "arc-testnet" as const,
        merchantAddress: process.env.ARC_MERCHANT_WALLET_ADDRESS!,
        expiresAt,
        checkoutUrl: `/checkout/${id}`,
      };
    }),

    listIntents: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      return db.select().from(paymentIntents).where(eq(paymentIntents.merchantAddress, process.env.ARC_MERCHANT_WALLET_ADDRESS!));
    }),

    verifiedPayments: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      return db.select({ id: paymentTransactions.transactionHash, paymentIntentId: paymentTransactions.paymentIntentId, externalOrderId: paymentIntents.externalOrderId, itemName: paymentIntents.itemName, amountAtomic: paymentTransactions.amountAtomic, transactionHash: paymentTransactions.transactionHash, fromAddress: paymentTransactions.fromAddress, toAddress: paymentTransactions.toAddress, finalizedAt: paymentTransactions.finalizedAt, createdAt: paymentIntents.createdAt }).from(paymentTransactions).innerJoin(paymentIntents, eq(paymentTransactions.paymentIntentId, paymentIntents.id)).where(eq(paymentIntents.merchantAddress, process.env.ARC_MERCHANT_WALLET_ADDRESS!));
    }),

    summary: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const intents = await db.select().from(paymentIntents).where(eq(paymentIntents.merchantAddress, process.env.ARC_MERCHANT_WALLET_ADDRESS!));
      const verifiedRows = await db.select({ amountAtomic: paymentTransactions.amountAtomic, paymentIntentId: paymentTransactions.paymentIntentId }).from(paymentTransactions).innerJoin(paymentIntents, eq(paymentTransactions.paymentIntentId, paymentIntents.id)).where(eq(paymentIntents.merchantAddress, process.env.ARC_MERCHANT_WALLET_ADDRESS!));
      const pending = intents.filter(intent => intent.status === "requires_payment" || intent.status === "submitted" || intent.status === "verifying");
      const verifiedSummary = summarizeVerifiedRows(verifiedRows);
      const pendingAtomic = pending.reduce((sum, intent) => sum + BigInt(intent.amountAtomic), BigInt(0));
      return { availableUsdc: (Number(verifiedSummary.totalAtomic) / 1_000_000).toFixed(2), grossUsdc: (Number(verifiedSummary.totalAtomic) / 1_000_000).toFixed(2), pendingUsdc: (Number(pendingAtomic) / 1_000_000).toFixed(2), successfulCount: verifiedSummary.count, pendingCount: pending.length, totalCount: intents.length };
    }),

    getIntent: publicProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, input.id)).limit(1);
      if (!intent) throw new TRPCError({ code: "NOT_FOUND", message: "Payment Intent not found" });
      return intent;
    }),

    prepareTransfer: publicProcedure.input(z.object({ id: z.string().min(1), buyerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, input.id)).limit(1);
      if (!intent) throw new TRPCError({ code: "NOT_FOUND", message: "Payment Intent not found" });
      if (intent.expiresAt.getTime() <= Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "Payment Intent has expired" });
      await db.update(paymentIntents).set({ buyerAddress: input.buyerAddress, status: "submitted" }).where(eq(paymentIntents.id, input.id));
      return buildUsdcTransferRequest(intent.amountAtomic);
    }),

    verifyTransfer: publicProcedure.input(z.object({ id: z.string().min(1), idempotencyKey: z.string().min(1).max(128).optional(), transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not available" });
      const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, input.id)).limit(1);
      if (!intent) throw new TRPCError({ code: "NOT_FOUND", message: "Payment Intent not found" });
      if (input.idempotencyKey && input.idempotencyKey !== intent.idempotencyKey) throw new TRPCError({ code: "CONFLICT", message: "Verification idempotency key does not match the Payment Intent" });
      if (intent.status === "succeeded") return intent;
      const [existingTransaction] = await db.select().from(paymentTransactions).where(eq(paymentTransactions.transactionHash, input.transactionHash)).limit(1);
      if (existingTransaction) {
        try { assertTransactionOwnership(existingTransaction.paymentIntentId, intent.id); } catch (error) { throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Transaction hash conflict" }); }
        const [alreadyUpdated] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, intent.id)).limit(1);
        return alreadyUpdated;
      }
      try {
        const verified = await verifyArcUsdcTransfer(input.transactionHash as `0x${string}`, intent.amountAtomic);
        await db.insert(paymentTransactions).values({
          paymentIntentId: intent.id,
          transactionHash: verified.transactionHash,
          fromAddress: verified.fromAddress,
          toAddress: verified.toAddress,
          tokenAddress: buildUsdcTransferRequest(intent.amountAtomic).tokenAddress,
          amountAtomic: verified.amountAtomic,
          chainId: 5042002,
          finalizedAt: new Date(),
        });
        await db.update(paymentIntents).set({ status: "succeeded", transactionHash: verified.transactionHash }).where(and(eq(paymentIntents.id, intent.id), eq(paymentIntents.status, "submitted")));
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to verify Arc transaction" });
      }
      const [updated] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, intent.id)).limit(1);
      return updated;
    }),
  }),
});

export type AppRouter = typeof appRouter;
