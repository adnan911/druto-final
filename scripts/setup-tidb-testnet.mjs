// Bootstrap only an EMPTY druto_testnet database. Default mode is read-only verification.
// DDL may commit independently; a partial failure requires inspection, never blind retries.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { fail, verifySchema, recoverEmptyPartialSchema } from './tidb-schema-verification.mjs';

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
  if (identity[0].databaseName !== 'druto_testnet' || !tls[0]?.Value) {
    throw Object.assign(new Error(), { code: 'TARGET_OR_TLS_CHECK_FAILED' });
  }
  const migrationsFolder = fileURLToPath(new URL('../drizzle-tidb', import.meta.url));
  const migrations = readMigrationFiles({ migrationsFolder });
  const snapshot = JSON.parse(fs.readFileSync(new URL('../drizzle-tidb/meta/0000_snapshot.json', import.meta.url), 'utf8'));
  if (process.argv.includes('--recover')) {
    if (process.argv.includes('--apply') || migrations.length !== 1) fail('INVALID_RECOVERY_MODE');
    const legacy = readMigrationFiles({ migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    const [oldHistory] = await connection.query('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at');
    if (oldHistory.length !== 6 || oldHistory.some((row, i) => row.hash !== legacy[i].hash || Number(row.created_at) !== legacy[i].folderMillis)) fail('UNEXPECTED_LEGACY_HISTORY');
    // Only adds missing objects to verified empty tables; no DROP, DELETE or TRUNCATE.
    await recoverEmptyPartialSchema(connection, snapshot, migrations[0]);
    // Adopt a NEW lineage only after verifying the complete baseline schema.
    // The six original history rows remain untouched as a recovery audit trail.
    await connection.query('CREATE TABLE __druto_tidb_migrations (id SERIAL PRIMARY KEY, hash TEXT NOT NULL, created_at BIGINT)');
    await connection.execute('INSERT INTO __druto_tidb_migrations (hash, created_at) VALUES (?, ?)', [migrations[0].hash, migrations[0].folderMillis]);
  }
  if (process.argv.includes('--apply')) {
    if (tables.length !== 0) throw Object.assign(new Error(), { code: 'BOOTSTRAP_REQUIRES_EMPTY_DATABASE' });
    console.log(JSON.stringify({ phase: 'applying', database: 'druto_testnet', migrations: migrations.length }));
    await migrate(drizzle(connection), { migrationsFolder, migrationsTable: '__druto_tidb_migrations' });
  }
  const [history] = await connection.query('SELECT hash, created_at FROM __druto_tidb_migrations ORDER BY created_at');
  if (history.length !== migrations.length || history.some((row, i) => row.hash !== migrations[i].hash || Number(row.created_at) !== migrations[i].folderMillis)) {
    throw Object.assign(new Error(), { code: 'MIGRATION_HISTORY_MISMATCH' });
  }
  const schema = await verifySchema(connection, snapshot);
  console.log(JSON.stringify({ verified: true, database: 'druto_testnet', tlsActive: true,
    migrations: history.length, applicationTables: schema.tables, columns: schema.columns,
    checks: ['migration hashes and timestamps', 'columns, types, nullability, defaults and generated expression', 'primary and unique indexes'] }));
} catch (error) {
  const candidate = error?.cause?.code || error?.code;
  const code = typeof candidate === 'string' && /^[A-Z0-9_]+$/.test(candidate) ? candidate : 'CONFIGURATION_OR_CONNECTION_ERROR';
  console.error(JSON.stringify({ connected: false, code }));
  process.exitCode = 1;
} finally {
  if (connection) await connection.end();
}
