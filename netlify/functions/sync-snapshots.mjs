// Scheduled every 5 minutes: incremental sync of every DB (last_edited_time
// filter). Full rebuilds (nightly, or a DB with no snapshot yet) are handed to
// the sync-full-background function, which has a 15-minute limit.
import { runSync, triggerFullRebuild } from '../../hub-core/sync.js';

export default async () => {
  const run = await runSync({ budgetMs: 22_000, allowFull: false });
  if (run.needsFull?.length) await triggerFullRebuild();
  console.log('[sync]', JSON.stringify(run));
};

export const config = { schedule: '*/5 * * * *' };
