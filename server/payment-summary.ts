export function summarizeVerifiedRows(rows: Array<{ amountAtomic: string }>) {
  const totalAtomic = rows.reduce((sum, row) => sum + BigInt(row.amountAtomic), BigInt(0));
  return { totalAtomic, count: rows.length };
}
