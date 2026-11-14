// Creates only a fresh, scoped application identity. Never prints credentials/raw errors.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const tables = ['apiKeys', 'merchantAccounts', 'ownershipChallenges', 'paymentIntents', 'paymentTransactions', 'users', 'walletLoginChallenges', 'webhookDeliveries', 'webhookEndpoints'];
const secretFile = new URL('../.env.tidb-app.local', import.meta.url);
let admin, app, phase = 'configuration';
function connectionOptions(url) {
  if (url.protocol !== 'mysql:' || url.pathname !== '/druto_testnet' || !url.hostname.endsWith('.tidbcloud.com')) throw new Error('Invalid target');
  return { host: url.hostname, port: Number(url.port || 4000), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: 'druto_testnet', ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }, connectTimeout: 15000, multipleStatements: false };
}
async function denied(sql) {
  await assert.rejects(app.query(sql), error => ['ER_TABLEACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR', 'ER_SPECIFIC_ACCESS_DENIED_ERROR'].includes(error.code));
}
try {
  let appUrl;
  if (process.argv.includes('--verify')) {
    appUrl = new URL(dotenv.parse(fs.readFileSync(secretFile)).DATABASE_URL);
    assert.ok(decodeURIComponent(appUrl.username).endsWith('.druto_app'));
  } else {
  if (fs.existsSync(secretFile)) throw Object.assign(new Error(), { code: 'APP_SECRET_ALREADY_EXISTS' });
  const rootUrl = new URL(dotenv.parse(fs.readFileSync(new URL('../.env.tidb.local', import.meta.url))).DATABASE_URL);
  const options = connectionOptions(rootUrl);
  const prefix = options.user.match(/^([A-Za-z0-9]+)\.root$/)?.[1];
  if (!prefix) throw Object.assign(new Error(), { code: 'UNEXPECTED_ADMIN_USERNAME' });
  const username = `${prefix}.druto_app`;
  const password = randomBytes(32).toString('base64url');
  phase = 'admin-connect';
  admin = await mysql.createConnection(options);
  const [identity] = await admin.query('SELECT DATABASE() AS db');
  assert.equal(identity[0].db, 'druto_testnet');
  const [existing] = await admin.execute('SELECT User FROM mysql.user WHERE User = ?', [username]);
  if (existing.length) throw Object.assign(new Error(), { code: 'APP_USER_ALREADY_EXISTS' });
  appUrl = new URL(rootUrl);
  appUrl.username = username;
  appUrl.password = password;
  // Persist before remote creation so failures never strand an unknown password.
  fs.writeFileSync(secretFile, `DATABASE_URL="${appUrl.href}"\n`, { flag: 'wx', mode: 0o600 });
  phase = 'create-user';
  const account = `${mysql.escape(username)}@'%'`;
  await admin.query(`CREATE USER ${account} IDENTIFIED BY ${mysql.escape(password)} REQUIRE SSL`);
  phase = 'grant-table-access';
  for (const table of tables) await admin.query(`GRANT SELECT, INSERT, UPDATE ON \`druto_testnet\`.\`${table}\` TO ${account}`);
  }
  phase = 'verify-app-access';
  app = await mysql.createConnection(connectionOptions(appUrl));
  const [tls] = await app.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  assert.ok(tls[0]?.Value);
  const [grants] = await app.query('SHOW GRANTS');
  const statements = grants.map(row => Object.values(row)[0]);
  const actualTables = [];
  for (const grant of statements) {
    if (/^GRANT USAGE ON \*\.\* TO /.test(grant)) continue;
    const match = grant.match(/^GRANT (.+?) ON `druto_testnet`\.`([A-Za-z]+)` TO /);
    assert.ok(match, 'Unexpected grant');
    assert.deepEqual(match[1].split(',').map(p => p.trim()).sort(), ['INSERT', 'SELECT', 'UPDATE']);
    assert.ok(!grant.includes('WITH GRANT OPTION'));
    actualTables.push(match[2]);
  }
  assert.deepEqual(actualTables.sort(), [...tables].sort());
  for (const table of tables) await app.query(`SELECT 1 FROM \`${table}\` LIMIT 0`);
  await denied('SELECT 1 FROM test.users LIMIT 0');
  await denied('SELECT 1 FROM __druto_tidb_migrations LIMIT 0');
  await denied('SELECT 1 FROM __drizzle_migrations LIMIT 0');
  await denied('DELETE FROM users WHERE 1 = 0');
  phase = 'rollback-write-test';
  await app.beginTransaction();
  const marker = `dbcheck-${randomBytes(10).toString('hex')}`;
  await app.execute('INSERT INTO users (openId, name, loginMethod) VALUES (?, ?, ?)', [marker, 'Database permission test', 'test']);
  await app.execute('UPDATE users SET name = ? WHERE openId = ?', ['Updated permission test', marker]);
  const [rows] = await app.execute('SELECT name, role FROM users WHERE openId = ?', [marker]);
  assert.equal(rows[0].name, 'Updated permission test');
  assert.equal(rows[0].role, 'user');
  await app.rollback();
  const [remaining] = await app.execute('SELECT COUNT(*) AS total FROM users WHERE openId = ?', [marker]);
  assert.equal(Number(remaining[0].total), 0);
  console.log(JSON.stringify({ success: true, database: 'druto_testnet', applicationTables: tables.length, permissions: ['SELECT', 'INSERT', 'UPDATE'], tls: true, oldDatabaseDenied: true, migrationLedgersDenied: true, deleteDenied: true, extraPrivilegesAbsent: true, writeTestRolledBack: true, credentialsFile: '.env.tidb-app.local' }));
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'CONFIGURATION_OR_VERIFICATION_FAILED';
  console.error(JSON.stringify({ success: false, phase, code, credentialsFileExists: fs.existsSync(secretFile) }));
  process.exitCode = 1;
} finally {
  if (app) { await app.rollback(); await app.end(); }
  if (admin) await admin.end();
}
