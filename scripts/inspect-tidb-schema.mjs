// Read-only check. Never prints connection credentials or raw driver errors.
import fs from 'node:fs';
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
  const [tables] = await connection.execute(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', ['druto_testnet']);
  console.log(JSON.stringify({ connected: true, database: identity[0].databaseName,
    tlsActive: Boolean(tls[0]?.Value), tableCount: tables.length, tables: tables.map(t => t.TABLE_NAME) }));
  const [history] = await connection.query('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at');
  console.log(JSON.stringify({ history }));
  for (const { TABLE_NAME: name } of tables) {
    if (!/^[A-Za-z_]+$/.test(name)) throw new Error('Unexpected table');
    const [count] = await connection.query(`SELECT COUNT(*) AS total FROM \`${name}\``);
    console.log(JSON.stringify({ table: name, rows: Number(count[0].total) }));
  }
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'CONFIGURATION_OR_CONNECTION_ERROR';
  console.error(JSON.stringify({ connected: false, code }));
  process.exitCode = 1;
} finally {
  if (connection) await connection.end();
}
