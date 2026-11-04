// Writes the derived item BIC to Notion. Runs at the end of each sync pass when
// ITEM_BIC_AUTO=on; with "dry" (the default) it only reports. Triage can apply
// changes by hand in either mode. Writes patch the tasks snapshot so the next
// sync doesn't log them as new "Just logged" events.

import { snapKey, SCHEMA_KEY, GAP_MS } from './config.js';
import { getHubStore } from './store.js';
import { readSnapshot } from './sync.js';
import { notion, withRetry, sleep } from './notion.js';
import { mapPage } from './mappers.js';
import { bicPlan } from './item-bic.js';

export const bicMode = () => (process.env.ITEM_BIC_AUTO || 'dry').toLowerCase();

async function loadSnaps(store) {
  const dbs = ['tasks', 'submissions', 'variations', 'rfis', 'actions', 'projects'];
  const rows = await Promise.all(dbs.map(db => readSnapshot(store, db)));
  return Object.fromEntries(dbs.map((db, i) => [db, rows[i].rows]));
}

export async function getBicPlan() {
  const store = await getHubStore();
  const [snaps, schema] = await Promise.all([loadSnaps(store), store.getJSON(SCHEMA_KEY)]);
  const plan = bicPlan(snaps, { allowed: schema?.taskBic });
  const projects = new Map(snaps.projects.map(p => [p.id, p.title]));
  for (const r of [...plan.changes, ...plan.invalid]) r.project = projects.get(r.projectId) || null;
  return { mode: bicMode(), ...plan };
}

/** Apply derived BIC. ids = only these items; deadline = stop starting writes after (ms epoch). */
export async function applyBic({ ids, deadline, max = Infinity } = {}) {
  const store = await getHubStore();
  const { changes } = await getBicPlan();
  const wanted = ids?.length ? new Set(ids) : null;
  const todo = changes.filter(c => !wanted || wanted.has(c.id)).slice(0, max);
  const done = [], failed = [];
  const written = new Map();
  for (const c of todo) {
    if (deadline && Date.now() > deadline) break;
    try {
      const page = await withRetry(() => notion().pages.update({ page_id: c.id, properties: { 'Ball In Court': { select: c.to ? { name: c.to } : null } } }));
      written.set(c.id, mapPage('tasks', page));
      done.push({ id: c.id, title: c.title, from: c.from, to: c.to });
    } catch (err) {
      failed.push({ id: c.id, title: c.title, error: err.message });
    }
    await sleep(GAP_MS);
  }
  if (written.size) {
    const snap = await readSnapshot(store, 'tasks');
    await store.setJSON(snapKey('tasks'), { ...snap, rows: snap.rows.map(r => written.get(r.id) || r) });
  }
  return { done, failed, remaining: Math.max(0, changes.length - done.length - failed.length) };
}
