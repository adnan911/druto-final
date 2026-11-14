export function fail(code) { throw Object.assign(new Error(code), { code }); }
const normalizeType = value => value.toLowerCase().replace(/\bint\(\d+\)/g, 'int');
const normalizeDefault = value => value == null ? null : String(value).replace(/^'(.*)'$/, '$1').replace(/\(now\(\)\)|current_timestamp\(\)/gi, 'CURRENT_TIMESTAMP');

export async function verifySchema(connection, snapshot, partial = false) {
  const [columns] = await connection.execute('SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, GENERATION_EXPRESSION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?', ['druto_testnet']);
  const [indexes] = await connection.execute('SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX, SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX', ['druto_testnet']);
  const metadata = new Set(['__drizzle_migrations', '__druto_tidb_migrations']);
  for (const row of columns.filter(c => !metadata.has(c.TABLE_NAME))) {
    const expected = snapshot.tables[row.TABLE_NAME]?.columns[row.COLUMN_NAME];
    if (!expected || normalizeType(row.COLUMN_TYPE) !== normalizeType(expected.type) || (row.IS_NULLABLE === 'NO') !== expected.notNull || normalizeDefault(row.COLUMN_DEFAULT) !== normalizeDefault(expected.default)) fail('COLUMN_DEFINITION_MISMATCH');
    if (Boolean(expected.autoincrement) !== row.EXTRA.toLowerCase().includes('auto_increment') || Boolean(expected.onUpdate) !== row.EXTRA.toLowerCase().includes('on update')) fail('COLUMN_EXTRA_MISMATCH');
    if (expected.generated && row.GENERATION_EXPRESSION.replace(/[`\s]/g, '').toLowerCase() !== expected.generated.as.replace(/[`\s]/g, '').toLowerCase()) fail('GENERATED_EXPRESSION_MISMATCH');
  }
  const tableNames = new Set(columns.map(c => c.TABLE_NAME));
  for (const table of Object.values(snapshot.tables)) {
    if (partial && !tableNames.has(table.name)) continue;
    if (!partial && Object.keys(table.columns).length !== columns.filter(c => c.TABLE_NAME === table.name).length) fail('COLUMN_COUNT_MISMATCH');
    const expectedIndexes = [
      ...Object.values(table.compositePrimaryKeys).map(i => ({ ...i, name: 'PRIMARY', isUnique: true })),
      ...Object.values(table.uniqueConstraints).map(i => ({ ...i, isUnique: true })),
      ...Object.values(table.indexes),
    ];
    const actual = indexes.filter(i => i.TABLE_NAME === table.name);
    if (new Set(actual.map(i => i.INDEX_NAME)).size !== expectedIndexes.length) fail('INDEX_COUNT_MISMATCH');
    for (const expected of expectedIndexes) {
      const rows = actual.filter(i => i.INDEX_NAME === expected.name);
      if (JSON.stringify(rows.map(i => i.COLUMN_NAME)) !== JSON.stringify(expected.columns) || rows.some(i => Boolean(Number(i.NON_UNIQUE)) === expected.isUnique || i.SUB_PART != null)) {
        console.log(JSON.stringify({ schemaMismatch: { table: table.name, index: expected.name, expectedColumns: expected.columns, actual: rows } }));
        fail('INDEX_DEFINITION_MISMATCH');
      }
    }
  }
  return { tables: Object.keys(snapshot.tables).length, columns: columns.filter(c => !metadata.has(c.TABLE_NAME)).length };
}

export async function recoverEmptyPartialSchema(connection, snapshot, baseline) {
  await verifySchema(connection, snapshot, true);
  const [tables] = await connection.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', ['druto_testnet']);
  for (const { TABLE_NAME: table } of tables) {
    if (table === '__drizzle_migrations') continue;
    if (!snapshot.tables[table]) fail('UNEXPECTED_RECOVERY_TABLE');
    const [rows] = await connection.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
    if (Number(rows[0].total) !== 0) fail('RECOVERY_REQUIRES_EMPTY_TABLES');
  }
  const [columns] = await connection.execute('SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?', ['druto_testnet']);
  for (const statement of baseline.sql) {
    if (!statement.trim()) continue;
    const table = statement.match(/^\s*CREATE TABLE `([A-Za-z]+)`/)[1];
    if (!snapshot.tables[table]) fail('UNEXPECTED_BASELINE_STATEMENT');
    if (!tables.some(t => t.TABLE_NAME === table)) {
      await connection.query(statement);
    } else {
      for (const match of statement.matchAll(/^\s*`([A-Za-z]+)` (.+?)(?:,)?\r?$/gm)) {
        if (columns.some(c => c.TABLE_NAME === table && c.COLUMN_NAME === match[1])) continue;
        await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${match[1]}\` ${match[2].replace(/,$/, '')}`);
      }
    }
  }
  await verifySchema(connection, snapshot);
}
