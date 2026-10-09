// Read-only operator diagnostic for the two Cloudflare D1 Testnet databases.
// Requires local Wrangler authentication; never prints API keys or customer data.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const drutoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Point LUVRE_REPO_DIR at the Luvre checkout when the two repositories are not siblings.
const luvreRoot = resolve(process.env.LUVRE_REPO_DIR ?? join(drutoRoot, '..', 'luvre-persistence-release'));
const chainId = '0x4cef52'; // 5042002
const tokenAddress = '0x3600000000000000000000000000000000000000';
const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

async function d1Rows(root, config, database, sql) {
  const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  let stdout;
  try {
    ({ stdout } = await exec(process.execPath, [wrangler, 'd1', 'execute', database,
      '--remote', '--config', config, '--json', '--command', sql],
    { cwd: root, windowsHide: true, timeout: 45_000, maxBuffer: 2_000_000 }));
  } catch {
    throw new Error(`Read-only ${database} D1 query unavailable`);
  }
  let result;
  try { result = JSON.parse(stdout); } catch { throw new Error(`Invalid ${database} D1 response`); }
  if (!Array.isArray(result) || result.length !== 1 || result[0]?.success !== true ||
      !Array.isArray(result[0].results)) throw new Error(`Incomplete ${database} D1 response`);
  return result[0].results;
}

async function arcRpc(method, params = []) {
  const response = await fetch('https://rpc.testnet.arc.io', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('Arc Testnet RPC unavailable');
  const payload = await response.json();
  if (payload.error || !('result' in payload)) throw new Error('Arc Testnet RPC returned an error');
  return payload.result;
}

const drutoSql = `SELECT p.id, p.externalOrderId, p.amountAtomic, p.merchantAddress,
  p.transactionHash, t.transactionHash AS recordedHash, t.amountAtomic AS recordedAmount,
  t.fromAddress, t.toAddress AS recordedTo, t.chainId, t.tokenAddress,
  (SELECT COUNT(*) FROM webhookDeliveries d JOIN webhookEndpoints e ON e.id=d.endpointId
    WHERE d.paymentIntentId=p.id AND e.url='https://luvre-franc-d1-testnet.robobq.workers.dev/api/webhooks/druto'
      AND d.status='succeeded') AS deliveredWebhooks
  FROM paymentIntents p LEFT JOIN paymentTransactions t ON t.paymentIntentId=p.id
  WHERE p.marketplaceId='luvre-franc' AND p.status='succeeded' ORDER BY p.id LIMIT 101`;
const luvreSql = `SELECT o.id, o.status, o.amountAtomic, o.paymentIntentId, o.transactionHash,
  (SELECT COUNT(*) FROM processedEvents e WHERE e.orderId=o.id) AS processedEvents,
  (SELECT COUNT(*) FROM fulfillmentOutbox f WHERE f.orderId=o.id) AS fulfillmentRecords,
  (SELECT status FROM fulfillmentOutbox f WHERE f.orderId=o.id) AS fulfillmentStatus
  FROM orders o WHERE o.paymentIntentId IS NOT NULL ORDER BY o.id LIMIT 101`;

const report = { checkedAt: new Date().toISOString(), network: 'arc-testnet',
  drutoSucceeded: 0, luvrePaid: 0, pendingOrders: 0, pendingFulfillment: 0,
  exceptions: [], status: 'INCOMPLETE' };
try {
  const [druto, luvre] = await Promise.all([
    d1Rows(drutoRoot, 'wrangler.d1.jsonc', 'druto-d1-testnet', drutoSql),
    d1Rows(luvreRoot, 'wrangler.jsonc', 'luvre-d1-testnet', luvreSql),
  ]);
  if (druto.length > 100 || luvre.length > 100) throw new Error('Testnet report exceeds 100-record audit limit');
  report.drutoSucceeded = druto.length;
  report.luvrePaid = luvre.filter(order => order.status === 'PAID').length;
  report.pendingOrders = luvre.filter(order => order.status === 'PENDING').length;
  report.pendingFulfillment = luvre.filter(order => order.fulfillmentStatus === 'PENDING').length;
  const byIntent = new Map(druto.map(payment => [payment.id, payment]));
  const byOrder = new Map(luvre.map(order => [order.id, order]));
  const fail = (code, id) => report.exceptions.push({ code, id });
  for (const payment of druto) {
    if (!payment.recordedHash || payment.recordedHash.toLowerCase() !== payment.transactionHash?.toLowerCase() ||
        payment.recordedAmount !== payment.amountAtomic ||
        payment.recordedTo?.toLowerCase() !== payment.merchantAddress?.toLowerCase() ||
        payment.chainId !== 5042002 || payment.tokenAddress?.toLowerCase() !== tokenAddress) {
      fail('DRUTO_TRANSACTION_MISMATCH', payment.id);
      continue;
    }
    if (payment.deliveredWebhooks !== 1) fail('WEBHOOK_NOT_DELIVERED_ONCE', payment.id);
    const order = byOrder.get(payment.externalOrderId);
    if (!order || order.paymentIntentId !== payment.id || order.status !== 'PAID' ||
        order.amountAtomic !== payment.amountAtomic ||
        order.transactionHash?.toLowerCase() !== payment.transactionHash.toLowerCase()) {
      fail('MARKETPLACE_ORDER_MISMATCH', payment.id);
    }
  }
  for (const order of luvre) {
    if (order.status !== 'PAID') continue;
    if (!byIntent.has(order.paymentIntentId)) fail('PAID_ORDER_WITHOUT_DRUTO_SETTLEMENT', order.id);
    if (order.processedEvents !== 1 || order.fulfillmentRecords !== 1) fail('MARKETPLACE_EVENT_OR_OUTBOX_MISMATCH', order.id);
  }
  if ((await arcRpc('eth_chainId')).toLowerCase() !== chainId) throw new Error('Unexpected Arc RPC chain');
  for (const payment of druto) {
    if (!payment.transactionHash) continue;
    const receipt = await arcRpc('eth_getTransactionReceipt', [payment.transactionHash]);
    if (!receipt || receipt.status !== '0x1' ||
        receipt.transactionHash?.toLowerCase() !== payment.transactionHash.toLowerCase()) {
      fail('ARC_RECEIPT_MISMATCH', payment.id);
      continue;
    }
    const sellerTopic = `0x${payment.merchantAddress.toLowerCase().slice(2).padStart(64, '0')}`;
    const payerTopic = `0x${payment.fromAddress.toLowerCase().slice(2).padStart(64, '0')}`;
    const matching = (receipt.logs ?? []).filter(log =>
      log.address?.toLowerCase() === tokenAddress && log.topics?.[0]?.toLowerCase() === transferTopic &&
      log.topics?.[1]?.toLowerCase() === payerTopic && log.topics?.[2]?.toLowerCase() === sellerTopic &&
      BigInt(log.data) === BigInt(payment.amountAtomic));
    if (matching.length !== 1) fail('ARC_USDC_TRANSFER_MISMATCH', payment.id);
  }
  report.status = report.exceptions.length ? 'FAIL' : 'PASS';
} catch (error) {
  report.exceptions.push({ code: 'AUDIT_INCOMPLETE', reason: error instanceof Error ? error.message : 'Unknown audit failure' });
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== 'PASS') process.exitCode = report.status === 'FAIL' ? 1 : 2;
