// Old engine (calcRow, pinned Adj) vs new engine (forecast.js) per item × stage, plus the
// Programme Dates patches the new engine would write. Review only: no Notion writes.
//   node scripts/programme-compare.mjs     → .cache/programme-compare/{rows,summary}.json
// Programme Dates rows come from the 'programme' snapshot, or from the seed output when
// that snapshot doesn't exist yet (local runs without Notion access).
import 'dotenv/config';
import fs from 'node:fs/promises';
process.env.HUB_STORE ||= 'file';
const { getHubStore } = await import('../hub-core/store.js');
const { readSnapshot } = await import('../hub-core/sync.js');
const { londonToday } = await import('../hub-core/derive.js');
const { calcRow, toISO } = await import('../hub-core/programme/schedule.js');
const { engineRow, drawingsByItem, holdsByItem, engineProject } = await import('../hub-core/programme/adapter.js');
const { forecastItem, forecastPatch } = await import('../hub-core/programme/forecast.js');

const store = await getHubStore();
const snaps = {};
for (const db of ['tasks', 'drawings', 'variations', 'rfis', 'projects', 'programme']) {
  try { snaps[db] = (await readSnapshot(store, db)).rows; } catch { snaps[db] = []; }
}
let source = 'snapshot';
if (!snaps.programme?.length) {
  source = 'seed';
  const seed = JSON.parse(await fs.readFile('.cache/programme-seed/rows.json', 'utf8'));
  snaps.programme = seed.map((r, i) => ({ id: `seed-${i}`, itemIds: [r.itemId], stage: r.stage, current: true, notRequired: !!r.notRequired,
    baseline: { sub: r.blSub, appr: r.blAppr ?? null, dtDays: r.blDtDays ?? null, source: r.source, ref: r.ref },
    dtDays: r.dtDays ?? null, actual: { dtStart: r.actDtStart ?? null, dtDel: r.actDtDel ?? null }, manualDtStart: !!r.manualStart,
    coordDays: r.coord ?? null, accReviewDays: r.accReview ?? null, accQaDays: r.accQa ?? null, installOverride: null }));
}
const today = process.env.TODAY || londonToday();
const live = new Set(snaps.projects.filter(p => /^in progress$/i.test(p.status || '')).map(p => p.id));
const projects = new Map(snaps.projects.map(p => [p.id, p]));
const dwg = drawingsByItem(snaps.drawings), holds = holdsByItem(snaps.variations, snaps.rfis);
const byItem = new Map();
for (const r of snaps.programme) if (!r.archived && r.current) for (const id of r.itemIds || []) { if (!byItem.has(id)) byItem.set(id, {}); byItem.get(id)[r.stage] = r; }

const iso = d => (d ? toISO(d) : null);
const OLD = { S4: ['sub1A', 's4A'], S5: ['sub2A', 's5A'], 'A4.5': ['subCA', 'c01SignOffAdj'], PRD: ['subCA', 'c01SignOffAdj'], Production: ['prodDateAdj'], Install: [] };
const rows = [], patches = [];
for (const t of snaps.tasks) {
  if (t.archived || !live.has(t.projectId) || /^omitted$/i.test(t.status || '') || !byItem.has(t.id)) continue;
  const project = engineProject(projects.get(t.projectId));
  const row = engineRow(t, dwg.get(t.id) || [], holds[t.id] || []);
  const old = calcRow(row, project, { today });
  const res = forecastItem({ row, task: t, stages: byItem.get(t.id), project, holds: holds[t.id] || [], today });
  let prevAppr = null;
  for (const s of res) {
    const [oS, oA] = OLD[s.stage] || [];
    const f = s.reissue || s;
    const flags = [];
    if (!s.notRequired) {
      if (f.sub && !s.subActual && f.sub < today) flags.push('NEW fc in past');
      if (prevAppr && f.dtStart && f.dtStart < prevAppr && !s.subActual) flags.push('NEW starts before previous return');
      if (oS && old[oS] && iso(old[oS]) < today && !s.subActual) flags.push('old fc in past');
      prevAppr = f.appr || prevAppr;
    }
    rows.push({ project: projects.get(t.projectId)?.title, item: t.title, status: t.status, prog: !!t.programmeDriven, stage: s.stage,
      notRequired: !!s.notRequired, oldSub: oS ? iso(old[oS]) : null, oldAppr: oA ? iso(old[oA]) : null,
      newStart: f.dtStart ?? null, newSub: f.sub ?? null, newAppr: f.appr ?? null, subActual: !!s.subActual, reissue: !!s.reissue, grade: s.grade ?? null,
      dtDays: s.dtDays ?? null, dtSource: s.dtSource ?? null, actualDtDays: s.actualDtDays ?? null, startAssumed: !!s.dtStartAssumed, unverified: !!s.unverified,
      baseline: s.baselineSub ?? null, variance: s.variance ?? null, rag: s.rag ?? null, flags: flags.join('; '), notes: (s.notes || []).join('; ') });
    const p = forecastPatch(s); if (p && s.rowId) patches.push({ rowId: s.rowId, item: t.title, stage: s.stage, props: p });
  }
}
const count = f => rows.filter(f).length;
const summary = { source, today, items: new Set(rows.map(r => r.item)).size, rows: rows.length,
  newPastFc: count(r => r.flags.includes('NEW fc in past')), newBeforePrev: count(r => r.flags.includes('NEW starts before')),
  oldPastFc: count(r => r.flags.includes('old fc in past')),
  rag: Object.fromEntries(['Red', 'Amber', 'Green', 'Done', null].map(k => [String(k), count(r => !r.notRequired && r.rag === k)])),
  unverified: count(r => r.unverified), actualDtDays: count(r => r.dtSource === 'actual'), assumedStart: count(r => r.startAssumed), patches: patches.length };
await fs.mkdir('.cache/programme-compare', { recursive: true });
await fs.writeFile('.cache/programme-compare/rows.json', JSON.stringify(rows));
await fs.writeFile('.cache/programme-compare/patches.json', JSON.stringify(patches));
await fs.writeFile('.cache/programme-compare/summary.json', JSON.stringify(summary, null, 1));
console.log(summary);
