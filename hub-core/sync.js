// Snapshot sync: incremental (last_edited_time > last sync) every 5 minutes,
// plus a full rebuild nightly to catch deletes and archives. Time-boxed so it
// fits inside a function timeout; unfinished full rebuilds resume next run.

import { SYNC_ORDER, snapKey, META_KEY, SCHEMA_KEY, EVENTS_KEY, MAX_EVENTS, MAPPER_VERSION, SCHEMA_VERSION } from './config.js';
import { getHubStore } from './store.js';
import { queryAllPages, retrieveSchemaOptions } from './notion.js';
import { mapPage } from './mappers.js';
import { eventForNewRow, eventsForItemChange, londonToday } from './derive.js';

const EVENT_DBS = new Set(['actions', 'rfis', 'variations', 'submissions']);

export async function readSnapshot(store, db) {
  return (await store.getJSON(snapKey(db))) || { syncedAt: null, rows: [] };
}

export async function appendEvents(store, events) {
  if (!events.length) return;
  const cur = (await store.getJSON(EVENTS_KEY)) || [];
  const seen = new Set(cur.map(e => e.id));
  const merged = [...events.filter(e => !seen.has(e.id)), ...cur]
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''))
    .slice(0, MAX_EVENTS);
  await store.setJSON(EVENTS_KEY, merged);
}

// Merge changed rows into a snapshot, returning the new snapshot + events.
function merge(db, snap, changedRows, itemsById, { full }) {
  const prevById = new Map(snap.rows.map(r => [r.id, r]));
  const events = [];
  const firstBuild = !snap.syncedAt;

  for (const row of changedRows) {
    const prev = prevById.get(row.id);
    if (!firstBuild) {
      if (!prev && EVENT_DBS.has(db) && !row.archived) {
        const e = eventForNewRow(db, row, itemsById);
        if (e) events.push(e);
      }
      if (prev && db === 'tasks') events.push(...eventsForItemChange(prev, row));
    }
  }

  let rows;
  if (full) {
    rows = changedRows.filter(r => !r.archived);
  } else {
    const byId = new Map(prevById);
    for (const r of changedRows) {
      if (r.archived) byId.delete(r.id); else byId.set(r.id, r);
    }
    rows = [...byId.values()];
  }
  return { rows, events };
}

async function syncDb(store, db, { full, deadline, itemsById }) {
  const snap = await readSnapshot(store, db);
  const isFull = full || !snap.syncedAt || snap.mapperVersion !== MAPPER_VERSION;
  const startedAt = new Date().toISOString();
  // Notion rounds last_edited_time to the minute, so overlap by 2 minutes.
  const since = snap.syncedAt ? new Date(Date.parse(snap.syncedAt) - 120_000).toISOString() : null;
  const filter = isFull ? undefined : { timestamp: 'last_edited_time', last_edited_time: { on_or_after: since } };

  const pages = await queryAllPages(db, { filter, deadline });
  const changed = pages.map(p => mapPage(db, p));
  const { rows, events } = merge(db, snap, changed, itemsById, { full: isFull });
  await store.setJSON(snapKey(db), { syncedAt: startedAt, fullAt: isFull ? startedAt : snap.fullAt || null, mapperVersion: MAPPER_VERSION, rows });
  return { db, changed: changed.length, total: rows.length, full: isFull, events };
}

/**
 * Run a sync pass.
 * @param {object} opts
 * @param {number} opts.budgetMs   stop starting new work after this long
 * @param {boolean} opts.forceFull full rebuild of every DB this pass
 * @param {boolean} opts.allowFull false = incremental only; DBs needing a full rebuild are reported in needsFull
 * @param {string[]} opts.dbs      restrict to these DBs
 */
export async function runSync({ budgetMs = 22_000, forceFull = false, allowFull = true, dbs = SYNC_ORDER } = {}) {
  const t0 = Date.now();
  const deadline = t0 + budgetMs;
  const store = await getHubStore();
  const meta = (await store.getJSON(META_KEY)) || { fullQueue: [], lastFullDate: null };

  // Nightly: queue a full rebuild once per London day, after 01:00.
  const today = londonToday();
  const hour = Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }));
  if (forceFull || (meta.lastFullDate !== today && hour >= 1)) {
    meta.fullQueue = [...new Set([...(meta.fullQueue || []), ...SYNC_ORDER])];
    meta.lastFullDate = today;
  }

  const tasksSnap = await readSnapshot(store, 'tasks');
  const itemsById = new Map(tasksSnap.rows.map(r => [r.id, r]));
  const results = [];
  const allEvents = [];
  const skipped = [];
  const needsFull = [];

  for (const db of dbs) {
    if (Date.now() > deadline) { skipped.push(db); continue; }
    const full = meta.fullQueue.includes(db);
    if (!allowFull) {
      const cur = await store.getJSON(snapKey(db));
      if (full || !cur?.syncedAt || cur.mapperVersion !== MAPPER_VERSION) { needsFull.push(db); continue; }
    }
    try {
      const r = await syncDb(store, db, { full, deadline, itemsById });
      results.push({ db: r.db, changed: r.changed, total: r.total, full: r.full });
      allEvents.push(...r.events);
      if (r.full) meta.fullQueue = meta.fullQueue.filter(x => x !== db);
      if (db === 'tasks') {
        const fresh = await readSnapshot(store, 'tasks');
        itemsById.clear();
        fresh.rows.forEach(row => itemsById.set(row.id, row));
      }
    } catch (err) {
      if (err.code === 'deadline') { skipped.push(db); continue; }
      results.push({ db, error: err.message });
      console.error(`[sync] ${db}:`, err.message);
    }
  }

  // Refresh select options daily (or when missing).
  const schema = await store.getJSON(SCHEMA_KEY);
  if ((!schema || schema.version !== SCHEMA_VERSION || !schema.fetchedAt?.startsWith(today)) && Date.now() < deadline) {
    try { await store.setJSON(SCHEMA_KEY, await retrieveSchemaOptions()); }
    catch (err) { console.error('[sync] schema:', err.message); }
  }

  await appendEvents(store, allEvents);

  // Derived item BIC (hub-core/item-bic.js). Only writes when ITEM_BIC_AUTO=on.
  let bic = null;
  const { bicMode, applyBic } = await import('./item-bic-sync.js');
  if (bicMode() === 'on' && Date.now() < deadline) {
    try { bic = await applyBic({ deadline, max: 40 }); }
    catch (err) { console.error('[sync] item BIC:', err.message); bic = { error: err.message }; }
  }

  // Programme Dates forecasts (hub-core/programme/forecast-sync.js). Only writes when PROGRAMME_FORECAST=on.
  let forecasts = null;
  const { forecastMode, applyForecasts } = await import('./programme/forecast-sync.js');
  if (forecastMode() === 'on' && Date.now() < deadline) {
    try { forecasts = await applyForecasts({ deadline, max: 60 }); }
    catch (err) { console.error('[sync] forecasts:', err.message); forecasts = { error: err.message }; }
  }

  // Programme Adj dates (hub-core/programme/sync.js). Only writes when PROGRAMME_AUTO=on.
  let programme = null;
  const { programmeMode, applyProgramme } = await import('./programme/sync.js');
  if (programmeMode() === 'on' && Date.now() < deadline) {
    try { programme = await applyProgramme({ deadline, max: 40 }); }
    catch (err) { console.error('[sync] programme:', err.message); programme = { error: err.message }; }
  }

  meta.syncedAt = new Date().toISOString();
  meta.lastRun = { at: meta.syncedAt, ms: Date.now() - t0, results, skipped, needsFull,
    ...(bic && { bic: { written: bic.done?.length || 0, failed: bic.failed?.length || 0, remaining: bic.remaining, error: bic.error } }),
    ...(forecasts && { forecasts: { written: forecasts.done?.length || 0, failed: forecasts.failed?.length || 0, remaining: forecasts.remaining, error: forecasts.error } }),
    ...(programme && { programme: { written: programme.done?.length || 0, failed: programme.failed?.length || 0, blocked: programme.blocked?.length || 0, remaining: programme.remaining, error: programme.error } }) };
  await store.setJSON(META_KEY, meta);
  return meta.lastRun;
}

// Start a full rebuild of the DBs a quick sync had to skip (first deploy, a
// mapper change, the nightly rebuild). On Netlify that is the
// sync-full-background function (15-minute limit); locally it runs in-process.
export async function triggerFullRebuild() {
  if (process.env.URL) {          // set by Netlify; unset in local dev
    try {
      await fetch(`${process.env.URL}/.netlify/functions/sync-full-background`, {
        method: 'POST',
        headers: { 'x-hub-sync-key': process.env.HUB_SYNC_KEY || '' },
        signal: AbortSignal.timeout(3000),
      });
      return true;
    } catch (err) {
      // A background function answers 202 straight away; a timeout here usually still started it.
      console.warn('[sync] full rebuild trigger:', err.message);
      return err.name === 'TimeoutError';
    }
  }
  runSync({ budgetMs: 10 * 60_000, allowFull: true }).catch(err => console.error('[sync] full rebuild:', err.message));
  return true;
}
