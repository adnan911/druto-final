// Arc testnet engineering ceiling, not an approved business/mainnet payment limit.
export const MAX_PAYMENT_ATOMIC = BigInt('1000000000000');
export function parsePaymentAmount(value: string): string {
  if (typeof value !== 'string' || value.length > 14 || !/^\d{1,7}(\.\d{1,6})?$/.test(value)) {
    throw new Error('Amount must be a USDC decimal with at most 6 fractional digits');
  }
  const [whole, fraction = ''] = value.split('.');
  const atomic = BigInt(whole) * BigInt(1000000) + BigInt(fraction.padEnd(6, '0'));
  if (atomic < BigInt(1) || atomic > MAX_PAYMENT_ATOMIC) throw new Error('Amount must be between 0.000001 and 1000000 USDC');
  return atomic.toString();
}
export function formatAtomicUsdc(value: string): string {
  const atomic = BigInt(value);
  return `${atomic / BigInt(1000000)}.${(atomic % BigInt(1000000)).toString().padStart(6, '0')}`;
}
