// Read-only, bounded reconciliation of Druto's Arc Testnet payment ledger.
// Marketplace order/fulfillment checks belong to each integration, not Druto.
// No HTTP trigger, payment mutation, customer data, or credential is exposed.
type RowValue = string | number | null;
type Database = {
  prepare(sql: string): { bind(...values: RowValue[]): { all<T>(): Promise<{ results: T[] }> } };
};
type Env = { DRUTO_D1: Database };

type DrutoPayment = {
  id: string; amountAtomic: string; merchantAddress: string;
  marketplaceId: string; sellerId: string; merchantAccountId: string;
  accountMarketplaceId: string | null; accountSellerId: string | null;
  asset: string; network: string; platformFeeBps: number;
  platformFeeAmount: string | null; merchantPayoutAmount: string | null;
  splitContractAddress: string | null;
  transactionHash: string | null; recordedHash: string | null; recordedAmount: string | null;
  fromAddress: string | null; recordedTo: string | null; chainId: number | null;
  tokenAddress: string | null; undeliveredWebhooks: number;
  settledAt: number | null;
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
const graceMs = 10 * 60_000; // Allow the independent webhook outbox time to drain.

const drutoSql = `SELECT p.id, p.amountAtomic, p.merchantAddress,
  p.marketplaceId, p.sellerId, p.merchantAccountId, p.asset, p.network,
  m.marketplaceId AS accountMarketplaceId, m.externalSellerId AS accountSellerId,
  p.platformFeeBps, p.platformFeeAmount, p.merchantPayoutAmount, p.splitContractAddress,
  p.transactionHash, t.transactionHash AS recordedHash, t.amountAtomic AS recordedAmount,
  t.fromAddress, t.toAddress AS recordedTo, t.chainId, t.tokenAddress,
  COALESCE(t.finalizedAt, p.updatedAt) AS settledAt,
  (SELECT COUNT(*) FROM webhookDeliveries d WHERE d.paymentIntentId=p.id
    AND d.status <> 'succeeded') AS undeliveredWebhooks
  FROM paymentIntents p LEFT JOIN paymentTransactions t ON t.paymentIntentId=p.id
  LEFT JOIN merchantAccounts m ON m.id=p.merchantAccountId
  WHERE p.status='succeeded'
  ORDER BY p.id LIMIT 21`;

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
  drutoSucceeded: number; undeliveredWebhooks: number;
  withinGrace: number; exceptionCodes: string[];
};

export async function reconcileTestnet(env: Env, fetcher: typeof fetch = fetch,
  now = Date.now()): Promise<ReconciliationReport> {
  const report: ReconciliationReport = { status: 'INCOMPLETE', checkedAt: new Date(now).toISOString(),
    drutoSucceeded: 0, undeliveredWebhooks: 0, withinGrace: 0, exceptionCodes: [] };
  try {
    if (!env.DRUTO_D1) throw new Error('D1 binding unavailable');
    const drutoResult = await env.DRUTO_D1.prepare(drutoSql).bind().all<DrutoPayment>();
    const druto = drutoResult.results;
    if (!Array.isArray(druto) || druto.length > maxRows) throw new Error('Audit bound exceeded');
    report.drutoSucceeded = druto.length;
    const fail = (code: string) => { report.exceptionCodes.push(code); };

    for (const payment of druto) {
      if (!payment.marketplaceId || !payment.sellerId || !payment.merchantAccountId ||
          payment.accountMarketplaceId !== payment.marketplaceId ||
          payment.accountSellerId !== payment.sellerId ||
          payment.asset !== 'USDC' ||
          payment.network !== 'arc-testnet' || Number(payment.platformFeeBps) !== 0 ||
          payment.platformFeeAmount !== '0' ||
          payment.merchantPayoutAmount !== payment.amountAtomic ||
          payment.splitContractAddress !== null) fail('DRUTO_PAYMENT_POLICY_MISMATCH');
      if (!/^[1-9][0-9]*$/.test(payment.amountAtomic)) fail('DRUTO_PAYMENT_POLICY_MISMATCH');
      if (!same(payment.recordedHash, payment.transactionHash) ||
          payment.recordedAmount !== payment.amountAtomic ||
          !same(payment.recordedTo, payment.merchantAddress) ||
          Number(payment.chainId) !== 5042002 || !same(payment.tokenAddress, usdc) ||
          !/^0x[a-fA-F0-9]{40}$/.test(payment.fromAddress ?? '') ||
          !/^0x[a-fA-F0-9]{40}$/.test(payment.merchantAddress)) {
        fail('DRUTO_TRANSACTION_MISMATCH');
        continue;
      }
      const undelivered = Number(payment.undeliveredWebhooks);
      if (!Number.isSafeInteger(undelivered) || undelivered < 0) {
        fail('DRUTO_WEBHOOK_LEDGER_MISMATCH');
      } else {
        report.undeliveredWebhooks += undelivered;
      }
      if (undelivered > 0) {
        if (recent(payment.settledAt, now)) report.withinGrace++;
        else fail('WEBHOOK_UNDELIVERED');
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
