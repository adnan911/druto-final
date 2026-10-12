// Scheduled audit writes only reconciliation checkpoint metadata, never payments.
export { reconcileTestnet } from './audit';
import { runReconciliationBatch, type CheckpointEnv } from './checkpoints';
export default {
  fetch: () => new Response(null, { status: 404 }),
  async scheduled(_controller: unknown, env: CheckpointEnv) {
    const report = await runReconciliationBatch(env);
    console.info('druto_testnet_reconciliation', report);
    if (report.status === 'FAIL' || report.status === 'INCOMPLETE') {
      throw new Error(`Testnet reconciliation ${report.status}`);
    }
  },
} satisfies ExportedHandler<CheckpointEnv>;