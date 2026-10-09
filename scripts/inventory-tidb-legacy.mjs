// Read-only inventory of the separate TiDB `test` database.
// Never prints credentials, row contents, or raw driver errors.
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const envPath = process.argv[2];
if (!envPath || process.argv.length !== 3) {
  console.error('Usage: node scripts/inventory-tidb-legacy.mjs <ignored local TiDB env file>');
  process.exit(2);
}

const tables = ['users', 'apiKeys', 'walletLoginChallenges', 'merchantAccounts',
  'ownershipChallenges', 'paymentIntents', 'paymentTransactions',
  'webhookEndpoints', 'webhookDeliveries'];
let connection;
let stage = 'credential validation';
try {
  const values = dotenv.parse(await fs.readFile(path.resolve(envPath)));
  const url = new URL(values.DATABASE_URL || '');
  if (url.protocol !== 'mysql:' || !url.hostname.toLowerCase().endsWith('.tidbcloud.com') ||
      url.port !== '4000' || !url.username || !url.password || url.search || url.hash) {
    throw new Error('Unexpected TiDB target');
  }
  stage = 'read-only legacy connection';
  connection = await mysql.createConnection({
    host: url.hostname, port: 4000, user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password), database: 'test',
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectTimeout: 15000, timezone: 'Z', multipleStatements: false,
  });
  const [identity] = await connection.query('SELECT DATABASE() AS databaseName');
  if (identity[0]?.databaseName !== 'test') throw new Error('Unexpected database');
  stage = 'read-only inventory';
  const [present] = await connection.execute(
    `SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'test' AND TABLE_NAME IN (${tables.map(() => '?').join(',')})`,
    tables,
  );
  const presentNames = new Set(present.map(row => row.tableName));
  const counts = {};
  for (const table of tables) {
    if (!presentNames.has(table)) { counts[table] = null; continue; }
    const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
    counts[table] = Number(rows[0].count);
  }
  const [paymentStates] = await connection.query(
    'SELECT network, asset, status, COALESCE(platformFeeBps, -1) AS feeBps, COUNT(*) AS count FROM paymentIntents GROUP BY network, asset, status, COALESCE(platformFeeBps, -1) ORDER BY network, asset, status, feeBps');
  const [chainCounts] = await connection.query(
    'SELECT chainId, COUNT(*) AS count FROM paymentTransactions GROUP BY chainId ORDER BY chainId');
  const [ledger] = await connection.query(`
    SELECT
      (SELECT COUNT(*) FROM paymentTransactions t LEFT JOIN paymentIntents p ON p.id = t.paymentIntentId WHERE p.id IS NULL) AS orphanTransactions,
      (SELECT COUNT(*) FROM paymentIntents p LEFT JOIN paymentTransactions t ON t.paymentIntentId = p.id WHERE p.status = 'succeeded' AND t.id IS NULL) AS succeededWithoutTransaction,
      (SELECT COUNT(*) FROM paymentTransactions t JOIN paymentIntents p ON p.id = t.paymentIntentId WHERE p.status <> 'succeeded') AS transactionWithoutSucceededIntent,
      (SELECT COUNT(*) FROM merchantAccounts WHERE ownerUserId IS NULL) AS unownedSellers,
      (SELECT COUNT(*) FROM merchantAccounts WHERE status = 'active' AND walletVerifiedAt IS NULL) AS activeUnverifiedSellers,
      (SELECT COUNT(*) FROM apiKeys WHERE revokedAt IS NULL) AS activeApiKeys,
      (SELECT COUNT(*) FROM webhookEndpoints WHERE active = 1) AS activeWebhookEndpoints,
      (SELECT COUNT(*) FROM paymentTransactions t JOIN paymentIntents p ON p.id = t.paymentIntentId WHERE t.amountAtomic <> p.amountAtomic) AS amountMismatches,
      (SELECT COUNT(*) FROM paymentTransactions t JOIN paymentIntents p ON p.id = t.paymentIntentId WHERE LOWER(t.toAddress) <> LOWER(p.merchantAddress)) AS recipientMismatches,
      (SELECT COUNT(*) FROM paymentTransactions t JOIN paymentIntents p ON p.id = t.paymentIntentId WHERE LOWER(t.toAddress) = LOWER(p.splitContractAddress)) AS recipientMatchesSplitContract,
      (SELECT COUNT(*) FROM paymentTransactions WHERE LOWER(tokenAddress) <> '0x3600000000000000000000000000000000000000') AS tokenMismatches,
      (SELECT COUNT(*) FROM paymentTransactions WHERE platformFeeAmount = '0') AS recordedZeroFee,
      (SELECT COUNT(*) FROM paymentTransactions WHERE platformFeeAmount IS NULL) AS recordedNullFee,
      (SELECT COUNT(*) FROM paymentTransactions t JOIN paymentIntents p ON p.id = t.paymentIntentId
        WHERE t.platformFeeAmount IS NULL OR
          CAST(t.platformFeeAmount AS DECIMAL(65,0)) <> FLOOR(CAST(p.amountAtomic AS DECIMAL(65,0)) * p.platformFeeBps / 10000)) AS feeQuoteMismatches
  `);
  const aggregate = Object.fromEntries(Object.entries(ledger[0]).map(([key, value]) => [key, Number(value)]));
  console.log(JSON.stringify({ database: 'test', tables: counts,
    paymentStates: paymentStates.map(row => ({ network: row.network, asset: row.asset, status: row.status, feeBps: Number(row.feeBps), count: Number(row.count) })),
    transactionChains: chainCounts.map(row => ({ chainId: Number(row.chainId), count: Number(row.count) })),
    aggregate }));
} catch {
  console.error(JSON.stringify({ inventoried: false, failedStage: stage }));
  process.exitCode = 1;
} finally {
  if (connection) await connection.end().catch(() => {});
}
