import { describe, expect, it, vi } from 'vitest';
import worker, { reconcileTestnet } from '../workers/testnet-reconciler/index';

const now = Date.UTC(2026, 9, 9, 12);
const buyer = `0x${'a'.repeat(40)}`;
const seller = `0x${'b'.repeat(40)}`;
const token = '0x3600000000000000000000000000000000000000';
const transfer = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const tx = `0x${'c'.repeat(64)}`;
const topic = (address: string) => `0x${address.slice(2).padStart(64, '0')}`;

function fixtures() {
  return {
    payments: [{ id: 'pi_test', externalOrderId: 'lf_test', amountAtomic: '2000000',
      merchantAddress: seller, marketplaceId: 'luvre-franc', sellerId: 'luvre-seller-1',
      merchantAccountId: 'ma_4uguzltzDSiU', asset: 'USDC', network: 'arc-testnet',
      platformFeeBps: 0, platformFeeAmount: '0', merchantPayoutAmount: '2000000',
      splitContractAddress: null, transactionHash: tx, recordedHash: tx,
      recordedAmount: '2000000', fromAddress: buyer, recordedTo: seller,
      chainId: 5042002, tokenAddress: token, deliveredWebhooks: 1,
      settledAt: now - 20 * 60_000 }],
    orders: [{ id: 'lf_test', status: 'PAID', amountAtomic: '2000000',
      paymentIntentId: 'pi_test', transactionHash: tx, marketplaceId: 'luvre-franc',
      sellerId: 'luvre-seller-1', merchantAccountId: 'ma_4uguzltzDSiU',
      receivingAddress: seller, asset: 'USDC', network: 'arc-testnet',
      processedEvents: 1, fulfillmentRecords: 1, fulfillmentStatus: 'PENDING',
      paidAt: now - 20 * 60_000 }],
  };
}

function database(rows: object[]) {
  const prepare = vi.fn((sql: string) => {
    if (!/^SELECT\s/i.test(sql)) throw new Error('Reconciler attempted a write');
    return { bind: () => ({ all: async () => ({ results: rows }) }) };
  });
  return { prepare };
}

function rpc(transferAmount = '2000000') {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    const result = request.method === 'eth_chainId' ? '0x4cef52' : {
      status: '0x1', transactionHash: tx,
      logs: [{ address: token, topics: [transfer, topic(buyer), topic(seller)],
        data: `0x${BigInt(transferAmount).toString(16)}` }],
    };
    return Response.json({ jsonrpc: '2.0', id: 1, result });
  });
  return fetcher as unknown as typeof fetch;
}

describe('scheduled Arc Testnet reconciliation', () => {
  it('matches both D1 ledgers and the exact USDC transfer without writing to D1', async () => {
    const { payments, orders } = fixtures();
    const druto = database(payments);
    const luvre = database(orders);
    const fetcher = rpc();
    const report = await reconcileTestnet({ DRUTO_D1: druto, LUVRE_ORDERS_DB: luvre }, fetcher, now);
    expect(report).toMatchObject({ status: 'PASS', drutoSucceeded: 1, luvrePaid: 1,
      pendingFulfillment: 1, exceptionCodes: [] });
    expect(druto.prepare).toHaveBeenCalledTimes(1);
    expect(luvre.prepare).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetcher)).toHaveBeenCalledTimes(2);
    expect((await worker.fetch()).status).toBe(404);
  });

  it('fails on stale marketplace mismatch and wrong onchain transfer amount', async () => {
    const { payments, orders } = fixtures();
    const unlinked = await reconcileTestnet({ DRUTO_D1: database(payments),
      LUVRE_ORDERS_DB: database([]) }, rpc(), now);
    expect(unlinked).toMatchObject({ status: 'FAIL', exceptionCodes: ['MARKETPLACE_ORDER_MISMATCH'] });
    const wrongTransfer = await reconcileTestnet({ DRUTO_D1: database(payments),
      LUVRE_ORDERS_DB: database(orders) }, rpc('1000000'), now);
    expect(wrongTransfer).toMatchObject({ status: 'FAIL', exceptionCodes: ['ARC_USDC_TRANSFER_MISMATCH'] });
  });

  it('detects a fee or recipient policy change even when the transaction hash matches', async () => {
    const { payments, orders } = fixtures();
    payments[0].platformFeeBps = 200;
    orders[0].receivingAddress = `0x${'d'.repeat(40)}`;
    const report = await reconcileTestnet({ DRUTO_D1: database(payments),
      LUVRE_ORDERS_DB: database(orders) }, rpc(), now);
    expect(report.status).toBe('FAIL');
    expect(report.exceptionCodes).toContain('DRUTO_PAYMENT_POLICY_MISMATCH');
    expect(report.exceptionCodes).toContain('MARKETPLACE_ORDER_MISMATCH');
  });

  it('allows a short cross-system settlement lag but never waives an internal ledger mismatch', async () => {
    const { payments } = fixtures();
    payments[0].settledAt = now - 60_000;
    payments[0].deliveredWebhooks = 0;
    const lagging = await reconcileTestnet({ DRUTO_D1: database(payments),
      LUVRE_ORDERS_DB: database([]) }, rpc(), now);
    expect(lagging).toMatchObject({ status: 'PASS', withinGrace: 1, exceptionCodes: [] });
    payments[0].recordedAmount = '1000000';
    const corrupt = await reconcileTestnet({ DRUTO_D1: database(payments),
      LUVRE_ORDERS_DB: database([]) }, rpc(), now);
    expect(corrupt).toMatchObject({ status: 'FAIL' });
    expect(corrupt.exceptionCodes).toContain('DRUTO_TRANSACTION_MISMATCH');
  });

  it('fails closed on incomplete D1 results, over-limit ledgers, and RPC errors', async () => {
    const { payments, orders } = fixtures();
    const incomplete = await reconcileTestnet({ DRUTO_D1: database(payments),
      LUVRE_ORDERS_DB: database(orders) }, vi.fn(async () => new Response('unavailable', { status: 503 })) as unknown as typeof fetch, now);
    expect(incomplete).toMatchObject({ status: 'INCOMPLETE', exceptionCodes: ['AUDIT_INCOMPLETE'] });
    const overLimit = await reconcileTestnet({ DRUTO_D1: database(Array(21).fill(payments[0])),
      LUVRE_ORDERS_DB: database(orders) }, rpc(), now);
    expect(overLimit).toMatchObject({ status: 'INCOMPLETE', exceptionCodes: ['AUDIT_INCOMPLETE'] });
  });
});
