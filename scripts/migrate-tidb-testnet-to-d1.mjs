// One-time, guarded Testnet-only import. Never prints row contents or credentials.
// Default mode is read-only. --apply writes only to an empty, named D1 database.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { columns, fingerprint, insertSql, normalizeRow, tableOrder } from './d1-testnet-import-core.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const wrangler = path.join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const targetName = 'druto-d1-testnet';
const targetId = 'd1f68dd0-c984-4b56-8167-d4ae0ee70ca2';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const envIndex = args.indexOf('--source-env');
const allowedCount = (apply ? 1 : 0) + (envIndex >= 0 ? 2 : 0);
if (envIndex < 0 || !args[envIndex + 1] || args.length !== allowedCount) {
  console.error('Usage: node scripts/migrate-tidb-testnet-to-d1.mjs --source-env <local ignored env file> [--apply]');
  process.exit(2);
}

function runWrangler(operation, argv) {
  const result = spawnSync(process.execPath, [wrangler, ...argv], {
    cwd: repoRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
  if (result.error || result.status !== 0) throw new Error(`${operation} failed`);
  return result.stdout.trim();
}

function d1Rows(query) {
  const output = runWrangler('D1 read', ['d1', 'execute', targetName, '--remote', '--command', query, '--json']);
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0].success || !Array.isArray(parsed[0].results)) {
    throw new Error('Unexpected D1 response');
  }
  return parsed[0].results;
}

async function sourceRows(connection) {
  const result = {};
  for (const table of tableOrder) {
    const names = columns[table].filter(column => !(table === 'webhookEndpoints' && column === 'urlHash'));
    const query = `SELECT ${names.map(name => `\`${name}\``).join(',')} FROM \`${table}\` ORDER BY \`id\``;
    const [rows] = await connection.query(query);
    result[table] = rows.map(row => normalizeRow(table, row));
  }
  return result;
}

function safeManifest(rows) {
  return Object.fromEntries(tableOrder.map(table => [table, {
    count: rows[table].length,
    sha256: fingerprint(table, rows[table]),
  }]));
}

function assertRelationships(rows) {
  if (rows.users.length === 0 || rows.merchantAccounts.length === 0) throw new Error('Expected Testnet identities are absent');
  if (rows.paymentIntents.length || rows.paymentTransactions.length) {
    throw new Error('Payment history requires a separate reviewed migration');
  }
  if (rows.webhookEndpoints.length || rows.webhookDeliveries.length) {
    throw new Error('Webhook secrets and deliveries require a separate reviewed migration');
  }
  const userIds = new Set(rows.users.map(row => row.id));
  const merchants = new Map(rows.merchantAccounts.map(row => [row.id, row]));
  for (const row of rows.merchantAccounts) {
    if (row.ownerUserId !== null && !userIds.has(row.ownerUserId)) throw new Error('Seller owner link is broken');
    if (!/^0x[0-9a-fA-F]{40}$/.test(row.receivingAddress)) throw new Error('Seller receiving address is invalid');
    if (row.status === 'active' && (row.ownerUserId === null || row.walletVerifiedAt === null)) {
      throw new Error('Active seller ownership evidence is incomplete');
    }
  }
  for (const row of rows.ownershipChallenges) {
    const merchant = merchants.get(row.merchantAccountId);
    if (!merchant || merchant.marketplaceId !== row.marketplaceId || merchant.externalSellerId !== row.sellerId ||
        merchant.receivingAddress.toLowerCase() !== row.walletAddress.toLowerCase()) {
      throw new Error('Seller ownership challenge does not match account');
    }
  }
}

function assertSame(expected, actual, label) {
  for (const table of tableOrder) {
    if (expected[table].count !== actual[table].count || expected[table].sha256 !== actual[table].sha256) {
      throw new Error(`${label} reconciliation mismatch in ${table}`);
    }
  }
}

let connection;
let tempDir;
let stage = 'initialization';
try {
  stage = 'source credential validation';
  const envPath = path.resolve(repoRoot, args[envIndex + 1]);
  const values = dotenv.parse(await fs.readFile(envPath));
  const url = new URL(values.DATABASE_URL || '');
  if (url.protocol !== 'mysql:' || url.pathname !== '/druto_testnet' || url.port !== '4000' ||
      !url.hostname.toLowerCase().endsWith('.tidbcloud.com') || !decodeURIComponent(url.username).endsWith('.druto_app') ||
      !url.password || url.search || url.hash) throw new Error('Unexpected source identity');

  stage = 'source connection';
  connection = await mysql.createConnection({
    host: url.hostname, port: 4000, user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password), database: 'druto_testnet',
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectTimeout: 15000, timezone: 'Z', dateStrings: true, multipleStatements: false,
  });
  await connection.query("SET time_zone = '+00:00'");
  const [identity] = await connection.query('SELECT DATABASE() AS databaseName, CURRENT_USER() AS currentUser');
  if (identity[0]?.databaseName !== 'druto_testnet' ||
      !String(identity[0]?.currentUser || '').split('@')[0].endsWith('.druto_app')) {
    throw new Error('Unexpected source identity');
  }

  stage = 'source inventory';
  const rows = await sourceRows(connection);
  assertRelationships(rows);
  const manifest = safeManifest(rows);
  const rowCounts = Object.fromEntries(tableOrder.map(table => [table, manifest[table].count]));
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', target: targetName, source: 'druto_testnet', rowCounts }));

  if (apply) {
    stage = 'target identity';
    const list = JSON.parse(runWrangler('D1 list', ['d1', 'list', '--json']));
    if (!Array.isArray(list) || !list.some(db => db.name === targetName && db.uuid === targetId)) {
      throw new Error('Unexpected D1 target identity');
    }
    stage = 'target emptiness';
    const countQuery = `SELECT ${tableOrder.map(table => `(SELECT COUNT(*) FROM \`${table}\`) AS \`${table}\``).join(',')}`;
    const counts = d1Rows(countQuery)[0];
    if (!counts || tableOrder.some(table => Number(counts[table]) !== 0)) throw new Error('D1 target is not empty');

    stage = 'source drift check';
    assertSame(manifest, safeManifest(await sourceRows(connection)), 'source');

    stage = 'D1 import';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'druto-d1-import-'));
    const sqlPath = path.join(tempDir, 'import.sql');
    const sql = tableOrder.flatMap(table => rows[table].map(row => insertSql(table, row))).join('\n') + '\n';
    await fs.writeFile(sqlPath, sql, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    runWrangler('D1 import', ['d1', 'execute', targetName, '--remote', '--file', sqlPath, '--yes']);

    stage = 'D1 reconciliation';
    const imported = {};
    for (const table of tableOrder) {
      const names = columns[table].map(name => `\`${name}\``).join(',');
      imported[table] = d1Rows(`SELECT ${names} FROM \`${table}\` ORDER BY \`id\``).map(row => normalizeRow(table, row));
    }
    assertSame(manifest, safeManifest(imported), 'D1');
    stage = 'post-import source drift check';
    assertSame(manifest, safeManifest(await sourceRows(connection)), 'source');
    console.log(JSON.stringify({ imported: true, reconciled: true, target: targetName, rowCounts }));
  }
} catch {
  console.error(JSON.stringify({ imported: false, failedStage: stage, message: 'Stopped safely; inspect local setup and retry after resolving this stage.' }));
  process.exitCode = 1;
} finally {
  if (connection) await connection.end().catch(() => {});
  if (tempDir) {
    try { await fs.rm(tempDir, { recursive: true, force: true }); }
    catch {
      console.error('Sensitive temporary import file cleanup failed; remove it before continuing.');
      process.exitCode = 1;
    }
  }
}
