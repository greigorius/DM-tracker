// Writes derived Item Status (and the Drawing Statuses it rests on) to Notion.
// Same rules as the item-status functions (see hub-core/item-status.js).
// ITEM_STATUS_AUTO: off | dry (default: Triage review only) | on (each sync
// writes up to 40 items). Triage can apply by hand in any mode. Writes patch the
// snapshots so the next sync doesn't log them as new "Just logged" events.

import { snapKey } from './config.js';
import { getHubStore } from './store.js';
import { readSnapshot } from './sync.js';
import { notion, withRetry, sleep } from './notion.js';
import { GAP_MS } from './config.js';
import { mapPage } from './mappers.js';
import { londonToday } from './derive.js';
import { statusPlan } from './item-status.js';

export const statusMode = () => (process.env.ITEM_STATUS_AUTO || 'dry').toLowerCase();
const DBS = ['tasks', 'drawings', 'submissions', 'rfis', 'variations', 'projects'];

async function loadSnaps(store) {
  const rows = await Promise.all(DBS.map(db => readSnapshot(store, db)));
  return Object.fromEntries(DBS.map((db, i) => [db, rows[i].rows]));
}

export async function getStatusPlan() {
  const store = await getHubStore();
  return { mode: statusMode(), ...statusPlan(await loadSnaps(store), londonToday()) };
}

/** Apply derived statuses. ids = only these items; deadline = stop starting writes after (ms epoch). */
export async function applyStatus({ ids, deadline, max = Infinity } = {}) {
  const store = await getHubStore();
  const { changes } = await getStatusPlan();
  const wanted = ids?.length ? new Set(ids) : null;
  const todo = changes.filter(c => !wanted || wanted.has(c.id)).slice(0, max);
  const done = [], failed = [];
  const written = { tasks: new Map(), drawings: new Map() };
  const write = async (db, id, properties) => {
    const page = await withRetry(() => notion().pages.update({ page_id: id, properties }));
    written[db].set(page.id, mapPage(db, page));
    await sleep(GAP_MS);
  };
  for (const c of todo) {
    if (deadline && Date.now() > deadline) break;
    try {
      // Drawings first, as the automation does: the item's status rests on them.
      for (const d of c.drawings) await write('drawings', d.id, { 'Drawing Status': { select: d.to ? { name: d.to } : null } });
      if (c.from !== c.to) await write('tasks', c.id, { 'Item Status': { status: c.to ? { name: c.to } : null } });
      done.push({ id: c.id, title: c.title, from: c.from, to: c.to, drawings: c.drawings.length });
    } catch (err) {
      failed.push({ id: c.id, title: c.title, error: err.message });
    }
  }
  for (const db of ['tasks', 'drawings']) {
    if (!written[db].size) continue;
    const snap = await readSnapshot(store, db);
    // Snapshot ids may be dashed or not; match on the bare id.
    const bare = id => String(id).replace(/-/g, '');
    const byBare = new Map([...written[db]].map(([id, row]) => [bare(id), row]));
    await store.setJSON(snapKey(db), { ...snap, rows: snap.rows.map(r => byBare.get(bare(r.id)) || r) });
  }
  return { done, failed, remaining: Math.max(0, changes.length - done.length - failed.length) };
}
