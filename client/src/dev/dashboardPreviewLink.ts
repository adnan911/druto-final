import { TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "../../../server/routers";
import { dashboardAmount } from "@/lib/dashboardView";

// DEV-only fixtures. No credentials, HTTP fallback, backend writes or wallet calls.
const user = { name: "Demo workspace", openId: "development-preview", email: "preview@example.invalid" };
const accounts = {
  accounts: [
    { id: "demo_ma_fieldwork", marketplaceId: "demo-marketplace", externalSellerId: "fieldwork", displayName: "Fieldwork Goods", receivingAddress: "0x0000000000000000000000000000000000000001", status: "active", walletVerifiedAt: new Date() },
    { id: "demo_ma_studio", marketplaceId: "demo-marketplace", externalSellerId: "studio", displayName: "Studio Linen", receivingAddress: "0x0000000000000000000000000000000000000002", status: "active", walletVerifiedAt: new Date() },
    { id: "demo_ma_northline", marketplaceId: "demo-marketplace", externalSellerId: "northline", displayName: "Northline", receivingAddress: "0x0000000000000000000000000000000000000003", status: "pending", walletVerifiedAt: null },
  ],
  webhooks: [{ id: "demo_wh_store", merchantAccountId: "demo_ma_fieldwork", url: "https://store.example.invalid/webhooks/druto", active: 1 }],
};
const rows = [
  { id: "demo_pi_studio", order: "D-2408", seller: 0, item: "Studio essentials", amount: "125000000", status: "succeeded" },
  { id: "demo_pi_waiting", order: "D-2407", seller: 1, item: "Linen set", amount: "85000000", status: "verifying" },
  { id: "demo_pi_northline", order: "D-2406", seller: 2, item: "Everyday collection", amount: "240000000", status: "succeeded" },
  { id: "demo_pi_catalog", order: "D-2405", seller: 1, item: "Digital catalog", amount: "68000000", status: "succeeded" },
  { id: "demo_pi_ready", order: "D-2404", seller: 0, item: "Weekend collection", amount: "180000000", status: "requires_payment" },
  { id: "demo_pi_workshop", order: "D-2403", seller: 2, item: "Workshop bundle", amount: "450000000", status: "succeeded" },
  { id: "demo_pi_print", order: "D-2402", seller: 0, item: "Studio print", amount: "32000000", status: "succeeded" },
  { id: "demo_pi_expired", order: "D-2401", seller: 1, item: "Archive edition", amount: "55000000", status: "expired" },
];
const intents = rows.map((row, index) => ({
  id: row.id, externalOrderId: row.order, itemName: row.item, merchantAccountId: accounts.accounts[row.seller].id,
  merchantAddress: accounts.accounts[row.seller].receivingAddress, sellerId: accounts.accounts[row.seller].externalSellerId,
  buyerLabel: ["amina@example.invalid", "rafi@example.invalid", "nora@example.invalid"][row.seller],
  amountAtomic: row.amount, asset: "USDC", network: "arc-testnet", status: row.status,
  createdAt: new Date(Date.now() - index * 10_800_000),
  expiresAt: new Date(Date.now() + (row.status === "expired" ? -1 : 1) * 86_400_000),
  transactionHash: row.status === "succeeded" ? "DEMO — no onchain transaction" : null,
}));
const payments = intents.filter(row => row.status === "succeeded").map((row, index) => ({
  id: index + 1, paymentIntentId: row.id, externalOrderId: row.externalOrderId, itemName: row.itemName, buyerLabel: row.buyerLabel,
  amountAtomic: row.amountAtomic, createdAt: row.createdAt, finalizedAt: row.createdAt,
  transactionHash: "DEMO — no onchain transaction", fromAddress: "0x0000000000000000000000000000000000000004", toAddress: row.merchantAddress,
}));
const deliveries = payments.map((payment, index) => ({
  id: "demo_wd_" + index, endpointId: "demo_wh_store", eventId: "demo_evt_" + index,
  eventType: "payment.verified", paymentIntentId: payment.paymentIntentId,
  externalOrderId: payment.externalOrderId, sellerName: "Fieldwork Goods",
  status: index === 0 ? "pending" : index === 1 ? "failed" : "succeeded",
  attempts: index === 0 ? 0 : 1, nextAttemptAt: null,
  deliveredAt: index > 1 ? payment.createdAt : null, createdAt: payment.createdAt,
  updatedAt: payment.createdAt, endpointActive: true, retryAvailable: index < 2,
  payload: { id: "demo_evt_" + index, type: "payment.verified",
    data: { paymentIntentId: payment.paymentIntentId, externalOrderId: payment.externalOrderId,
      amountAtomic: payment.amountAtomic, asset: "USDC", network: "arc-testnet" } },
}));
function queryFixture(path: string, input: unknown) {
  switch (path) {
    case "auth.me": return user;
    case "payments.listIntents": return intents;
    case "payments.summary": {
      const pending = intents.filter(row => ["requires_payment", "verifying"].includes(row.status));
      return { grossUsdc: dashboardAmount(payments.reduce((total, row) => total + BigInt(row.amountAtomic), BigInt(0))), successfulCount: payments.length,
        pendingUsdc: dashboardAmount(pending.reduce((total, row) => total + BigInt(row.amountAtomic), BigInt(0))), pendingCount: pending.length, totalCount: intents.length };
    }
    case "payments.verifiedPayments": return payments;
    case "payments.verifiedPaymentsPage": {
      const filter = input as { limit?: number; search?: string; fromTimestamp?: number } | undefined;
      const term = filter?.search?.toLowerCase() ?? "";
      const items = payments.filter(row => (!filter?.fromTimestamp || row.finalizedAt.getTime() >= filter.fromTimestamp)
        && [row.paymentIntentId, row.itemName, row.buyerLabel, row.transactionHash].some(value => value.toLowerCase().includes(term)));
      return { items: items.slice(0, filter?.limit ?? 25), nextCursor: null };
    }
    case "payments.getPrivateIntent": return intents.find(row => row.id === (input as { id?: string } | undefined)?.id) ?? null;
    case "merchantAccounts.listMine": return accounts;
    case "merchantAccounts.webhookConsole": {
      const filter = input as { endpointId?: string; status?: string; search?: string; limit?: number; cursor?: { createdAt: number; id: string } };
      const scoped = deliveries.filter(row => !filter.endpointId || row.endpointId === filter.endpointId);
      const items = scoped.filter(row => (!filter.status || row.status === filter.status)
        && (!filter.search || [row.eventId,row.paymentIntentId,row.externalOrderId].some(value => value.toLowerCase().includes(filter.search!.toLowerCase())))
        && (!filter.cursor || row.createdAt.getTime() < filter.cursor.createdAt || (row.createdAt.getTime() === filter.cursor.createdAt && row.id < filter.cursor.id)));
      const shown = items.slice(0,filter.limit ?? 25);
      const last = shown[shown.length - 1];
      return { items: shown.map(row => ({...row,payload:null})), counts: {
        delivered: scoped.filter(row => row.status === "succeeded").length,
        pending: scoped.filter(row => row.status === "pending").length,
        failed: scoped.filter(row => row.status === "failed").length,
      }, nextCursor: items.length > shown.length && last ? { createdAt: last.createdAt.getTime(),id:last.id } : null };
    }
    case "merchantAccounts.webhookDelivery": {
      const row = deliveries.find(row => row.id === (input as { deliveryId: string }).deliveryId);
      if (!row) throw new Error("Sample delivery not found");
      return row;
    }
    case "apiKeys.list": return [
      { id:"demo_key_active",name:"Storefront test backend",prefix:"demo_",lastFour:"0001",
        merchantAccountId:"demo_ma_fieldwork",marketplaceId:"demo-marketplace",sellerId:"fieldwork",
        sellerDisplayName:"Fieldwork Goods",createdAt:new Date(Date.now()-86400000),lastUsedAt:new Date(),revokedAt:null },
      { id:"demo_key_revoked",name:"Retired test adapter",prefix:"demo_",lastFour:"0002",
        merchantAccountId:"demo_ma_studio",marketplaceId:"demo-marketplace",sellerId:"studio",
        sellerDisplayName:"Studio Linen",createdAt:new Date(Date.now()-172800000),lastUsedAt:null,revokedAt:new Date() },
    ];
    default: throw new Error("This view has no sample fixture. Exit preview and sign in to use it.");
  }
}
export function dashboardPreviewLink(): TRPCLink<AppRouter> {
  return () => ({ op }) => observable(observer => {
    try {
      if (!import.meta.env.DEV) throw new Error("Dashboard preview is available only during development.");
      if (op.type !== "query") throw new Error("Preview is read-only. Exit preview and sign in to make changes.");
      observer.next({ result: { data: structuredClone(queryFixture(op.path, op.input)) } });
      observer.complete();
    } catch (error) {
      observer.error(TRPCClientError.from(error instanceof Error ? error : new Error("Preview unavailable")));
    }
  });
}