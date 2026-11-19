// Programme Dates forecasts on every Hub sync (spec §4). Recomputes each live item with
// forecast.js and writes only the rows whose forecast columns changed (updates only,
// never creates: safe to retry).
// PROGRAMME_FORECAST = off | dry (default: compute, no writes) | on (each sync writes up to `max` rows)

import { readSnapshot } from '../sync.js';
import { getHubStore } from '../store.js';
import { notion, withRetry, sleep } from '../notion.js';
import { GAP_MS } from '../config.js';
import { londonToday } from '../derive.js';
import { engineRow, drawingsByItem, holdsByItem, engineProject } from './adapter.js';
import { forecastItem, forecastPatch } from './forecast.js';

export const forecastMode = () => (process.env.PROGRAMME_FORECAST || 'dry').toLowerCase();
const LIVE_PROJECT = /^in progress$/i;

// Compare a patch with the row as last synced; returns only the changed properties
function diff(row, props) {
  const cur = {
    'Forecast DT Start': row.forecast?.dtStart, 'Forecast DT Delivery': row.forecast?.dtDel,
    'Forecast Submission': row.forecast?.sub, 'Forecast Approval': row.forecast?.appr,
    'Variance (days)': row.variance, RAG: row.rag, 'DT Days Unverified': !!row.dtDaysUnverified, 'DT Days': row.dtDays,
  };
  const val = p => (p.date !== undefined ? p.date?.start ?? null : p.number !== undefined ? p.number : p.select !== undefined ? p.select?.name ?? null : p.checkbox);
  return Object.fromEntries(Object.entries(props).filter(([k, p]) => (cur[k] ?? null) !== (val(p) ?? null)));
}

/** Pure: snapshots in → per-stage results and the changed patches. */
export function planForecasts(snaps, { today = londonToday() } = {}) {
  const live = new Set((snaps.projects || []).filter(p => LIVE_PROJECT.test(p.status || '')).map(p => p.id));
  const projects = new Map((snaps.projects || []).map(p => [p.id, p]));
  const dwg = drawingsByItem(snaps.drawings), holds = holdsByItem(snaps.variations, snaps.rfis);
  const byItem = new Map(), rowById = new Map();
  for (const r of snaps.programme || []) {
    if (r.archived || !r.current) continue;
    rowById.set(r.id, r);
    for (const id of r.itemIds || []) { if (!byItem.has(id)) byItem.set(id, {}); byItem.get(id)[r.stage] = r; }
  }
  const results = [], changes = [];
  for (const t of snaps.tasks || []) {
    if (t.archived || !live.has(t.projectId) || /^omitted$/i.test(t.status || '') || !byItem.has(t.id)) continue;
    const row = engineRow(t, dwg.get(t.id) || [], holds[t.id] || []);
    const res = forecastItem({ row, task: t, stages: byItem.get(t.id), project: engineProject(projects.get(t.projectId)), holds: holds[t.id] || [], today });
    results.push({ item: t, stages: res });
    for (const s of res) {
      const p = forecastPatch(s);
      const cur = s.rowId && rowById.get(s.rowId);
      if (!p || !cur) continue;
      const changed = diff(cur, p);
      if (Object.keys(changed).length) changes.push({ rowId: s.rowId, item: t.title, stage: s.stage, props: changed });
    }
  }
  return { results, changes };
}

/** Sync pass: write up to `max` changed rows. */
export async function applyForecasts({ deadline = Date.now() + 20_000, max = 60 } = {}) {
  const store = await getHubStore();
  const snaps = {};
  for (const db of ['tasks', 'drawings', 'variations', 'rfis', 'projects', 'programme']) snaps[db] = (await readSnapshot(store, db)).rows;
  const { changes } = planForecasts(snaps);
  const done = [], failed = [];
  for (const c of changes.slice(0, max)) {
    if (Date.now() > deadline) break;
    try { await withRetry(() => notion().pages.update({ page_id: c.rowId, properties: c.props })); done.push(c.rowId); }
    catch (err) { failed.push({ id: c.rowId, error: err.message }); }
    await sleep(GAP_MS);
  }
  return { done, failed, remaining: changes.length - done.length };
}
