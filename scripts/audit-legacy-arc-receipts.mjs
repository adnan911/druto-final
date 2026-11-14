// Read-only Arc Testnet audit of legacy TiDB payment evidence.
// Prints aggregate classifications only; never logs hashes, wallets or SQL rows.
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { createPublicClient, decodeEventLog, defineChain, http } from 'viem';

const envPath = process.argv[2];
if (!envPath || process.argv.length !== 3) {
  console.error('Usage: node scripts/audit-legacy-arc-receipts.mjs <ignored local TiDB env file>');
  process.exit(2);
}

const chainId = 5042002;
const usdc = '0x3600000000000000000000000000000000000000';
const chain = defineChain({ id: chainId, name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } }, testnet: true });
const client = createPublicClient({ chain, transport: http('https://rpc.testnet.arc.io', { timeout: 10000 }) });
const transferAbi = [{ type: 'event', name: 'Transfer', inputs: [
  { indexed: true, name: 'from', type: 'address' },
  { indexed: true, name: 'to', type: 'address' },
  { indexed: false, name: 'value', type: 'uint256' },
] }];
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
const summary = { checked: 0, successfulReceipts: 0, reverted: 0, unavailable: 0,
  recordedTransferMatches: 0, fullDirectSellerTransfers: 0,
  noRecordedTransfer: 0, noSellerTransfer: 0, outsideCheckoutWindow: 0,
  unverifiableTime: 0 };
let connection;
let stage = 'credential validation';
try {
  const values = dotenv.parse(await fs.readFile(path.resolve(envPath)));
  const url = new URL(values.DATABASE_URL || '');
  if (url.protocol !== 'mysql:' || !url.hostname.toLowerCase().endsWith('.tidbcloud.com') ||
      url.port !== '4000' || !url.username || !url.password || url.search || url.hash) {
    throw new Error('Unexpected TiDB target');
  }
  stage = 'source read';
  connection = await mysql.createConnection({ host: url.hostname, port: 4000,
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: 'test', ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectTimeout: 15000, timezone: 'Z', multipleStatements: false });
  const [identity] = await connection.query('SELECT DATABASE() AS databaseName');
  if (identity[0]?.databaseName !== 'test') throw new Error('Wrong source database');
  const [rows] = await connection.query(`
    SELECT t.transactionHash, t.fromAddress, t.toAddress, t.tokenAddress,
      t.amountAtomic AS recordedAmount, t.chainId,
      p.amountAtomic AS quotedAmount, p.merchantAddress, p.createdAt,
      p.expiresAt, p.platformFeeBps
    FROM paymentTransactions t JOIN paymentIntents p ON p.id = t.paymentIntentId
    ORDER BY t.id`);
  if (rows.length > 1000 || rows.some(row => row.chainId !== chainId ||
      !same(row.tokenAddress, usdc) || !/^0x[0-9a-fA-F]{64}$/.test(row.transactionHash))) {
    throw new Error('Unsupported legacy ledger state');
  }
  stage = 'Arc RPC receipt verification';
  if (await client.getChainId() !== chainId) throw new Error('Wrong RPC chain');
  for (const row of rows) {
    summary.checked++;
    let receipt;
    try { receipt = await client.getTransactionReceipt({ hash: row.transactionHash }); }
    catch { summary.unavailable++; continue; }
    if (receipt.status !== 'success') { summary.reverted++; continue; }
    summary.successfulReceipts++;
    const transfers = receipt.logs.filter(log => same(log.address, usdc)).flatMap(log => {
      try {
        const event = decodeEventLog({ abi: transferAbi, data: log.data, topics: log.topics });
        return event.eventName === 'Transfer' ? [event.args] : [];
      } catch { return []; }
    });
    const recordedMatch = transfers.some(event => same(event.from, row.fromAddress) &&
      same(event.to, row.toAddress) && event.value.toString() === row.recordedAmount);
    const directSellerMatch = transfers.some(event => same(event.from, row.fromAddress) &&
      same(event.to, row.merchantAddress) && event.value.toString() === row.quotedAmount);
    if (recordedMatch) summary.recordedTransferMatches++;
    else summary.noRecordedTransfer++;
    if (directSellerMatch) summary.fullDirectSellerTransfers++;
    else summary.noSellerTransfer++;
    try {
      const block = await client.getBlock({ blockHash: receipt.blockHash });
      const minedAt = Number(block.timestamp) * 1000;
      if (minedAt < new Date(row.createdAt).getTime() - 1000 ||
          minedAt > new Date(row.expiresAt).getTime()) summary.outsideCheckoutWindow++;
    } catch { summary.unverifiableTime++; }
  }
  console.log(JSON.stringify({ network: 'arc-testnet', chainId, summary,
    note: 'Transfer matching does not prove the historical 2% split or wallet ownership.' }));
} catch {
  console.error(JSON.stringify({ audited: false, failedStage: stage }));
  process.exitCode = 1;
} finally {
  if (connection) await connection.end().catch(() => {});
}
