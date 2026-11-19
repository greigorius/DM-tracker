// Seed the Programme Dates DB with the first baseline.
//   node scripts/programme-seed.mjs            review only: writes .cache/programme-seed/*.json, no Notion writes
//   node scripts/programme-seed.mjs --write    creates the rows in Notion (only after the review lists are signed off)
// Reads the local snapshots (run `npm run sync` first for fresh data).
import 'dotenv/config';
import fs from 'node:fs/promises';
process.env.HUB_STORE ||= 'file';
const { getHubStore } = await import('../hub-core/store.js');
const { readSnapshot } = await import('../hub-core/sync.js');
const { buildSeed, seedProps } = await import('../hub-core/programme/seed.js');
const { londonToday } = await import('../hub-core/derive.js');
const { PROGRAMME_DS, GAP_MS } = await import('../hub-core/config.js');

const store = await getHubStore();
const DBS = ['tasks', 'drawings', 'variations', 'rfis', 'projects'];
const snaps = Object.fromEntries(await Promise.all(DBS.map(async db => [db, (await readSnapshot(store, db)).rows])));
const today = process.env.SEED_TODAY || londonToday();
const seed = buildSeed(snaps, { today });

const dir = '.cache/programme-seed';
await fs.mkdir(dir, { recursive: true });
for (const k of ['rows', 'clientReview', 'dtVerify', 'staleMds', 'notes']) await fs.writeFile(`${dir}/${k}.json`, JSON.stringify(seed[k], null, 1));
console.log({ ref: seed.ref, today, rows: seed.rows.length, items: new Set(seed.rows.map(r => r.itemId)).size,
  clientReview: seed.clientReview.length, dtVerify: seed.dtVerify.length, staleMds: seed.staleMds.length, notes: seed.notes.length, skipped: seed.skipped });

if (process.argv.includes('--write')) {
  const ds = PROGRAMME_DS;
  const { notion, withRetry, sleep } = await import('../hub-core/notion.js');
  let done = 0;
  for (const r of seed.rows) {
    await withRetry(() => notion().pages.create({ parent: { type: 'data_source_id', data_source_id: ds }, properties: seedProps(r) }));
    if (++done % 50 === 0) console.log(`${done}/${seed.rows.length}`);
    await sleep(GAP_MS);
  }
  console.log(`created ${done} rows`);
}
