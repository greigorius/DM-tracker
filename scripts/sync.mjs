// Local snapshot sync: `npm run sync` (incremental) or `npm run sync -- --full`.
import 'dotenv/config';
process.env.HUB_STORE ||= 'file';
const { runSync } = await import('../hub-core/sync.js');
const full = process.argv.includes('--full');
const run = await runSync({ budgetMs: 10 * 60_000, forceFull: full });
console.table(run.results);
if (run.skipped.length) console.log('skipped:', run.skipped.join(', '));
console.log(`done in ${run.ms} ms`);
