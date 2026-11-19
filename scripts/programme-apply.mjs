// Write the new engine's forecasts to the Programme Dates DB (updates only, never creates).
// Run programme-compare first; this applies .cache/programme-compare/patches.json.
//   node scripts/programme-apply.mjs           dry: prints what would change
//   node scripts/programme-apply.mjs --write   updates the rows in Notion
import 'dotenv/config';
import fs from 'node:fs/promises';
const { notion, withRetry, sleep } = await import('../hub-core/notion.js');
const { GAP_MS } = await import('../hub-core/config.js');
const patches = JSON.parse(await fs.readFile('.cache/programme-compare/patches.json', 'utf8'));
const real = patches.filter(p => !String(p.rowId).startsWith('seed-'));
if (!real.length) { console.log('No live Programme Dates row ids: run `npm run sync` then programme-compare first.'); process.exit(1); }
console.log(`${real.length} rows to update`);
if (!process.argv.includes('--write')) { console.log(JSON.stringify(real.slice(0, 3), null, 1)); process.exit(0); }
let n = 0;
for (const p of real) {
  await withRetry(() => notion().pages.update({ page_id: p.rowId, properties: p.props }));   // update is idempotent: safe to retry
  if (++n % 50 === 0) console.log(`${n}/${real.length}`);
  await sleep(GAP_MS);
}
console.log(`updated ${n} rows`);
