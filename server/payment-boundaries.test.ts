import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const getDb = vi.hoisted(() => vi.fn());
vi.mock('./db', () => ({ getDb }));
import { appRouter, paymentInput } from './routers';
import { parsePaymentAmount, formatAtomicUsdc } from '../shared/usdc-amount';
import { scopedIntentKey, assertIntentRetry } from './payment-idempotency';
import { publicPaymentIntent, createdPaymentSession } from './payment-intent-view';
import type { PaymentIntent } from '../drizzle/schema';
const fixture = (): PaymentIntent => ({ id: 'pi_boundary', externalOrderId: 'private-order', marketplaceId: 'market_a', sellerId: 'seller_a', merchantAccountId: 'ma_a',
  idempotencyKey: 'private-key', itemName: 'Public item', buyerLabel: 'buyer@example.invalid', returnUrl: '/orders/paid',
  orderContext: JSON.stringify({ buyerEmail: 'buyer@example.invalid', shippingAddress: { line1: 'Private street' } }),
  amountAtomic: '1234567', platformFeeBps: 200, platformFeeAmount: '24691', merchantPayoutAmount: '1209876', splitContractAddress: null,
  asset: 'USDC', network: 'arc-testnet', merchantAddress: `0x${'1'.repeat(40)}`, buyerAddress: `0x${'2'.repeat(40)}`,
  status: 'requires_payment', transactionHash: null, expiresAt: new Date(Date.now() + 60000), createdAt: new Date(), updatedAt: new Date() });
beforeEach(() => getDb.mockReset());
afterEach(() => vi.unstubAllEnvs());
const caller = (user: any = null) => appRouter.createCaller({ user, req: {}, res: {} } as any);
function rows(...results: any[][]) {
  getDb.mockResolvedValue({ select: () => ({ from: () => ({ where: () => ({ limit: async () => results.shift() ?? [] }) }) }) });
}
it.each(['0', '0.000000', '-1', '+1', '1e6', 'NaN', 'Infinity', ' 1', '1 ', '.1', '1.', '0.0000001', '1000000.000001', '1000001', '9'.repeat(1000)])('rejects invalid/out-of-range amount %s at schema and converter', amount => {
  expect(() => paymentInput.parse({ externalOrderId: 'o', itemName: 'i', amount })).toThrow();
  expect(() => parsePaymentAmount(amount)).toThrow();
});
it.each([['0.000001', '1'], ['1.234567', '1234567'], ['1000000', '1000000000000'], ['1.00', '1000000']])('converts %s without floating-point arithmetic', (value, atomic) => {
  expect(parsePaymentAmount(value)).toBe(atomic); expect(parsePaymentAmount(formatAtomicUsdc(atomic))).toBe(atomic);
});
it('rejects invalid amounts before database access', async () => {
  await expect(caller().payments.createIntent({ externalOrderId: 'o', itemName: 'i', amount: '0' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  expect(getDb).not.toHaveBeenCalled();
});
it('fails before insertion when an unscoped receiving wallet is unconfigured', async () => {
  vi.stubEnv('ARC_MERCHANT_WALLET_ADDRESS', ''); getDb.mockResolvedValue({});
  await expect(caller().payments.createIntent({ externalOrderId: 'o', itemName: 'i', amount: '1' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
});
it('publishes only an explicit checkout allowlist, including future DB columns', async () => {
  const record = { ...fixture(), futurePrivateColumn: 'sensitive-future' }; rows([record]);
  const view = await caller().payments.getIntent({ id: record.id });
  expect(Object.keys(view).sort()).toEqual(['id', 'itemName', 'amountAtomic', 'asset', 'network', 'merchantAddress', 'status', 'transactionHash', 'expiresAt', 'platformFeeBps', 'platformFeeAmount', 'merchantPayoutAmount', 'splitContractAddress', 'returnUrl', 'verificationOrigin'].sort());
  expect(JSON.stringify(view)).not.toMatch(/Private street|buyer@example|private-key|private-order|sensitive-future/);
  expect(createdPaymentSession(record, 'https://checkout.example').displayAmount).toBe('1.234567');
  expect(createdPaymentSession(record, 'https://checkout.example')).not.toHaveProperty('buyerLabel');
});
it('rejects a wrong ID even if the development adapter ignores WHERE', async () => {
  rows([fixture()]); await expect(caller().payments.getIntent({ id: 'missing' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('requires login for private order details', async () => {
  await expect(caller().payments.getPrivateIntent({ id: 'pi_boundary' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' }); expect(getDb).not.toHaveBeenCalled();
});
it('allows the owning seller and denies another seller', async () => {
  rows([fixture()], [{ id: 'ma_a', ownerUserId: 1 }]);
  expect((await caller({ id: 1, role: 'user' }).payments.getPrivateIntent({ id: 'pi_boundary' })).orderContext).toContain('Private street');
  rows([fixture()], [{ id: 'ma_a', ownerUserId: 1 }]);
  await expect(caller({ id: 2, role: 'user' }).payments.getPrivateIntent({ id: 'pi_boundary' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('denies unowned legacy details to ordinary users and allows an explicit operator', async () => {
  rows([{ ...fixture(), merchantAccountId: null }]);
  await expect(caller({ id: 1, role: 'user' }).payments.getPrivateIntent({ id: 'pi_boundary' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  rows([fixture()]); expect((await caller({ id: 1, role: 'admin' }).payments.getPrivateIntent({ id: 'pi_boundary' })).buyerLabel).toBe('buyer@example.invalid');
});
it('does not fall back to public private data for logged-in callers', async () => {
  const record = fixture(); rows([record]); expect(await caller({ id: 1, role: 'admin' }).payments.getIntent({ id: 'pi_boundary' })).toEqual(publicPaymentIntent(record, new URL(process.env.DRUTO_API_URL || 'https://druto-final.vercel.app').origin));
});
it('namespaces the same caller key by resolved tenant and isolates anonymous demo requests', () => {
  const a = fixture(); const keys = [scopedIntentKey('same', a), scopedIntentKey('same', { ...a, merchantAccountId: 'ma_b' }), scopedIntentKey('same', { ...a, marketplaceId: 'market_b' }), scopedIntentKey('same', { marketplaceId: null, sellerId: null, merchantAccountId: null })];
  expect(new Set(keys).size).toBe(4); expect(keys[0]).toBe(scopedIntentKey('same', a)); expect(keys[0].length).toBeLessThanOrEqual(128);
});
it.each(['externalOrderId', 'itemName', 'amountAtomic', 'buyerLabel', 'returnUrl', 'sellerId', 'marketplaceId', 'merchantAccountId', 'network', 'asset', 'merchantAddress'] as const)('rejects changed retry field %s', field => {
  const a = fixture(); expect(() => assertIntentRetry(a, { ...a, [field]: 'changed' })).toThrow('different payment details');
});
it('requires a new idempotency key when the payment fee policy changes', () => {
  const old = fixture();
  const direct = { ...old, platformFeeBps: 0, platformFeeAmount: '0', merchantPayoutAmount: old.amountAtomic };
  expect(() => assertIntentRetry(old, direct)).toThrow('new idempotency key');
  expect(() => assertIntentRetry(old, { ...old, splitContractAddress: `0x${'3'.repeat(40)}` })).toThrow('new idempotency key');
});
it('compares private context semantically but rejects changed content', () => {
  const a = fixture();
  expect(() => assertIntentRetry(a, { ...a, orderContext: JSON.stringify({ shippingAddress: { line1: 'Private street' }, buyerEmail: 'buyer@example.invalid' }) })).not.toThrow();
  expect(() => assertIntentRetry(a, { ...a, orderContext: '{}' })).toThrow();
});
