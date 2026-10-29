// Scheduled every 5 minutes: incremental sync of every DB (last_edited_time
// filter). Full rebuilds (nightly, or a DB with no snapshot yet) are handed to
// the sync-full-background function, which has a 15-minute limit.
import { runSync } from '../../hub-core/sync.js';

export default async () => {
  const run = await runSync({ budgetMs: 22_000, allowFull: false });
  if (run.needsFull?.length && process.env.URL) {
    try {
      await fetch(`${process.env.URL}/.netlify/functions/sync-full-background`, {
        method: 'POST',
        headers: { 'x-hub-sync-key': process.env.HUB_SYNC_KEY || '' },
        signal: AbortSignal.timeout(3000),
      });
    } catch (err) { console.warn('[sync] could not trigger full rebuild:', err.message); }
  }
  console.log('[sync]', JSON.stringify(run));
};

export const config = { schedule: '*/5 * * * *' };
