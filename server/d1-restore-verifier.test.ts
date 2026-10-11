import { describe, expect, it } from 'vitest';
import { verifyD1Restore } from '../scripts/verify-d1-restore.mjs';

const fixture = `CREATE TABLE users(id INTEGER PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE sessions(id TEXT PRIMARY KEY, userId INTEGER REFERENCES users(id));
CREATE INDEX sessions_user ON sessions(userId);
INSERT INTO users VALUES (1,'private-value'),(2,'another');
INSERT INTO sessions VALUES ('private-hash',1);`;

describe('offline D1 restore verifier', () => {
  it('compares full data independently of row insertion order without exposing values', () => {
    const output = verifyD1Restore(fixture, fixture.replace("(1,'private-value'),(2,'another')", "(2,'another'),(1,'private-value')"));
    expect(output).toEqual({ outcome: 'PASS', tableCount: 2, rowCounts: { sessions: 1, users: 2 } });
    expect(JSON.stringify(output)).not.toContain('private');
  });
  it('rejects changed values even when counts match', () => {
    expect(() => verifyD1Restore(fixture, fixture.replace('private-value', 'changed'))).toThrow();
  });
  it('rejects missing indexes and orphaned records', () => {
    expect(() => verifyD1Restore(fixture, fixture.replace('CREATE INDEX sessions_user ON sessions(userId);', ''))).toThrow();
    expect(() => verifyD1Restore(fixture, fixture.replace("'private-hash',1", "'private-hash',999"))).toThrow();
  });
  it('preserves integers beyond JavaScript safe-number precision', () => {
    const large = 'CREATE TABLE amounts(value INTEGER); INSERT INTO amounts VALUES(9007199254740993);';
    expect(verifyD1Restore(large, large).outcome).toBe('PASS');
    expect(() => verifyD1Restore(large, large.replace('9007199254740993', '9007199254740992'))).toThrow();
  });
  it('detects altered autoincrement state even with identical application rows', () => {
    const sql = 'CREATE TABLE ids(id INTEGER PRIMARY KEY AUTOINCREMENT); INSERT INTO ids VALUES(10); DELETE FROM ids;';
    expect(() => verifyD1Restore(sql, sql + "UPDATE sqlite_sequence SET seq=1 WHERE name='ids';")).toThrow();
  });
});
