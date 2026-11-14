import { auditPaymentRows, drutoSql, type Database, type DrutoPayment, type ReconciliationReport } from './audit';

export type CheckpointEnv = { DRUTO_D1: Database };
const checkpointId = 'arc-testnet-v1';
export const RECONCILIATION_BATCH_SIZE = 10;
export const RECONCILIATION_LEASE_MS = 120_000;
type Phase = 'intents' | 'transactions' | 'complete';
type Checkpoint = {
  id: string; cycleId: string; phase: Phase; cutoff: number;
  intentUpper: string; transactionUpper: number; expectedIntents: number; expectedTransactions: number;
  intentCursor: string; transactionCursor: number; report: string;
  leaseToken: string | null; leaseUntil: number; startedAt: number; completedAt: number | null;
};
type Totals = ReconciliationReport & { transactionsChecked: number };
export type BatchReport = Omit<Totals, 'status'> & {
  status: ReconciliationReport['status'] | 'IN_PROGRESS' | 'SKIPPED';
  cycleId: string; cycleComplete: boolean; phase: Phase;
  cutoff: number; startedAt: number; completedAt: number | null;
};
const counters = ['drutoSucceeded','undeliveredWebhooks','unsettledTransactions','webhookCoverageGaps',
  'exhaustedWebhooks','pagesChecked','withinGrace','transactionsChecked'] as const;
function empty(now: number): Totals {
  return { status:'INCOMPLETE', checkedAt:new Date(now).toISOString(), drutoSucceeded:0,
    undeliveredWebhooks:0, unsettledTransactions:0, webhookCoverageGaps:0, exhaustedWebhooks:0,
    pagesChecked:0, rpcProvider:'none', rpcFallbackAttempted:false, withinGrace:0,
    exceptionCodes:[], transactionsChecked:0 };
}
const result = (totals: Totals, state: Checkpoint | undefined, status: BatchReport['status']): BatchReport => ({
  ...totals, status, cycleId:state?.cycleId ?? '', phase:state?.phase ?? 'complete',
  cycleComplete:state?.phase === 'complete', cutoff:state?.cutoff ?? 0,
  startedAt:state?.startedAt ?? 0, completedAt:state?.completedAt ?? null,
});
function readTotals(state: Checkpoint): Totals {
  if (state.report.length > 10000 || !['intents','transactions'].includes(state.phase) ||
      !Number.isSafeInteger(state.cutoff) || !Number.isSafeInteger(state.transactionUpper) ||
      !Number.isSafeInteger(state.transactionCursor) || state.transactionCursor < 0 ||
      state.transactionCursor > state.transactionUpper || state.intentCursor > state.intentUpper ||
      !Number.isSafeInteger(state.expectedIntents) || state.expectedIntents < 0 ||
      !Number.isSafeInteger(state.expectedTransactions) || state.expectedTransactions < 0) throw new Error('Invalid checkpoint');
  const value = JSON.parse(state.report) as Totals;
  if (!counters.every(key => Number.isSafeInteger(value[key]) && value[key] >= 0) ||
      !Array.isArray(value.exceptionCodes) || value.exceptionCodes.length > 100 ||
      !value.exceptionCodes.every(code => typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)) ||
      !['none','primary','backup'].includes(value.rpcProvider)) throw new Error('Invalid checkpoint totals');
  return value;
}

// Main SQL/Arc checks are shared with the bounded read-only diagnostic. This
// adds a frozen ID range; SQL bind order stays explicit and tested with SQLite.
const pageSql = drutoSql.replace('AND p.id>?', 'AND p.id>? AND p.id<=?');

export async function runReconciliationBatch(env: CheckpointEnv,
  fetcher: typeof fetch = fetch, clock: () => number = Date.now): Promise<BatchReport> {
  const now = clock();
  let totals = empty(now);
  let state: Checkpoint | undefined;
  let durableState: Checkpoint | undefined;
  let durableTotals = empty(now);
  const token = crypto.randomUUID();
  const query = async <T>(sql: string, ...values: (string | number | null)[]) =>
    (await env.DRUTO_D1.prepare(sql).bind(...values).all<T>()).results;
  try {
    await query(`INSERT INTO reconciliationCheckpoint(id) VALUES (?) ON CONFLICT(id) DO NOTHING`, checkpointId);
    [state] = await query<Checkpoint>(`UPDATE reconciliationCheckpoint SET leaseToken=?,leaseUntil=?,updatedAt=?
      WHERE id=? AND leaseUntil<=? RETURNING *`, token, now+RECONCILIATION_LEASE_MS, now, checkpointId, now);
    if (!state) return { ...result(totals, undefined, 'SKIPPED'), cycleComplete:false,
      exceptionCodes:['AUDIT_LEASE_BUSY'] };
    if (state.phase === 'complete') {
      // Exclude the current second: application timestamps use second precision.
      // New settlements (including lexically earlier random IDs) enter the next cycle.
      const cutoff = Math.floor(now/1000)*1000-1;
      const cycleId = crypto.randomUUID();
      [state] = await query<Checkpoint>(`UPDATE reconciliationCheckpoint SET
        cycleId=?,phase='intents',cutoff=?,intentCursor='',transactionCursor=0,
        intentUpper=COALESCE((SELECT MAX(id) FROM paymentIntents WHERE status='succeeded' AND updatedAt<=?),''),
        transactionUpper=COALESCE((SELECT MAX(id) FROM paymentTransactions WHERE createdAt<=?),0),
        expectedIntents=(SELECT COUNT(*) FROM paymentIntents WHERE status='succeeded' AND updatedAt<=?),
        expectedTransactions=(SELECT COUNT(*) FROM paymentTransactions WHERE createdAt<=?),
        report=?,startedAt=?,completedAt=NULL,updatedAt=? WHERE id=? AND leaseToken=? AND leaseUntil>? RETURNING *`,
        cycleId,cutoff,cutoff,cutoff,cutoff,cutoff,JSON.stringify(totals),now,now,checkpointId,token,now);
      if (!state) throw new Error('Lease lost at start');
    }
    totals = readTotals(state);
    durableState = { ...state };
    durableTotals = structuredClone(totals);
    totals.checkedAt = new Date(now).toISOString();
    if (state.phase === 'intents') {
      const rows = await query<DrutoPayment>(pageSql,now,state.cutoff,state.intentCursor,state.intentUpper,RECONCILIATION_BATCH_SIZE);
      if (rows.length > RECONCILIATION_BATCH_SIZE || rows.some((row,index) =>
        typeof row.id !== 'string' || row.id <= (index ? rows[index-1].id : state!.intentCursor) || row.id > state!.intentUpper)) {
        throw new Error('Invalid intent page');
      }
      const batch = empty(now); batch.drutoSucceeded=rows.length; batch.pagesChecked=rows.length ? 1 : 0;
      const checked = await auditPaymentRows(rows,fetcher,now,batch);
      if (checked.status === 'INCOMPLETE') {
        // Do not persist the partially checked page or its partial counters.
        await query(`UPDATE reconciliationCheckpoint SET leaseToken=NULL,leaseUntil=0 WHERE id=? AND leaseToken=?`,checkpointId,token);
        return result({...totals, exceptionCodes:Array.from(new Set([...totals.exceptionCodes,...checked.exceptionCodes]))},state,'INCOMPLETE');
      }
      for (const key of counters) totals[key] += (checked as Totals)[key] ?? 0;
      totals.exceptionCodes = Array.from(new Set([...totals.exceptionCodes,...checked.exceptionCodes]));
      totals.rpcProvider=checked.rpcProvider;
      totals.rpcFallbackAttempted ||= checked.rpcFallbackAttempted;
      if (rows.length) state.intentCursor=rows[rows.length-1].id;
      if (rows.length < RECONCILIATION_BATCH_SIZE || state.intentCursor === state.intentUpper) state.phase='transactions';
    } else {
      const rows = await query<{id:number; intentStatus:string|null}>(`SELECT t.id,p.status AS intentStatus FROM paymentTransactions t
        LEFT JOIN paymentIntents p ON p.id=t.paymentIntentId
        WHERE t.id>? AND t.id<=? AND t.createdAt<=? ORDER BY t.id LIMIT ?`,
        state.transactionCursor,state.transactionUpper,state.cutoff,RECONCILIATION_BATCH_SIZE);
      if (rows.length > RECONCILIATION_BATCH_SIZE || rows.some((row,index) => !Number.isSafeInteger(row.id) ||
        row.id <= (index ? rows[index-1].id : state!.transactionCursor) || row.id > state!.transactionUpper)) throw new Error('Invalid transaction page');
      totals.transactionsChecked += rows.length;
      const anomalies=rows.filter(row=>row.intentStatus!=='succeeded').length;
      totals.unsettledTransactions += anomalies;
      if (anomalies) totals.exceptionCodes=Array.from(new Set([...totals.exceptionCodes,'DRUTO_UNSETTLED_TRANSACTION']));
      if (rows.length) state.transactionCursor=rows[rows.length-1].id;
      if (rows.length < RECONCILIATION_BATCH_SIZE || state.transactionCursor===state.transactionUpper) {
        const [current] = await query<{intents:number;transactions:number}>(`SELECT
          (SELECT COUNT(*) FROM paymentIntents WHERE status='succeeded' AND updatedAt<=? AND id<=?) AS intents,
          (SELECT COUNT(*) FROM paymentTransactions WHERE createdAt<=? AND id<=?) AS transactions`,
          state.cutoff,state.intentUpper,state.cutoff,state.transactionUpper);
        if (!current || current.intents!==state.expectedIntents || current.transactions!==state.expectedTransactions ||
            totals.drutoSucceeded!==state.expectedIntents || totals.transactionsChecked!==state.expectedTransactions) {
          totals.exceptionCodes=Array.from(new Set([...totals.exceptionCodes,'AUDIT_CYCLE_MEMBERSHIP_CHANGED']));
        }
        state.phase='complete'; state.completedAt=clock();
      }
    }
    totals.status=totals.exceptionCodes.length ? 'FAIL' : state.phase==='complete' ? 'PASS' : 'INCOMPLETE';
    const finished=clock();
    const saved = await query<{id:string}>(`UPDATE reconciliationCheckpoint SET phase=?,intentCursor=?,transactionCursor=?,
      report=?,completedAt=?,updatedAt=?,leaseToken=NULL,leaseUntil=0 WHERE id=? AND leaseToken=? AND leaseUntil>? RETURNING id`,
      state.phase,state.intentCursor,state.transactionCursor,JSON.stringify(totals),state.completedAt,finished,checkpointId,token,finished);
    if (saved.length!==1) throw new Error('Checkpoint commit lost lease');
    return result(totals,state,totals.exceptionCodes.length ? 'FAIL' : state.phase==='complete' ? 'PASS' : 'IN_PROGRESS');
  } catch {
    // Never leak SQL, row contents, tokens or upstream URLs into log diagnostics.
    try { await query(`UPDATE reconciliationCheckpoint SET leaseToken=NULL,leaseUntil=0 WHERE id=? AND leaseToken=?`,checkpointId,token); } catch { /* expiry permits recovery */ }
    // A failed/ambiguous acknowledgement must not claim uncommitted progress.
    // The next invocation rereads D1, including any write whose acknowledgement was lost.
    return { ...result({...durableTotals, exceptionCodes:Array.from(new Set([...durableTotals.exceptionCodes,'AUDIT_CHECKPOINT_INCOMPLETE']))},durableState,'INCOMPLETE'), cycleComplete:false };
  }
}
