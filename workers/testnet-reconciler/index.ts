// Read-only, bounded reconciliation of the two isolated Arc Testnet D1 ledgers.
// No HTTP trigger, payment mutation, customer data, or credential is exposed.
type RowValue = string | number | null;
type Database = {
  prepare(sql: string): { bind(...values: RowValue[]): { all<T>(): Promise<{ results: T[] }> } };
};
type Env = { DRUTO_D1: Database; LUVRE_ORDERS_DB: Database };

type DrutoPayment = {
  id: string; externalOrderId: string; amountAtomic: string; merchantAddress: string;
  marketplaceId: string; sellerId: string; merchantAccountId: string;
  asset: string; network: string; platformFeeBps: number;
  platformFeeAmount: string | null; merchantPayoutAmount: string | null;
  splitContractAddress: string | null;
  transactionHash: string | null; recordedHash: string | null; recordedAmount: string | null;
  fromAddress: string | null; recordedTo: string | null; chainId: number | null;
  tokenAddress: string | null; deliveredWebhooks: number;
  settledAt: number | null;
};
type LuvreOrder = {
  id: string; status: string; amountAtomic: string; paymentIntentId: string;
  marketplaceId: string; sellerId: string; merchantAccountId: string;
  receivingAddress: string; asset: string; network: string;
  transactionHash: string | null; processedEvents: number; fulfillmentRecords: number;
  fulfillmentStatus: string | null; paidAt: number | null;
};
type ArcReceipt = {
  status?: string; transactionHash?: string;
  logs?: Array<{ address?: string; topics?: string[]; data?: string }>;
};
type RpcPayload<T> = { result?: T; error?: unknown };

const rpcUrl = 'https://rpc.testnet.arc.io';
const chainId = '0x4cef52'; // 5042002
const usdc = '0x3600000000000000000000000000000000000000';
const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const maxRows = 20; // Bound Arc RPC calls; a larger ledger needs a paginated audit.
const graceMs = 10 * 60_000; // Allow webhook delivery and separate D1 reads to converge.

const drutoSql = `SELECT p.id, p.externalOrderId, p.amountAtomic, p.merchantAddress,
  p.marketplaceId, p.sellerId, p.merchantAccountId, p.asset, p.network,
  p.platformFeeBps, p.platformFeeAmount, p.merchantPayoutAmount, p.splitContractAddress,
  p.transactionHash, t.transactionHash AS recordedHash, t.amountAtomic AS recordedAmount,
  t.fromAddress, t.toAddress AS recordedTo, t.chainId, t.tokenAddress,
  COALESCE(t.finalizedAt, p.updatedAt) AS settledAt,
  (SELECT COUNT(*) FROM webhookDeliveries d JOIN webhookEndpoints e ON e.id=d.endpointId
    WHERE d.paymentIntentId=p.id AND e.url='https://luvre-franc-d1-testnet.robobq.workers.dev/api/webhooks/druto'
      AND d.status='succeeded') AS deliveredWebhooks
  FROM paymentIntents p LEFT JOIN paymentTransactions t ON t.paymentIntentId=p.id
  WHERE p.marketplaceId='luvre-franc' AND p.status='succeeded'
  ORDER BY p.id LIMIT 21`;
const luvreSql = `SELECT o.id, o.status, o.amountAtomic, o.paymentIntentId, o.transactionHash,
  o.marketplaceId, o.sellerId, o.merchantAccountId, o.receivingAddress, o.asset, o.network,
  o.paidAt,
  (SELECT COUNT(*) FROM processedEvents e WHERE e.orderId=o.id) AS processedEvents,
  (SELECT COUNT(*) FROM fulfillmentOutbox f WHERE f.orderId=o.id) AS fulfillmentRecords,
  (SELECT status FROM fulfillmentOutbox f WHERE f.orderId=o.id) AS fulfillmentStatus
  FROM orders o WHERE o.paymentIntentId IS NOT NULL ORDER BY o.id LIMIT 21`;

const same = (a: string | null | undefined, b: string | null | undefined) =>
  typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const topicFor = (address: string) => `0x${address.toLowerCase().slice(2).padStart(64, '0')}`;
const recent = (value: number | null, now: number) =>
  value !== null && Number.isFinite(Number(value)) && Number(value) <= now && now - Number(value) < graceMs;

async function arcRpc<T>(method: string, params: unknown[], fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error('Arc Testnet RPC unavailable');
  const payload = await response.json() as RpcPayload<T>;
  if (payload.error || payload.result == null) throw new Error('Arc Testnet RPC incomplete');
  return payload.result;
}

export type ReconciliationReport = {
  status: 'PASS' | 'FAIL' | 'INCOMPLETE'; checkedAt: string;
  drutoSucceeded: number; luvrePaid: number; pendingOrders: number;
  pendingFulfillment: number; withinGrace: number; exceptionCodes: string[];
};

export async function reconcileTestnet(env: Env, fetcher: typeof fetch = fetch,
  now = Date.now()): Promise<ReconciliationReport> {
  const report: ReconciliationReport = { status: 'INCOMPLETE', checkedAt: new Date(now).toISOString(),
    drutoSucceeded: 0, luvrePaid: 0, pendingOrders: 0, pendingFulfillment: 0,
    withinGrace: 0, exceptionCodes: [] };
  try {
    if (!env.DRUTO_D1 || !env.LUVRE_ORDERS_DB) throw new Error('D1 binding unavailable');
    const [drutoResult, luvreResult] = await Promise.all([
      env.DRUTO_D1.prepare(drutoSql).bind().all<DrutoPayment>(),
      env.LUVRE_ORDERS_DB.prepare(luvreSql).bind().all<LuvreOrder>(),
    ]);
    const druto = drutoResult.results;
    const luvre = luvreResult.results;
    if (!Array.isArray(druto) || !Array.isArray(luvre) ||
      druto.length > maxRows || luvre.length > maxRows) throw new Error('Audit bound exceeded');
    report.drutoSucceeded = druto.length;
    report.luvrePaid = luvre.filter(row => row.status === 'PAID').length;
    report.pendingOrders = luvre.filter(row => row.status === 'PENDING').length;
    report.pendingFulfillment = luvre.filter(row => row.fulfillmentStatus === 'PENDING').length;
    const byIntent = new Map(druto.map(row => [row.id, row]));
    const byOrder = new Map(luvre.map(row => [row.id, row]));
    const fail = (code: string) => { report.exceptionCodes.push(code); };

    for (const payment of druto) {
      if (payment.marketplaceId !== 'luvre-franc' || payment.sellerId !== 'luvre-seller-1' ||
          payment.merchantAccountId !== 'ma_4uguzltzDSiU' || payment.asset !== 'USDC' ||
          payment.network !== 'arc-testnet' || Number(payment.platformFeeBps) !== 0 ||
          payment.platformFeeAmount !== '0' ||
          payment.merchantPayoutAmount !== payment.amountAtomic ||
          payment.splitContractAddress !== null) fail('DRUTO_PAYMENT_POLICY_MISMATCH');
      if (!same(payment.recordedHash, payment.transactionHash) ||
          payment.recordedAmount !== payment.amountAtomic ||
          !same(payment.recordedTo, payment.merchantAddress) ||
          Number(payment.chainId) !== 5042002 || !same(payment.tokenAddress, usdc) ||
          !payment.fromAddress) {
        fail('DRUTO_TRANSACTION_MISMATCH');
        continue;
      }
      const order = byOrder.get(payment.externalOrderId);
      const linked = order?.paymentIntentId === payment.id && order.status === 'PAID' &&
        order.amountAtomic === payment.amountAtomic && same(order.transactionHash, payment.transactionHash) &&
        order.marketplaceId === payment.marketplaceId && order.sellerId === payment.sellerId &&
        order.merchantAccountId === payment.merchantAccountId &&
        same(order.receivingAddress, payment.merchantAddress) &&
        order.asset === payment.asset && order.network === payment.network;
      if (payment.deliveredWebhooks !== 1 || !linked) {
        if (recent(payment.settledAt, now)) report.withinGrace++;
        else fail(payment.deliveredWebhooks !== 1 ? 'WEBHOOK_NOT_DELIVERED_ONCE' : 'MARKETPLACE_ORDER_MISMATCH');
      }
    }
    for (const order of luvre) {
      if (order.status !== 'PAID') continue;
      if (!byIntent.has(order.paymentIntentId)) {
        if (recent(order.paidAt, now)) report.withinGrace++;
        else fail('PAID_ORDER_WITHOUT_DRUTO_SETTLEMENT');
      }
      if (order.processedEvents !== 1 || order.fulfillmentRecords !== 1) {
        fail('MARKETPLACE_EVENT_OR_OUTBOX_MISMATCH');
      }
    }
    if ((await arcRpc<string>('eth_chainId', [], fetcher)).toLowerCase() !== chainId) {
      throw new Error('Unexpected Arc Testnet chain');
    }
    for (const payment of druto) {
      if (!payment.transactionHash || !payment.fromAddress) continue;
      const receipt = await arcRpc<ArcReceipt>('eth_getTransactionReceipt', [payment.transactionHash], fetcher);
      if (receipt.status !== '0x1' || !same(receipt.transactionHash, payment.transactionHash)) {
        fail('ARC_RECEIPT_MISMATCH');
        continue;
      }
      const matching = (receipt.logs ?? []).filter(log => {
        if (!same(log.address, usdc) || !same(log.topics?.[0], transferTopic) ||
          !same(log.topics?.[1], topicFor(payment.fromAddress!)) ||
          !same(log.topics?.[2], topicFor(payment.merchantAddress))) return false;
        try { return BigInt(log.data ?? '0') === BigInt(payment.amountAtomic); }
        catch { return false; }
      });
      if (matching.length !== 1) fail('ARC_USDC_TRANSFER_MISMATCH');
    }
    report.status = report.exceptionCodes.length ? 'FAIL' : 'PASS';
  } catch {
    report.exceptionCodes.push('AUDIT_INCOMPLETE');
  }
  report.exceptionCodes = Array.from(new Set(report.exceptionCodes));
  return report;
}

export default {
  fetch: () => new Response(null, { status: 404 }),
  async scheduled(_controller: unknown, env: Env) {
    const report = await reconcileTestnet(env);
    console.info('druto_testnet_reconciliation', report);
    if (report.status !== 'PASS') throw new Error(`Testnet reconciliation ${report.status}`);
  },
} satisfies ExportedHandler<Env>;
