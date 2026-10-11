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
  webhookCoverageGaps: number; exhaustedWebhooks: number;
  settledAt: number | null;
};
type ArcReceipt = {
  status?: string; transactionHash?: string;
  logs?: Array<{ address?: string; topics?: string[]; data?: string }>;
};
type RpcPayload<T> = { id?: number; result?: T; error?: unknown };

class AuditDependencyError extends Error {
  constructor(readonly code: string) { super(code); }
}

const primaryRpcUrl = 'https://rpc.testnet.arc.io';
// Arc's documented public alternative is used only if the primary is unavailable.
const backupRpcUrl = 'https://rpc.drpc.testnet.arc.io';
const chainId = '0x4cef52'; // 5042002
const usdc = '0x3600000000000000000000000000000000000000';
const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const pageSize = 10; // Both public Arc Testnet endpoints accepted this batch size.
const maxPages = 10; // Bound D1 reads, RPC load and Free-tier subrequests.
const maxRows = pageSize * maxPages;
const graceMs = 10 * 60_000; // Allow the independent webhook outbox time to drain.

const countSql = `SELECT COUNT(*) AS total,
  (SELECT COUNT(*) FROM (SELECT t.id FROM paymentTransactions t
    LEFT JOIN paymentIntents i ON i.id=t.paymentIntentId
    WHERE i.id IS NULL OR i.status<>'succeeded' LIMIT 101)) AS unsettledTransactions
  FROM paymentIntents p
  WHERE p.status='succeeded' AND p.updatedAt<=?`;
const drutoSql = `SELECT p.id, p.amountAtomic, p.merchantAddress,
  p.marketplaceId, p.sellerId, p.merchantAccountId, p.asset, p.network,
  m.marketplaceId AS accountMarketplaceId, m.externalSellerId AS accountSellerId,
  p.platformFeeBps, p.platformFeeAmount, p.merchantPayoutAmount, p.splitContractAddress,
  p.transactionHash, t.transactionHash AS recordedHash, t.amountAtomic AS recordedAmount,
  t.fromAddress, t.toAddress AS recordedTo, t.chainId, t.tokenAddress,
  COALESCE(t.finalizedAt, p.updatedAt) AS settledAt,
  (SELECT COUNT(*) FROM webhookDeliveries d WHERE d.paymentIntentId=p.id
    AND d.status <> 'succeeded') AS undeliveredWebhooks,
  (SELECT COUNT(*) FROM webhookDeliveries d WHERE d.paymentIntentId=p.id
    AND d.attempts>=10 AND (d.status='failed' OR
      (d.status='pending' AND (d.nextAttemptAt IS NULL OR d.nextAttemptAt<=?)))) AS exhaustedWebhooks,
  (SELECT COUNT(*) FROM webhookEndpoints e WHERE e.merchantAccountId=p.merchantAccountId
    AND e.active=1 AND e.createdAt<=t.createdAt
    AND NOT EXISTS (SELECT 1 FROM webhookDeliveries d WHERE d.endpointId=e.id
      AND d.paymentIntentId=p.id AND d.eventType='payment.verified')) AS webhookCoverageGaps
  FROM paymentIntents p LEFT JOIN paymentTransactions t ON t.paymentIntentId=p.id
  LEFT JOIN merchantAccounts m ON m.id=p.merchantAccountId
  WHERE p.status='succeeded' AND p.updatedAt<=? AND p.id>?
  ORDER BY p.id LIMIT ?`;

const same = (a: string | null | undefined, b: string | null | undefined) =>
  typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const topicFor = (address: string) => `0x${address.toLowerCase().slice(2).padStart(64, '0')}`;
const recent = (value: number | null, now: number) =>
  value !== null && Number.isFinite(Number(value)) && Number(value) <= now && now - Number(value) < graceMs;

async function arcPost(body: unknown, fetcher: typeof fetch, url: string,
  codePrefix: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(8_000) });
  } catch { throw new AuditDependencyError(`${codePrefix}_FETCH_FAILED`); }
  if (!response.ok) throw new AuditDependencyError(`${codePrefix}_HTTP_${response.status}`);
  try { return await response.json(); }
  catch { throw new AuditDependencyError(`${codePrefix}_BAD_JSON`); }
}

async function arcRpc<T>(method: string, params: unknown[], fetcher: typeof fetch,
  url: string, codePrefix = 'ARC_RPC'): Promise<T> {
  const payload = await arcPost({ jsonrpc: '2.0', id: 1, method, params },
    fetcher, url, codePrefix) as RpcPayload<T>;
  if (!payload || Array.isArray(payload)) throw new AuditDependencyError(`${codePrefix}_BAD_RESPONSE`);
  if (payload.error || payload.result == null) throw new AuditDependencyError(`${codePrefix}_NO_RESULT`);
  return payload.result;
}

async function arcReceipts(hashes: string[], fetcher: typeof fetch, url: string,
  codePrefix: string): Promise<ArcReceipt[]> {
  const request = hashes.map((hash, index) => ({ jsonrpc: '2.0', id: index + 1,
    method: 'eth_getTransactionReceipt', params: [hash] }));
  const payload = await arcPost(request, fetcher, url, codePrefix);
  if (!Array.isArray(payload) || payload.length !== hashes.length) {
    throw new AuditDependencyError(`${codePrefix}_BAD_BATCH`);
  }
  const receipts: ArcReceipt[] = Array(hashes.length);
  const seen = new Set<number>();
  for (const item of payload as RpcPayload<ArcReceipt>[]) {
    if (!item || !Number.isInteger(item.id) || item.id! < 1 ||
        item.id! > hashes.length || seen.has(item.id!)) {
      throw new AuditDependencyError(`${codePrefix}_BAD_BATCH`);
    }
    if (item.error || !item.result || typeof item.result !== 'object') {
      throw new AuditDependencyError(`${codePrefix}_NO_RESULT`);
    }
    seen.add(item.id!);
    receipts[item.id! - 1] = item.result;
  }
  return receipts;
}

function arcClient(fetcher: typeof fetch) {
  let url = primaryRpcUrl;
  let fallbackAttempted = false;
  const withFallback = async <T>(request: (selectedUrl: string,
    codePrefix: string) => Promise<T>): Promise<T> => {
    try { return await request(url, url === primaryRpcUrl ? 'ARC_RPC' : 'ARC_BACKUP_RPC'); }
    catch (error) {
      const retryable = error instanceof AuditDependencyError &&
        ['ARC_RPC_HTTP_429', 'ARC_RPC_HTTP_502', 'ARC_RPC_HTTP_503',
          'ARC_RPC_HTTP_504', 'ARC_RPC_FETCH_FAILED'].includes(error.code);
      if (url !== primaryRpcUrl || !retryable) throw error;
      fallbackAttempted = true;
      // A backup receipt must never be trusted until the backup's chain is checked.
      const backupChain = await arcRpc<string>('eth_chainId', [], fetcher,
        backupRpcUrl, 'ARC_BACKUP_RPC');
      if (backupChain.toLowerCase() !== chainId) {
        throw new AuditDependencyError('ARC_BACKUP_CHAIN_ID_MISMATCH');
      }
      url = backupRpcUrl;
      return request(url, 'ARC_BACKUP_RPC');
    }
  };
  return {
    call: <T>(method: string, params: unknown[]) =>
      withFallback((selectedUrl, prefix) => arcRpc<T>(method, params, fetcher, selectedUrl, prefix)),
    receipts: (hashes: string[]) =>
      withFallback((selectedUrl, prefix) => arcReceipts(hashes, fetcher, selectedUrl, prefix)),
    provider: () => url === backupRpcUrl ? 'backup' as const : 'primary' as const,
    fallbackAttempted: () => fallbackAttempted,
  };
}

export type ReconciliationReport = {
  status: 'PASS' | 'FAIL' | 'INCOMPLETE'; checkedAt: string;
  drutoSucceeded: number; undeliveredWebhooks: number;
  unsettledTransactions: number; webhookCoverageGaps: number; exhaustedWebhooks: number;
  pagesChecked: number; rpcProvider: 'none' | 'primary' | 'backup';
  rpcFallbackAttempted: boolean; withinGrace: number; exceptionCodes: string[];
};

export async function reconcileTestnet(env: Env, fetcher: typeof fetch = fetch,
  now = Date.now()): Promise<ReconciliationReport> {
  const report: ReconciliationReport = { status: 'INCOMPLETE', checkedAt: new Date(now).toISOString(),
    drutoSucceeded: 0, undeliveredWebhooks: 0, pagesChecked: 0,
    unsettledTransactions: 0, webhookCoverageGaps: 0, exhaustedWebhooks: 0,
    rpcProvider: 'none', rpcFallbackAttempted: false, withinGrace: 0, exceptionCodes: [] };
  let stage: 'D1_READ' | 'LEDGER_CHECK' | 'ARC_CHAIN' | 'ARC_RECEIPT' = 'D1_READ';
  let client: ReturnType<typeof arcClient> | undefined;
  let chainVerified = false;
  try {
    if (!env.DRUTO_D1) throw new Error('D1 binding unavailable');
    const countResult = await env.DRUTO_D1.prepare(countSql).bind(now)
      .all<{ total: number; unsettledTransactions: number }>();
    const expected = Number(countResult.results?.[0]?.total);
    const unsettled = Number(countResult.results?.[0]?.unsettledTransactions);
    if (countResult.results?.length !== 1 || !Number.isSafeInteger(expected) || expected < 0) {
      throw new AuditDependencyError('AUDIT_BAD_COUNT');
    }
    if (!Number.isSafeInteger(unsettled) || unsettled < 0 || unsettled > maxRows + 1) {
      throw new AuditDependencyError('AUDIT_BAD_COUNT');
    }
    report.unsettledTransactions = unsettled;
    if (unsettled > 0) report.exceptionCodes.push('DRUTO_UNSETTLED_TRANSACTION');
    if (unsettled > maxRows) throw new AuditDependencyError('AUDIT_TRANSACTION_LIMIT');
    if (expected > maxRows) throw new AuditDependencyError('AUDIT_PAYMENT_LIMIT');
    const druto: DrutoPayment[] = [];
    let cursor = '';
    for (let page = 0; druto.length < expected && page < maxPages; page++) {
      const result = await env.DRUTO_D1.prepare(drutoSql).bind(now, now, cursor, pageSize).all<DrutoPayment>();
      const rows = result.results;
      if (!Array.isArray(rows) || rows.length === 0 || rows.length > pageSize ||
          rows.some(row => typeof row.id !== 'string' || row.id <= cursor ||
            typeof row.amountAtomic !== 'string')) {
        throw new AuditDependencyError('AUDIT_PAGE_MISMATCH');
      }
      for (let index = 1; index < rows.length; index++) {
        if (rows[index].id <= rows[index - 1].id) {
          throw new AuditDependencyError('AUDIT_PAGE_MISMATCH');
        }
      }
      druto.push(...rows);
      report.drutoSucceeded = druto.length;
      cursor = rows[rows.length - 1].id;
      report.pagesChecked++;
    }
    if (druto.length !== expected) throw new AuditDependencyError('AUDIT_PAGE_MISMATCH');
    report.drutoSucceeded = druto.length;
    stage = 'LEDGER_CHECK';
    const fail = (code: string) => { report.exceptionCodes.push(code); };

    for (const payment of druto) {
      // This is candidate coverage, not proof of historical subscription:
      // endpoint activation/deletion history is not currently persisted.
      for (const [field, code] of [
        ['webhookCoverageGaps', 'WEBHOOK_COVERAGE_REVIEW_REQUIRED'],
        ['exhaustedWebhooks', 'WEBHOOK_RETRIES_EXHAUSTED'],
      ] as const) {
        const count = Number(payment[field]);
        if (!Number.isSafeInteger(count) || count < 0) fail('DRUTO_WEBHOOK_LEDGER_MISMATCH');
        else { report[field] += count; if (count > 0) fail(code); }
      }
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
    stage = 'ARC_CHAIN';
    client = arcClient(fetcher);
    if ((await client.call<string>('eth_chainId', [])).toLowerCase() !== chainId) {
      throw new AuditDependencyError('ARC_CHAIN_ID_MISMATCH');
    }
    chainVerified = true;
    stage = 'ARC_RECEIPT';
    for (let offset = 0; offset < druto.length; offset += pageSize) {
      const payments = druto.slice(offset, offset + pageSize).filter(payment =>
        payment.transactionHash && payment.fromAddress);
      if (payments.length === 0) continue;
      const receipts = await client.receipts(payments.map(payment => payment.transactionHash!));
      for (let index = 0; index < payments.length; index++) {
        const payment = payments[index];
        const receipt = receipts[index];
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
    }
    report.status = report.exceptionCodes.length ? 'FAIL' : 'PASS';
  } catch (error) {
    report.exceptionCodes.push('AUDIT_INCOMPLETE');
    report.exceptionCodes.push(error instanceof AuditDependencyError ? error.code : `AUDIT_${stage}_FAILED`);
  }
  if (client) {
    if (chainVerified) report.rpcProvider = client.provider();
    report.rpcFallbackAttempted = client.fallbackAttempted();
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
