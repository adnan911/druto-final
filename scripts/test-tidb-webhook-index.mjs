// Database integration test: synthetic records only; always rolls back.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

let connection;
try {
  const values = dotenv.parse(fs.readFileSync(new URL('../.env.tidb.local', import.meta.url)));
  const url = new URL(values.DATABASE_URL || '');
  if (url.protocol !== 'mysql:' || url.pathname !== '/druto_testnet' || !url.hostname.endsWith('.tidbcloud.com')) {
    throw Object.assign(new Error(), { code: 'UNEXPECTED_DATABASE_TARGET' });
  }
  if (!url.username || !url.password || /<|>/.test(decodeURIComponent(url.password))) {
    throw Object.assign(new Error(), { code: 'MISSING_OR_PLACEHOLDER_CREDENTIALS' });
  }
  connection = await mysql.createConnection({
    host: url.hostname, port: Number(url.port || 4000),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: 'druto_testnet', ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectTimeout: 15000, multipleStatements: false,
  });
  const [identity] = await connection.query('SELECT DATABASE() AS databaseName');
  const [tls] = await connection.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  assert.equal(identity[0].databaseName, 'druto_testnet');
  assert.ok(tls[0]?.Value);
  await connection.beginTransaction();
  const marker = randomUUID().replaceAll('-', '').slice(0, 16);
  const webhookUrl = 'https://example.invalid/webhook/' + 'a'.repeat(2016);
  assert.ok(webhookUrl.length <= 2048 && webhookUrl.length > 2000);
  const insert = (id, marketplace, target) => connection.execute(
    'INSERT INTO webhookEndpoints (id, marketplaceId, ownerUserId, url, secretCiphertext) VALUES (?, ?, ?, ?, ?)',
    [id, marketplace, -1, target, 'integration-test-only']);
  await insert(`${marker}a`, `${marker}marketA`, webhookUrl);
  const [rows] = await connection.execute('SELECT url, urlHash FROM webhookEndpoints WHERE id = ?', [`${marker}a`]);
  assert.equal(rows[0].url, webhookUrl);
  assert.equal(rows[0].urlHash, createHash('sha256').update(webhookUrl).digest('hex'));
  await assert.rejects(insert(`${marker}b`, `${marker}marketA`, webhookUrl), { code: 'ER_DUP_ENTRY' });
  await insert(`${marker}c`, `${marker}marketB`, webhookUrl);
  await insert(`${marker}d`, `${marker}marketA`, webhookUrl.slice(0, -1) + 'b');
  await assert.rejects(connection.execute('UPDATE webhookEndpoints SET url = ? WHERE id = ?', [webhookUrl, `${marker}d`]), { code: 'ER_DUP_ENTRY' });
  await connection.rollback();
  const [remaining] = await connection.execute('SELECT COUNT(*) AS total FROM webhookEndpoints WHERE id IN (?, ?, ?, ?)', ['a', 'b', 'c', 'd'].map(suffix => marker + suffix));
  assert.equal(Number(remaining[0].total), 0);
  console.log(JSON.stringify({ passed: true, tests: ['long URL preserved', 'database-generated SHA256', 'same-market duplicate rejected', 'other-market URL allowed', 'different long URL allowed', 'URL update uniqueness enforced', 'rollback verified'] }));
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'CONFIGURATION_OR_CONNECTION_ERROR';
  console.error(JSON.stringify({ connected: false, code }));
  process.exitCode = 1;
} finally {
  if (connection) { await connection.rollback(); await connection.end(); }
}
