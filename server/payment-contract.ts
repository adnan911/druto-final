import { z } from "zod";
import { parsePaymentAmount } from "../shared/usdc-amount";

export const sellerRoutingInput = z.object({
  marketplaceId: z.string().min(1).max(128),
  sellerId: z.string().min(1).max(128),
  merchantAccountId: z.string().min(1).max(32).optional(),
});

export const paymentInput = z.object({
  externalOrderId: z.string().min(1).max(128),
  idempotencyKey: z.string().min(1).max(128).optional(),
  itemName: z.string().min(1).max(255),
  buyerLabel: z.string().max(255).optional(),
  returnUrl: z.string().max(2048).optional(),
  amount: z.string().max(14).superRefine((value, ctx) => {
    try { parsePaymentAmount(value); }
    catch (error) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : "Invalid USDC amount" }); }
  }),
  orderContext: z.object({ items: z.array(z.object({ productId: z.string(), name: z.string(), seller: z.string(), unitPrice: z.number().nonnegative(), quantity: z.number().int().positive() })), delivery: z.string(), shippingAddress: z.object({ name: z.string(), line1: z.string(), city: z.string(), postalCode: z.string(), country: z.string() }), buyerEmail: z.string().email() }).optional(),
  seller: sellerRoutingInput.optional(),
});
