// Read side: snapshot + bootstrap. No Notion SDK import (keeps api-read cold
// starts small).

import { DB_KEYS, snapKey, META_KEY, SCHEMA_KEY, EVENTS_KEY } from './config.js';
import { getHubStore } from './store.js';
import { computeCounts, computeTileCounts, buildLookups, londonToday } from './derive.js';

export async function getSnapshots(dbs) {
  const wanted = (dbs?.length ? dbs : DB_KEYS).filter(d => DB_KEYS.includes(d));
  const store = await getHubStore();
  const entries = await Promise.all(wanted.map(async db => [db, (await store.getJSON(snapKey(db))) || { syncedAt: null, rows: [] }]));
  return Object.fromEntries(entries);
}

export async function getBootstrap() {
  const store = await getHubStore();
  const [snaps, meta, schema, events] = await Promise.all([
    getSnapshots(['tasks', 'actions', 'rfis', 'variations', 'submissions', 'projects', 'clients', 'team']),
    store.getJSON(META_KEY),
    store.getJSON(SCHEMA_KEY),
    store.getJSON(EVENTS_KEY),
  ]);
  const rows = Object.fromEntries(Object.entries(snaps).map(([k, v]) => [k, v.rows]));
  const today = londonToday();
  const counts = computeCounts(rows, today);
  const updatedAt = Object.fromEntries(Object.entries(snaps).map(([k, v]) => [k, v.syncedAt]));

  return {
    today,
    syncedAt: meta?.syncedAt || null,
    updatedAt,
    lookups: buildLookups(rows, schema || {}),
    counts,
    tiles: computeTileCounts(rows, counts),
    justLogged: (events || []).slice(0, 20),
    empty: !meta?.syncedAt,
  };
}

// Duplicate pairs marked "Not a duplicate" in Triage (pair keys, see duplicates.js).
export const DISMISSED_KEY = 'duplicates/dismissed';
export async function getDismissedDuplicates() {
  try { return { dismissed: (await (await getHubStore()).getJSON(DISMISSED_KEY)) || [] }; }
  catch (err) { console.error('[hub-store] could not read dismissed duplicates:', err.message); return { dismissed: [] }; }
}
