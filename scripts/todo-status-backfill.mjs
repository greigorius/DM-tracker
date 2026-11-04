// One-off: fill the To Do "Status" select from "Task Done".
//   Task Done ticked → Done, otherwise → Not Started.
// Only touches rows whose Status is still blank, so it is safe to re-run.
//   npm run backfill:status            (writes)
//   npm run backfill:status -- --dry   (counts only)
import 'dotenv/config';
import { notion, withRetry, queryAllPages, sleep } from '../hub-core/notion.js';
import { GAP_MS } from '../hub-core/config.js';

const dry = process.argv.includes('--dry');
const pages = await queryAllPages('todo', { filter: { property: 'Status', select: { is_empty: true } } });
const done = pages.filter(p => p.properties['Task Done']?.checkbox);
console.log(`${pages.length} rows with no Status — ${done.length} → Done, ${pages.length - done.length} → Not Started${dry ? ' (dry run, nothing written)' : ''}`);
if (dry) process.exit(0);

let n = 0;
for (const p of pages) {
  const name = p.properties['Task Done']?.checkbox ? 'Done' : 'Not Started';
  await withRetry(() => notion().pages.update({ page_id: p.id, properties: { Status: { select: { name } } } }));
  n += 1;
  if (n % 50 === 0) console.log(`  ${n}/${pages.length}`);
  await sleep(GAP_MS);
}
console.log(`Done: ${n} rows updated. Run "npm run sync -- --full" (or press Sync now) so the Hub picks them up.`);
