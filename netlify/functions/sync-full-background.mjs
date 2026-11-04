// Background function (15-minute limit): full rebuild of queued / missing DBs.
// Triggered by sync-snapshots, or manually: POST /.netlify/functions/sync-full-background
import { runSync } from '../../hub-core/sync.js';

export default async req => {
  const key = process.env.HUB_SYNC_KEY;
  if (key && req.headers.get('x-hub-sync-key') !== key) return new Response('forbidden', { status: 403 });
  const force = new URL(req.url).searchParams.get('force') === '1';
  const run = await runSync({ budgetMs: 13 * 60_000, allowFull: true, forceFull: force });
  console.log('[sync-full]', JSON.stringify(run));
};
