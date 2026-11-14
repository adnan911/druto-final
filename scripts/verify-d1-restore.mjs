// Offline-only verifier: executes trusted Wrangler SQL exports in memory.
// Never pass SQL received from customers or run against a live DB connection.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
// Vitest 2's loader predates node:sqlite; Node itself loads this builtin.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

const quote = value => `"${value.replaceAll('"', '""')}"`;
const encode = value => JSON.stringify(value, (_, item) =>
  typeof item === 'bigint' ? { integer: item.toString() } : item);
const digest = value => createHash('sha256').update(value).digest('hex');
function query(db, sql) {
  const stmt = db.prepare(sql);
  stmt.setReadBigInts(true);
  return stmt.all();
}
function inspect(sql) {
  const db = new DatabaseSync(':memory:', { allowExtension: false });
  try {
    db.exec(sql);
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Integrity check failed');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Foreign key check failed');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all();
    const result = {};
    for (const { name } of tables) {
      const rows = query(db, `SELECT * FROM ${quote(name)}`).map(encode).sort();
      const indexes = db.prepare(`PRAGMA index_list(${quote(name)})`).all().map(index => ({
        name: index.name, unique: index.unique, origin: index.origin, partial: index.partial,
        columns: query(db, `PRAGMA index_xinfo(${quote(index.name)})`),
      })).sort((a, b) => a.name.localeCompare(b.name));
      const schema = {
        columns: query(db, `PRAGMA table_xinfo(${quote(name)})`),
        foreignKeys: query(db, `PRAGMA foreign_key_list(${quote(name)})`), indexes,
        definitions: db.prepare("SELECT type,name,sql FROM sqlite_master WHERE tbl_name=? AND sql IS NOT NULL ORDER BY type,name").all(name)
          .map(row => ({ ...row, sql: row.sql.trim() })),
      };
      result[name] = { count: rows.length, dataDigest: digest(encode(rows)), schemaDigest: digest(encode(schema)) };
    }
    const hasSequence = db.prepare("SELECT 1 FROM sqlite_master WHERE name='sqlite_sequence'").get();
    const sequences = hasSequence ? query(db, 'SELECT * FROM sqlite_sequence ORDER BY name') : [];
    const views = query(db, "SELECT name,sql FROM sqlite_master WHERE type='view' ORDER BY name");
    return { tables: result, metadataDigest: digest(encode({ sequences, views })) };
  } finally { db.close(); }
}

export function verifyD1Restore(sourceSql, restoredSql) {
  const source = inspect(sourceSql), restored = inspect(restoredSql);
  if (encode(source) !== encode(restored)) throw new Error('Restored schema or data differs from source export');
  // Only aggregates leave this function; no row values or per-table digests.
  return { outcome: 'PASS', tableCount: Object.keys(source.tables).length,
    rowCounts: Object.fromEntries(Object.entries(source.tables).map(([name, info]) => [name, info.count])) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) throw new Error('Expected two export paths');
    console.log(JSON.stringify(verifyD1Restore(readFileSync(process.argv[2], 'utf8'), readFileSync(process.argv[3], 'utf8')), null, 2));
  } catch {
    // SQLite parse errors may contain SQL values; keep diagnostics secret-free.
    console.error('Restore verification FAILED. Inspect locally; do not print SQL or row contents.');
    process.exitCode = 1;
  }
}
