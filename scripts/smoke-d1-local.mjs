import { randomBytes } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';

const origin = process.argv[2] ?? 'http://127.0.0.1:8789';
const url = new URL(origin);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol !== 'http:') {
  throw new Error('This script only targets a local Wrangler Worker');
}
let cookie = '';
async function call(path, input, headers = {}) {
  const response = await fetch(new URL(`/api/trpc/${path}`, origin), {
    method: input === undefined ? 'GET' : 'POST',
    headers: { ...(input === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}), ...headers },
    body: input === undefined ? undefined : JSON.stringify({ json: input }),
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';', 1)[0];
  const body = await response.json();
  return { status: response.status, data: body.result?.data?.json, code: body.error?.data?.code };
}
function expect(value, message) { if (!value) throw new Error(message); }

const account = privateKeyToAccount(`0x${randomBytes(32).toString('hex')}`);
const suffix = randomBytes(4).toString('hex');
const challenge = await call('auth.createWalletChallenge', { walletAddress: account.address });
expect(challenge.status === 200 && challenge.data?.challengeId && challenge.data?.message, 'Wallet challenge failed');
const signature = await account.signMessage({ message: challenge.data.message });
const login = await call('auth.verifyWalletLogin', { challengeId: challenge.data.challengeId,
  walletAddress: account.address, signature });
expect(login.status === 200 && login.data?.authenticated && cookie, 'Wallet login failed');
const replay = await call('auth.verifyWalletLogin', { challengeId: challenge.data.challengeId,
  walletAddress: account.address, signature });
expect(replay.status >= 400, 'Wallet challenge replay accepted');
const registration = await call('merchantAccounts.register', { marketplaceId: `local-smoke-${suffix}`,
  sellerId: 'seller-1', displayName: 'Local smoke seller', receivingAddress: account.address });
expect(registration.status === 200 && registration.data?.status === 'pending', 'Seller registration failed');
const ownership = await call('sellerOwnership.createChallenge', { merchantAccountId: registration.data.id });
expect(ownership.status === 200 && ownership.data?.message, 'Seller challenge failed');
const ownershipSignature = await account.signMessage({ message: ownership.data.message });
const verified = await call('sellerOwnership.verify', { merchantAccountId: registration.data.id,
  challengeId: ownership.data.challengeId, signature: ownershipSignature });
expect(verified.status === 200 && verified.data?.status === 'active', 'Seller ownership failed');
const ownershipReplay = await call('sellerOwnership.verify', { merchantAccountId: registration.data.id,
  challengeId: ownership.data.challengeId, signature: ownershipSignature });
expect(ownershipReplay.status >= 400, 'Seller challenge replay accepted');
const key = await call('apiKeys.create', { name: 'Local smoke key', merchantAccountId: registration.data.id });
expect(key.status === 200 && key.data?.secret, 'API key creation failed');
const paymentInput = { externalOrderId: `order-${suffix}`, idempotencyKey: `order-${suffix}`,
  itemName: 'Local smoke order', amount: '1.00', seller: { marketplaceId: `local-smoke-${suffix}`,
    sellerId: 'seller-1', merchantAccountId: registration.data.id } };
const authorization = { authorization: `Bearer ${key.data.secret}` };
const intent = await call('payments.createIntent', paymentInput, authorization);
expect(intent.status === 200 && intent.data?.id && intent.data?.platformFeeBps === 0 &&
  intent.data?.merchantAddress?.toLowerCase() === account.address.toLowerCase(), 'Payment intent failed');
const retry = await call('payments.createIntent', paymentInput, authorization);
expect(retry.status === 200 && retry.data?.id === intent.data.id, 'Idempotent payment retry failed');
const conflict = await call('payments.createIntent', { ...paymentInput, amount: '2.00' }, authorization);
expect(conflict.status === 409, 'Changed idempotent payment was accepted');
const publicIntent = await call(`payments.getIntent?input=${encodeURIComponent(JSON.stringify({ json: { id: intent.data.id } }))}`);
expect(publicIntent.status === 200 && publicIntent.data?.id === intent.data.id, 'Public checkout lookup failed');
const summary = await call('payments.summary');
expect(summary.status === 200 && summary.data?.pendingCount === 1 && summary.data?.successfulCount === 0,
  'Seller reporting failed');
const listings = await call('merchantAccounts.listMine');
expect(listings.status === 200 && listings.data?.accounts?.some(row => row.id === registration.data.id),
  'Seller dashboard linkage failed');
console.log(JSON.stringify({ passed: true, checks: ['wallet-signin', 'wallet-replay', 'seller-ownership',
  'ownership-replay', 'api-key', 'checkout', 'idempotency', 'public-lookup', 'reporting'] }));
