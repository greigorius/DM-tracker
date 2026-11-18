// Programme writes (server). The Scheduling Tool's sync, run from the Hub's
// snapshots:
//   1. Snap (brief Nov 2026 §5): a stage whose Actual has changed since the
//      last applied sync gets Adj = Actual (and DT Delivery (Adj) pulled before
//      it); a cleared reissue clears Reissue Reason.
//   2. Every calculated Adj date that differs from Notion is written. Items that
//      break the order rule are blocked and listed; nothing is written for them.
// Only the 8 Adj date properties and Reissue Reason are ever written here —
// never Plan or Actual (isProtectedProp is checked again before each write).
//
// PROGRAMME_AUTO = off | dry (default: review only) | on (each sync pass writes
// up to 40 items). Applying by hand works in every mode.
//
// Item inputs edited on the Programme page (Manual DT Start, Reissue Reason,
// Programme-driven, Date of Instruction, acceleration) and project periods go
// through updateProgrammeItem / updateProgrammeProject, which then re-sync that item.

import { snapKey, GAP_MS } from '../config.js';
import { getHubStore } from '../store.js';
import { readSnapshot } from '../sync.js';
import { notion, withRetry, sleep } from '../notion.js';
import { mapPage } from '../mappers.js';
import { londonToday } from '../derive.js';
import { calcRow, adjPatch, snapStages, isProtectedProp, ADJ_PROPS, ACCEL_PROPS, MIN_PROJECT_PROPS,
  PROJECT_PERIOD_PROPS, MANUAL_DT_START_PROP, MANUAL_DT_START_OPTS, REISSUE_REASONS } from './schedule.js';
import { buildProgramme } from './adapter.js';

export const ACTUALS_KEY = 'snap/programme-actuals';
export const programmeMode = () => (process.env.PROGRAMME_AUTO || 'dry').toLowerCase();

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const ADJ_PROP_SET = new Set(Object.values(ADJ_PROPS));
const SNAP_DBS = ['tasks', 'drawings', 'variations', 'rfis', 'projects'];
const LIVE_PROJECT = /^in progress$/i;

async function loadSnaps(store) {
  const rows = await Promise.all(SNAP_DBS.map(db => readSnapshot(store, db)));
  return Object.fromEntries(SNAP_DBS.map((db, i) => [db, rows[i].rows]));
}

/**
 * Work out what a sync would write. Pure: no I/O.
 * @returns {{ changes, blocked, dataIssues, rowCache }}
 *   changes: [{ id, title, projectId, fields, selects, snapped, count }]
 *   rowCache: id → the Actuals this plan saw (saved for rows that are applied)
 */
export function programmePlan(snaps, cache = {}, { today = londonToday(), projectId = null } = {}) {
  const live = new Set((snaps.projects || []).filter(p => LIVE_PROJECT.test(p.status || '')).map(p => p.id));
  const built = buildProgramme(snaps, { projectId, today, include: t => live.has(t.projectId) });
  const { rows: snappedRows, patches, cache: nextCache } = snapStages(built.map(b => b.row), cache);
  const snapById = new Map(patches.map(p => [p.pageId, p]));
  const changes = [], blocked = [], dataIssues = [];
  built.forEach((b, i) => {
    const row = snappedRows[i];
    const c = row === b.row ? b.c : calcRow(row, b.project, { today });
    const snap = snapById.get(row.id);
    const patch = adjPatch(row, c);
    const base = { id: row.id, title: row.name, projectId: row.projectId };
    if (patch.blocked) blocked.push({ ...base, violations: patch.violations });
    if (c.orderDataIssues?.length) dataIssues.push({ ...base, issues: c.orderDataIssues });
    const fields = { ...(snap?.fields || {}), ...patch.fields };
    const selects = snap?.selects || null;
    const count = Object.keys(fields).length + (selects ? Object.keys(selects).length : 0);
    if (count) changes.push({ ...base, fields, selects, snapped: snap?.count || 0, count });
  });
  return { changes, blocked, dataIssues, rowCache: nextCache, snapped: new Set(patches.map(p => p.pageId)) };
}

export async function getProgrammePlan({ projectId = null } = {}) {
  const store = await getHubStore();
  const [snaps, cache] = await Promise.all([loadSnaps(store), store.getJSON(ACTUALS_KEY)]);
  const today = londonToday();
  const plan = programmePlan(snaps, cache || {}, { today, projectId });
  return { mode: programmeMode(), today, changes: plan.changes, blocked: plan.blocked, dataIssues: plan.dataIssues };
}

// Notion properties for one change. Throws if anything outside Adj / Reissue Reason slips in.
export function changeProperties(change) {
  const properties = {};
  for (const [prop, iso] of Object.entries(change.fields || {})) {
    if (!ADJ_PROP_SET.has(prop) || isProtectedProp(prop)) throw bad(`Refused to write ${prop}`);
    properties[prop] = { date: iso ? { start: iso } : null };
  }
  for (const [prop, val] of Object.entries(change.selects || {})) {
    if (prop !== 'Reissue Reason') throw bad(`Refused to write ${prop}`);
    properties[prop] = { select: val ? { name: val } : null };
  }
  return properties;
}

async function patchTasks(store, written) {
  if (!written.size) return;
  const snap = await readSnapshot(store, 'tasks');
  await store.setJSON(snapKey('tasks'), { ...snap, rows: snap.rows.map(r => written.get(r.id) || r) });
}

/** Apply the plan. ids = only these items; deadline = stop starting writes after (ms epoch). */
export async function applyProgramme({ ids, projectId = null, deadline, max = Infinity } = {}) {
  const store = await getHubStore();
  const [snaps, cache] = await Promise.all([loadSnaps(store), store.getJSON(ACTUALS_KEY)]);
  const plan = programmePlan(snaps, cache || {}, { projectId });
  const wanted = ids?.length ? new Set(ids) : null;
  const todo = plan.changes.filter(c => !wanted || wanted.has(c.id)).slice(0, max);
  const done = [], failed = [], written = new Map();
  for (const c of todo) {
    if (deadline && Date.now() > deadline) break;
    try {
      const page = await withRetry(() => notion().pages.update({ page_id: c.id, properties: changeProperties(c) }));
      written.set(c.id, mapPage('tasks', page));
      done.push({ id: c.id, title: c.title, count: c.count, snapped: c.snapped });
    } catch (err) {
      failed.push({ id: c.id, title: c.title, error: err.message });
    }
    await sleep(GAP_MS);
  }
  // Remember the Actuals seen for rows that were written, and for rows with no
  // snap pending (nothing to lose by recording them). A snap that wasn't written
  // stays unrecorded so it's offered again next time.
  const next = { ...(cache || {}) };
  for (const [id, seen] of Object.entries(plan.rowCache)) {
    if (written.has(id) || !plan.snapped.has(id)) next[id] = seen;
  }
  await store.setJSON(ACTUALS_KEY, next);
  await patchTasks(store, written);
  const left = Math.max(0, todo.length - done.length - failed.length);
  return { done, failed, blocked: plan.blocked, remaining: wanted ? left : left + (plan.changes.length - todo.length) };
}

// ── Item inputs ─────────────────────────────────────────────────────────────
// body: { manualDtStart: { s5?: 'YYYY-MM-DD'|null, c01?: … }, reissueReason, programmeDriven,
//         dateOfInstruction, accel: { accS5ReviewDays: 2, … } }
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const START_PROP = { s5: '2nd DT Start (Adj)', c01: 'Constr. DT Start (Adj)' };

export async function updateProgrammeItem(id, body = {}) {
  const store = await getHubStore();
  const tasks = (await readSnapshot(store, 'tasks')).rows;
  const task = tasks.find(t => t.id === id);
  if (!task) throw bad('Item not found', 404);
  const props = {};
  if (body.manualDtStart) {
    const marks = new Set(task.sched?.manualDtStart || []);
    for (const [key, iso] of Object.entries(body.manualDtStart)) {
      const opt = MANUAL_DT_START_OPTS[key];
      if (!opt) throw bad(`No manual DT Start for ${key}`);
      if (iso && !ISO.test(iso)) throw bad('Dates must be YYYY-MM-DD');
      if (iso) { marks.add(opt); props[START_PROP[key]] = { date: { start: iso } }; } else marks.delete(opt);
    }
    props[MANUAL_DT_START_PROP] = { multi_select: [...marks].map(name => ({ name })) };
  }
  if (body.reissueReason !== undefined) {
    if (body.reissueReason && !REISSUE_REASONS.includes(body.reissueReason)) throw bad('Unknown reissue reason');
    props['Reissue Reason'] = { select: body.reissueReason ? { name: body.reissueReason } : null };
  }
  if (body.programmeDriven !== undefined) props['Programme-driven'] = { checkbox: !!body.programmeDriven };
  if (body.dateOfInstruction !== undefined) {
    if (body.dateOfInstruction && !ISO.test(body.dateOfInstruction)) throw bad('Dates must be YYYY-MM-DD');
    props['Date of Instruction'] = { date: body.dateOfInstruction ? { start: body.dateOfInstruction } : null };
  }
  for (const [k, v] of Object.entries(body.accel || {})) {
    const prop = ACCEL_PROPS[k];
    if (!prop) throw bad(`Unknown acceleration field ${k}`);
    props[prop] = { number: v === null || v === '' ? null : Math.max(0, Number(v)) };
  }
  if (Object.keys(props).some(isProtectedProp)) throw bad('Plan and Actual properties are never written');
  if (!Object.keys(props).length) throw bad('Nothing to change');

  const page = await withRetry(() => notion().pages.update({ page_id: id, properties: props }));
  const row = mapPage('tasks', page);
  const snap = await readSnapshot(store, 'tasks');
  await store.setJSON(snapKey('tasks'), { ...snap, rows: snap.rows.map(r => (r.id === id ? row : r)) });
  // Re-sync the item's Adj dates straight away (the Scheduling Tool pushed on edit too)
  const sync = await applyProgramme({ ids: [id] }).catch(err => ({ error: err.message }));
  const latest = (await readSnapshot(store, 'tasks')).rows.find(r => r.id === id) || row;
  return { row: latest, sync };
}

// ── Project periods and squeeze minimums ────────────────────────────────────
// body: { periods: { clientReview: 5, mobilisation: null, … }, minimums: { qa: 1, … } }
export async function updateProgrammeProject(id, body = {}) {
  const props = {};
  const n = v => (v === null || v === '' ? null : Number(v));
  for (const [k, v] of Object.entries(body.periods || {})) {
    if (!PROJECT_PERIOD_PROPS[k]) throw bad(`Unknown period ${k}`);
    if (n(v) !== null && !(n(v) >= 0)) throw bad('Periods are whole working days, 0 or more');
    props[PROJECT_PERIOD_PROPS[k]] = { number: n(v) };
  }
  for (const [k, v] of Object.entries(body.minimums || {})) {
    if (!MIN_PROJECT_PROPS[k]) throw bad(`Unknown minimum ${k}`);
    if (n(v) !== null && !(n(v) >= 1)) throw bad('Minimums are at least 1 working day');
    props[MIN_PROJECT_PROPS[k]] = { number: n(v) };
  }
  if (!Object.keys(props).length) throw bad('Nothing to change');
  const page = await withRetry(() => notion().pages.update({ page_id: id, properties: props }));
  const row = mapPage('projects', page);
  const store = await getHubStore();
  const snap = await readSnapshot(store, 'projects');
  await store.setJSON(snapKey('projects'), { ...snap, rows: snap.rows.map(r => (r.id === id ? row : r)) });
  // New periods move the project's dates: write them now, as an item edit does
  const sync = await applyProgramme({ projectId: id, deadline: Date.now() + 8000 }).catch(err => ({ error: err.message }));
  return { row, sync };
}

