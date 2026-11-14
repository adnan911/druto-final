import { describe, expect, it, vi } from 'vitest';
import worker, { reconcileTestnet } from '../workers/testnet-reconciler/index';

const now = Date.UTC(2026, 9, 10, 12);
const buyer = `0x${'a'.repeat(40)}`;
const seller = `0x${'b'.repeat(40)}`;
const otherSeller = `0x${'d'.repeat(40)}`;
const token = '0x3600000000000000000000000000000000000000';
const transfer = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const tx = `0x${'c'.repeat(64)}`;
const otherTx = `0x${'e'.repeat(64)}`;
const topic = (address: string) => `0x${address.slice(2).padStart(64, '0')}`;

function paymentFixture(overrides: Record<string, unknown> = {}) {
  return { id: 'pi_test', amountAtomic: '2000000', merchantAddress: seller,
    marketplaceId: 'luvre-franc', sellerId: 'luvre-seller-1', merchantAccountId: 'ma_1',
    accountMarketplaceId: 'luvre-franc', accountSellerId: 'luvre-seller-1',
    asset: 'USDC', network: 'arc-testnet', platformFeeBps: 0,
    platformFeeAmount: '0', merchantPayoutAmount: '2000000',
    splitContractAddress: null, transactionHash: tx, recordedHash: tx,
    recordedAmount: '2000000', fromAddress: buyer, recordedTo: seller,
    chainId: 5042002, tokenAddress: token, undeliveredWebhooks: 0,
    webhookCoverageGaps: 0, exhaustedWebhooks: 0,
    settledAt: now - 20 * 60_000, ...overrides };
}

function database(rows: object[]) {
  const ordered = [...rows].sort((a, b) => String((a as { id: string }).id)
    .localeCompare(String((b as { id: string }).id)));
  const prepare = vi.fn((sql: string) => {
    if (!/^SELECT\s/i.test(sql)) throw new Error('Reconciler attempted a write');
    return { bind: (...values: unknown[]) => ({ all: async () => ({
      results: sql.includes('COUNT(*) AS total')
        ? [{ total: ordered.length, unsettledTransactions: 0 }]
        : ordered.filter(row => String((row as { id: string }).id) > String(values[2]))
          .slice(0, Number(values[3])),
    }) }) };
  });
  return { prepare };
}

function rpc(payments: Array<ReturnType<typeof paymentFixture>>, wrongAmount = false) {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    const answer = (item: { id: number; method: string; params: string[] }) => {
      if (item.method === 'eth_chainId') {
        return { jsonrpc: '2.0', id: item.id, result: '0x4cef52' };
      }
      const payment = payments.find(row => row.transactionHash === item.params[0]);
      if (!payment) return { jsonrpc: '2.0', id: item.id, result: null };
      return { jsonrpc: '2.0', id: item.id, result: {
        status: '0x1', transactionHash: payment.transactionHash,
        logs: [{ address: token, topics: [transfer, topic(buyer), topic(String(payment.merchantAddress))],
          data: `0x${BigInt(wrongAmount ? '1000000' : String(payment.amountAtomic)).toString(16)}` }],
      } };
    };
    // Providers may return batch responses in a different order.
    return Response.json(Array.isArray(request) ? request.map(answer).reverse() : answer(request));
  });
  return fetcher as unknown as typeof fetch;
}

describe('scheduled Druto Arc Testnet reconciliation', () => {
  it('checks all sellers against one Druto D1 ledger and exact Arc transfers without writes', async () => {
    const payments = [paymentFixture(), paymentFixture({ id: 'pi_other', amountAtomic: '5000000',
      merchantAddress: otherSeller, marketplaceId: 'another-market', sellerId: 'seller-2',
      merchantAccountId: 'ma_2', accountMarketplaceId: 'another-market',
      accountSellerId: 'seller-2', merchantPayoutAmount: '5000000',
      transactionHash: otherTx, recordedHash: otherTx, recordedAmount: '5000000',
      recordedTo: otherSeller })];
    const druto = database(payments);
    const fetcher = rpc(payments);
    const report = await reconcileTestnet({ DRUTO_D1: druto }, fetcher, now);
    expect(report).toMatchObject({ status: 'PASS', drutoSucceeded: 2,
      pagesChecked: 1, rpcProvider: 'primary', rpcFallbackAttempted: false,
      undeliveredWebhooks: 0, exceptionCodes: [] });
    expect(druto.prepare).toHaveBeenCalledTimes(2);
    const sql = druto.prepare.mock.calls[1][0];
    expect(sql).not.toContain("luvre-franc'");
    expect(sql).toContain("WHERE p.status='succeeded'");
    expect(sql).toContain('p.id>?');
    expect(vi.mocked(fetcher)).toHaveBeenCalledTimes(2);
    expect((await worker.fetch()).status).toBe(404);
  });

  it('checks 25 payments through three ordered pages and three bounded RPC batches', async () => {
    const payments = Array.from({ length: 25 }, (_, index) => paymentFixture({
      id: `pi_${String(index).padStart(3, '0')}`,
      transactionHash: `0x${(index + 1).toString(16).padStart(64, '0')}`,
      recordedHash: `0x${(index + 1).toString(16).padStart(64, '0')}`,
    }));
    const druto = database(payments);
    const fetcher = rpc(payments);
    const report = await reconcileTestnet({ DRUTO_D1: druto }, fetcher, now);
    expect(report).toMatchObject({ status: 'PASS', drutoSucceeded: 25,
      pagesChecked: 3, rpcProvider: 'primary', exceptionCodes: [] });
    expect(druto.prepare).toHaveBeenCalledTimes(4); // One count and three pages.
    expect(vi.mocked(fetcher)).toHaveBeenCalledTimes(4); // One chain and three batches.
    expect(vi.mocked(fetcher).mock.calls.slice(1).map(call =>
      JSON.parse(String(call[1]?.body)).length)).toEqual([10, 10, 5]);
  });

  it('audits the 100-payment boundary within the Free-tier external request budget', async () => {
    const payments = Array.from({ length: 100 }, (_, index) => paymentFixture({
      id: `pi_${String(index).padStart(3, '0')}`,
      transactionHash: `0x${(index + 1).toString(16).padStart(64, '0')}`,
      recordedHash: `0x${(index + 1).toString(16).padStart(64, '0')}`,
    }));
    const druto = database(payments);
    const fetcher = rpc(payments);
    const report = await reconcileTestnet({ DRUTO_D1: druto }, fetcher, now);
    expect(report).toMatchObject({ status: 'PASS', drutoSucceeded: 100,
      pagesChecked: 10, exceptionCodes: [] });
    expect(druto.prepare).toHaveBeenCalledTimes(11);
    expect(vi.mocked(fetcher)).toHaveBeenCalledTimes(11);
  });

  it('fails closed on duplicate page IDs or malformed batch IDs', async () => {
    const payment = paymentFixture();
    const repeated = await reconcileTestnet({ DRUTO_D1: database([payment, payment]) },
      rpc([payment]), now);
    expect(repeated).toMatchObject({ status: 'INCOMPLETE',
      exceptionCodes: ['AUDIT_INCOMPLETE', 'AUDIT_PAGE_MISMATCH'] });
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      if (!Array.isArray(request)) return Response.json({ jsonrpc: '2.0', id: 1, result: '0x4cef52' });
      return Response.json([{ jsonrpc: '2.0', id: 2, result: {} }]);
    }) as unknown as typeof fetch;
    const malformed = await reconcileTestnet({ DRUTO_D1: database([payment]) }, fetcher, now);
    expect(malformed).toMatchObject({ status: 'INCOMPLETE', rpcProvider: 'primary',
      exceptionCodes: ['AUDIT_INCOMPLETE', 'ARC_RPC_BAD_BATCH'] });
  });

  it('fails on wrong fee policy, seller identity, ledger transaction and Arc amount', async () => {
    const policy = paymentFixture({ platformFeeBps: 200, accountSellerId: 'other-seller' });
    const policyReport = await reconcileTestnet({ DRUTO_D1: database([policy]) }, rpc([policy]), now);
    expect(policyReport).toMatchObject({ status: 'FAIL', exceptionCodes: ['DRUTO_PAYMENT_POLICY_MISMATCH'] });
    const ledger = paymentFixture({ recordedAmount: '1000000' });
    const ledgerReport = await reconcileTestnet({ DRUTO_D1: database([ledger]) }, rpc([ledger]), now);
    expect(ledgerReport.exceptionCodes).toContain('DRUTO_TRANSACTION_MISMATCH');
    const valid = paymentFixture();
    const arcReport = await reconcileTestnet({ DRUTO_D1: database([valid]) }, rpc([valid], true), now);
    expect(arcReport.exceptionCodes).toContain('ARC_USDC_TRANSFER_MISMATCH');
  });

  it('gives recent webhook retries a short grace but flags old undelivered work', async () => {
    const recent = paymentFixture({ undeliveredWebhooks: 1, settledAt: now - 60_000 });
    const grace = await reconcileTestnet({ DRUTO_D1: database([recent]) }, rpc([recent]), now);
    expect(grace).toMatchObject({ status: 'PASS', undeliveredWebhooks: 1,
      withinGrace: 1, exceptionCodes: [] });
    const old = paymentFixture({ undeliveredWebhooks: 1 });
    const stale = await reconcileTestnet({ DRUTO_D1: database([old]) }, rpc([old]), now);
    expect(stale).toMatchObject({ status: 'FAIL', undeliveredWebhooks: 1,
      exceptionCodes: ['WEBHOOK_UNDELIVERED'] });
  });

  it('fails closed on missing D1, over-limit ledgers and unavailable Arc RPC', async () => {
    const payment = paymentFixture();
    const missing = await reconcileTestnet({ DRUTO_D1: undefined as never }, rpc([payment]), now);
    expect(missing).toMatchObject({ status: 'INCOMPLETE',
      exceptionCodes: ['AUDIT_INCOMPLETE', 'AUDIT_D1_READ_FAILED'] });
    const overLimit = await reconcileTestnet({ DRUTO_D1: database(Array(101).fill(payment)) }, rpc([payment]), now);
    expect(overLimit).toMatchObject({ status: 'INCOMPLETE',
      exceptionCodes: ['AUDIT_INCOMPLETE', 'AUDIT_PAYMENT_LIMIT'] });
    const unavailable = await reconcileTestnet({ DRUTO_D1: database([payment]) },
      vi.fn(async () => new Response('unavailable', { status: 503 })) as unknown as typeof fetch, now);
    expect(unavailable).toMatchObject({ status: 'INCOMPLETE',
      exceptionCodes: ['AUDIT_INCOMPLETE', 'ARC_BACKUP_RPC_HTTP_503'] });
    const network = await reconcileTestnet({ DRUTO_D1: database([payment]) },
      vi.fn(async () => { throw new Error('secret upstream detail'); }) as unknown as typeof fetch, now);
    expect(network).toMatchObject({ status: 'INCOMPLETE',
      exceptionCodes: ['AUDIT_INCOMPLETE', 'ARC_BACKUP_RPC_FETCH_FAILED'] });
    expect(JSON.stringify(network)).not.toContain('secret upstream detail');
    const limited = await reconcileTestnet({ DRUTO_D1: database([payment]) },
      vi.fn(async () => new Response('', { status: 429 })) as unknown as typeof fetch, now);
    expect(limited).toMatchObject({ status: 'INCOMPLETE',
      exceptionCodes: ['AUDIT_INCOMPLETE', 'ARC_BACKUP_RPC_HTTP_429'] });
  });

  it('uses an Arc-documented backup only after primary 429 and checks its chain', async () => {
    const payment = paymentFixture();
    const working = rpc([payment]);
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://rpc.testnet.arc.io') return new Response('', { status: 429 });
      return working(url, init);
    }) as unknown as typeof fetch;
    const report = await reconcileTestnet({ DRUTO_D1: database([payment]) }, fetcher, now);
    expect(report).toMatchObject({ status: 'PASS', drutoSucceeded: 1,
      rpcProvider: 'backup', rpcFallbackAttempted: true, exceptionCodes: [] });
    expect(vi.mocked(fetcher).mock.calls.map(call => call[0])).toEqual([
      'https://rpc.testnet.arc.io', 'https://rpc.drpc.testnet.arc.io',
      'https://rpc.drpc.testnet.arc.io', 'https://rpc.drpc.testnet.arc.io',
    ]);

    const wrongChain = vi.fn(async (url: string) => url === 'https://rpc.testnet.arc.io'
      ? new Response('', { status: 429 })
      : Response.json({ jsonrpc: '2.0', id: 1, result: '0x1' })) as unknown as typeof fetch;
    const unsafe = await reconcileTestnet({ DRUTO_D1: database([payment]) }, wrongChain, now);
    expect(unsafe).toMatchObject({ status: 'INCOMPLETE',
      exceptionCodes: ['AUDIT_INCOMPLETE', 'ARC_BACKUP_CHAIN_ID_MISMATCH'] });
  });

  it('switches to the checked backup if the primary fails during receipt lookup', async () => {
    const payment = paymentFixture();
    const working = rpc([payment]);
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      if (url === 'https://rpc.testnet.arc.io' && Array.isArray(request)) {
        return new Response('', { status: 429 });
      }
      return working(url, init);
    }) as unknown as typeof fetch;
    const report = await reconcileTestnet({ DRUTO_D1: database([payment]) }, fetcher, now);
    expect(report).toMatchObject({ status: 'PASS', rpcProvider: 'backup',
      rpcFallbackAttempted: true });
    expect(vi.mocked(fetcher).mock.calls.map(call => call[0])).toEqual([
      'https://rpc.testnet.arc.io', 'https://rpc.testnet.arc.io',
      'https://rpc.drpc.testnet.arc.io', 'https://rpc.drpc.testnet.arc.io',
    ]);
  });
});
