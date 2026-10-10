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
    settledAt: now - 20 * 60_000, ...overrides };
}

function database(rows: object[]) {
  const prepare = vi.fn((sql: string) => {
    if (!/^SELECT\s/i.test(sql)) throw new Error('Reconciler attempted a write');
    return { bind: () => ({ all: async () => ({ results: rows }) }) };
  });
  return { prepare };
}

function rpc(payments: Array<ReturnType<typeof paymentFixture>>, wrongAmount = false) {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    if (request.method === 'eth_chainId') return Response.json({ jsonrpc: '2.0', id: 1, result: '0x4cef52' });
    const payment = payments.find(row => row.transactionHash === request.params[0]);
    if (!payment) return Response.json({ jsonrpc: '2.0', id: 1, result: null });
    return Response.json({ jsonrpc: '2.0', id: 1, result: {
      status: '0x1', transactionHash: payment.transactionHash,
      logs: [{ address: token, topics: [transfer, topic(buyer), topic(String(payment.merchantAddress))],
        data: `0x${BigInt(wrongAmount ? '1000000' : String(payment.amountAtomic)).toString(16)}` }],
    } });
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
      undeliveredWebhooks: 0, exceptionCodes: [] });
    expect(druto.prepare).toHaveBeenCalledTimes(1);
    const sql = druto.prepare.mock.calls[0][0];
    expect(sql).not.toContain("luvre-franc'");
    expect(sql).toContain("WHERE p.status='succeeded'");
    expect(vi.mocked(fetcher)).toHaveBeenCalledTimes(3);
    expect((await worker.fetch()).status).toBe(404);
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
    expect(missing).toMatchObject({ status: 'INCOMPLETE', exceptionCodes: ['AUDIT_INCOMPLETE'] });
    const overLimit = await reconcileTestnet({ DRUTO_D1: database(Array(21).fill(payment)) }, rpc([payment]), now);
    expect(overLimit).toMatchObject({ status: 'INCOMPLETE', exceptionCodes: ['AUDIT_INCOMPLETE'] });
    const unavailable = await reconcileTestnet({ DRUTO_D1: database([payment]) },
      vi.fn(async () => new Response('unavailable', { status: 503 })) as unknown as typeof fetch, now);
    expect(unavailable).toMatchObject({ status: 'INCOMPLETE', exceptionCodes: ['AUDIT_INCOMPLETE'] });
  });
});
