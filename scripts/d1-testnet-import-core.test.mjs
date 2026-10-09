import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, insertSql, normalizeRow } from './d1-testnet-import-core.mjs';

test('preserves UTC timestamps and escapes data in import SQL', () => {
  const row = { id: 7, openId: "wallet:0x'abc", name: "O'Reilly", email: null, profileImage: null, loginMethod: 'wallet', role: 'user', createdAt: '2026-10-08 12:30:00', updatedAt: '2026-10-08T12:30:01Z', lastSignedIn: new Date('2026-10-08T12:30:02Z') };
  const converted = normalizeRow('users', row);
  assert.equal(converted.createdAt, Date.parse('2026-10-08T12:30:00Z'));
  assert.match(insertSql('users', row), /'O''Reilly'/);
  assert.match(insertSql('users', row), /'wallet:0x''abc'/);
  assert.equal(fingerprint('users', [row]), fingerprint('users', [{ ...row, ...converted }]));
});

test('rejects ambiguous timestamps, missing columns and NUL', () => {
  const row = { id: 1, openId: 'a', name: null, email: null, profileImage: null, loginMethod: null, role: 'user', createdAt: '2026-10-08', updatedAt: '2026-10-08T12:30:01Z', lastSignedIn: '2026-10-08T12:30:01Z' };
  assert.throws(() => normalizeRow('users', row), /UTC/);
  assert.throws(() => normalizeRow('users', { ...row, createdAt: '2026-10-08T12:30:01Z', openId: 'a\0b' }), /NUL/);
  assert.throws(() => normalizeRow('users', { ...row, createdAt: '2026-10-08T12:30:01Z', openId: undefined }), /Missing/);
});

test('retains string merchant ID and owner relationship', () => {
  const row = { id: 'ma_1p46Apa-Kpt2', marketplaceId: 'luvre-franc', externalSellerId: 'luvre-seller-1', ownerUserId: 2, displayName: 'Luvre Franc', receivingAddress: '0x49b1C6BE866396d6732a16A48D39e9fc305eF4fB', status: 'active', walletVerifiedAt: '2026-10-08 12:30:00', createdAt: '2026-10-08 12:00:00', updatedAt: '2026-10-08 12:30:00' };
  const converted = normalizeRow('merchantAccounts', row);
  assert.equal(converted.id, 'ma_1p46Apa-Kpt2');
  assert.equal(converted.ownerUserId, 2);
  assert.match(insertSql('merchantAccounts', row), /ma_1p46Apa-Kpt2/);
});
