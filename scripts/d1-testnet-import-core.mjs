import { createHash } from 'node:crypto';

// Explicit column lists keep MySQL-only generated columns out of the D1 import.
export const columns = Object.freeze({
  users: ['id', 'openId', 'name', 'email', 'profileImage', 'loginMethod', 'role', 'createdAt', 'updatedAt', 'lastSignedIn'],
  apiKeys: ['id', 'ownerUserId', 'name', 'prefix', 'lastFour', 'merchantAccountId', 'marketplaceId', 'sellerId', 'sellerDisplayName', 'secretHash', 'createdAt', 'lastUsedAt', 'revokedAt'],
  walletLoginChallenges: ['id', 'walletAddress', 'message', 'nonceHash', 'expiresAt', 'usedAt', 'createdAt'],
  merchantAccounts: ['id', 'marketplaceId', 'externalSellerId', 'ownerUserId', 'displayName', 'receivingAddress', 'status', 'walletVerifiedAt', 'createdAt', 'updatedAt'],
  ownershipChallenges: ['id', 'merchantAccountId', 'marketplaceId', 'sellerId', 'walletAddress', 'message', 'nonceHash', 'expiresAt', 'usedAt', 'createdAt'],
  webhookEndpoints: ['id', 'marketplaceId', 'merchantAccountId', 'ownerUserId', 'url', 'urlHash', 'secretCiphertext', 'active', 'createdAt', 'updatedAt'],
  webhookDeliveries: ['id', 'endpointId', 'eventId', 'eventType', 'paymentIntentId', 'payload', 'signature', 'status', 'attempts', 'nextAttemptAt', 'lastError', 'deliveredAt', 'createdAt', 'updatedAt'],
  paymentIntents: ['id', 'externalOrderId', 'marketplaceId', 'sellerId', 'merchantAccountId', 'idempotencyKey', 'itemName', 'buyerLabel', 'returnUrl', 'orderContext', 'amountAtomic', 'platformFeeBps', 'platformFeeAmount', 'merchantPayoutAmount', 'splitContractAddress', 'asset', 'network', 'merchantAddress', 'buyerAddress', 'status', 'transactionHash', 'expiresAt', 'createdAt', 'updatedAt'],
  paymentTransactions: ['id', 'paymentIntentId', 'transactionHash', 'fromAddress', 'toAddress', 'treasuryAddress', 'tokenAddress', 'amountAtomic', 'platformFeeAmount', 'merchantPayoutAmount', 'chainId', 'finalizedAt', 'createdAt'],
});

export const tableOrder = Object.freeze(Object.keys(columns));
const timestampColumns = new Set(['createdAt', 'updatedAt', 'lastSignedIn', 'lastUsedAt', 'revokedAt', 'expiresAt', 'usedAt', 'walletVerifiedAt', 'nextAttemptAt', 'deliveredAt', 'finalizedAt']);
const integerColumns = new Set(['ownerUserId', 'active', 'attempts', 'platformFeeBps', 'chainId']);

function timestampMs(value) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('Invalid timestamp');
    return value.getTime();
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value !== 'string') throw new Error('Unexpected timestamp type');
  // The source connection is explicitly set to UTC before reading. Never guess a local timezone.
  const normalized = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d{1,6})?$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(normalized)) {
    throw new Error('Timestamp must be explicitly UTC');
  }
  const ms = Date.parse(normalized);
  if (!Number.isSafeInteger(ms)) throw new Error('Invalid timestamp');
  return ms;
}

export function normalizeRow(table, source) {
  if (!Object.hasOwn(columns, table) || !source || typeof source !== 'object') throw new Error('Unexpected table or row');
  const normalized = {};
  for (const column of columns[table]) {
    let value = source[column];
    if (table === 'webhookEndpoints' && column === 'urlHash') {
      if (typeof source.url !== 'string') throw new Error('Missing webhook URL');
      value = createHash('sha256').update(source.url).digest('hex');
    }
    if (value === undefined) throw new Error(`Missing ${table}.${column}`);
    if (value !== null && timestampColumns.has(column)) value = timestampMs(value);
    if (value !== null && (integerColumns.has(column) || (column === 'id' && (table === 'users' || table === 'paymentTransactions'))) && typeof value !== 'number') {
      if (!/^-?\d+$/.test(String(value))) throw new Error(`Invalid integer ${table}.${column}`);
      value = Number(value);
    }
    if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error(`Unsafe integer ${table}.${column}`);
    if (typeof value === 'string' && value.includes('\0')) throw new Error('NUL is not supported');
    normalized[column] = value;
  }
  return normalized;
}

export function fingerprint(table, rows) {
  const ordered = rows.map(row => normalizeRow(table, row)).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}

function sqlLiteral(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  if (typeof value !== 'string') throw new Error('Unexpected SQL value');
  return `'${value.replaceAll("'", "''")}'`;
}

export function insertSql(table, source) {
  const row = normalizeRow(table, source);
  const names = columns[table].map(name => `\`${name}\``).join(',');
  const values = columns[table].map(name => sqlLiteral(row[name])).join(',');
  return `INSERT INTO \`${table}\` (${names}) VALUES (${values});`;
}
