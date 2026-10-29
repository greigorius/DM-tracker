// Write side: write to Notion, map the returned page, patch it into the
// snapshot blob, log an event, return the row. The snapshot is correct
// immediately, without waiting for the 5-minute sync.

import { DATA_SOURCES, snapKey, HIDDEN_PARTY } from './config.js';
import { getHubStore } from './store.js';
import { notion, withRetry } from './notion.js';
import { mapPage } from './mappers.js';
import { readSnapshot, appendEvents } from './sync.js';
import { eventForNewRow, eventsForItemChange, londonToday } from './derive.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const text = s => [{ type: 'text', text: { content: String(s).slice(0, 1990) } }];
const sel = name => ({ select: name ? { name } : null });
const date = iso => ({ date: iso ? { start: iso } : null });
const rel = ids => ({ relation: (ids || []).filter(Boolean).map(id => ({ id })) });
const noHidden = (v, field) => { if (v && HIDDEN_PARTY.test(v)) throw bad(`"${v}" is not a valid ${field}; use DM`); return v; };

async function patchSnapshot(db, row) {
  const store = await getHubStore();
  const snap = await readSnapshot(store, db);
  const rows = snap.rows.filter(r => r.id !== row.id);
  if (!row.archived) rows.push(row);
  await store.setJSON(snapKey(db), { ...snap, rows });
  return store;
}

async function itemsIndex() {
  const store = await getHubStore();
  const snap = await readSnapshot(store, 'tasks');
  return new Map(snap.rows.map(r => [r.id, r]));
}

async function create(db, properties) {
  const page = await withRetry(() => notion().pages.create({ parent: { type: 'data_source_id', data_source_id: DATA_SOURCES[db] }, properties }));
  const row = mapPage(db, page);
  const store = await patchSnapshot(db, row);
  const event = eventForNewRow(db, row, await itemsIndex(), 'Cockpit');
  if (event) await appendEvents(store, [event]);
  return { row, event };
}

// ── Note / Action → Actions & Info ───────────────────────────────────────────
export async function createAction(body) {
  const { itemId, type = 'Action', text: t, bic, due, blocks } = body || {};
  if (!t?.trim()) throw bad('Text is required');
  if (!['Action', 'Note'].includes(type)) throw bad('Type must be Action or Note');
  const isNote = type === 'Note';
  const props = {
    Note: { title: text(t.trim()) },
    Type: sel(type),
    Items: rel([itemId]),
    Source: sel('Manual'),
    Received: date(londonToday()),
    'Blocks Item': { checkbox: !isNote && !!blocks },
  };
  if (!isNote) {
    props['Ball in Court'] = sel(noHidden(bic || 'DM', 'Ball in Court'));
    if (due) props.Due = date(due);
  }
  return create('actions', props);
}

// ── RFI ──────────────────────────────────────────────────────────────────────
export async function createRfi(body) {
  const { itemId, question, bic, due } = body || {};
  if (!question?.trim()) throw bad('Question is required');
  noHidden(bic, 'Ball in Court');
  const store = await getHubStore();
  const rfis = await readSnapshot(store, 'rfis');
  const next = Math.max(0, ...rfis.rows.map(r => r.number || 0)) + 1;
  const q = question.trim();
  const toDm = !bic || bic === 'DM';
  const props = {
    'RFI Description': { title: text(q.length > 90 ? `${q.slice(0, 87)}…` : q) },
    Question: { rich_text: text(q) },
    'RFI Number': { number: next },
    'RFI Status': sel(toDm ? 'Raise' : 'Open'),
    'Date Raised': date(londonToday()),
    'Related Item(s)': rel([itemId]),
  };
  if (!toDm) props['TBC by'] = sel(bic);
  if (due) props['Response Due'] = date(due);
  return create('rfis', props);
}

// ── Variation (VC number comes from the Notion unique ID: VC-0001…) ─────────
export async function createVariation(body) {
  const { itemId, description, raisedBy } = body || {};
  if (!description?.trim()) throw bad('Description is required');
  return create('variations', {
    'Variation Description': { title: text(description.trim()) },
    'Raised By': sel(noHidden(raisedBy || 'DM', 'Raised By')),
    'Variation Status': sel('Awaiting Design Info'),
    'Change Request Date': date(londonToday()),
    Items: rel([itemId]),
  });
}

// ── Status / BIC / Assigned DT on an item (Tasks DB) ────────────────────────
export async function updateItem(id, body) {
  if (!id) throw bad('Item id is required');
  const { status, bic, dtId } = body || {};
  const props = {};
  if (status !== undefined) props['Item Status'] = { status: status ? { name: status } : null };
  if (bic !== undefined) props['Ball In Court'] = sel(noHidden(bic, 'Ball In Court'));
  if (dtId !== undefined) props.Person = rel(dtId ? [dtId] : []);
  if (!Object.keys(props).length) throw bad('Nothing to update');
  // Programme / delivery dates are deliberately not writable here: the
  // Scheduling Tool is the only place they are set.

  const store = await getHubStore();
  const prev = (await readSnapshot(store, 'tasks')).rows.find(r => r.id === id) || null;
  const page = await withRetry(() => notion().pages.update({ page_id: id, properties: props }));
  const row = mapPage('tasks', page);
  await patchSnapshot('tasks', row);
  const events = eventsForItemChange(prev, row, 'Cockpit');
  if (dtId !== undefined && prev && (prev.dtIds[0] || null) !== (dtId || null)) {
    events.push({ ...events[0], id: `dt:${id}:${Date.now()}`, kind: 'status', summary: `${row.title}: DT reassigned`, at: row.editedAt, itemId: id, projectId: row.projectId, source: 'Cockpit', refId: id, url: row.url, blocking: false });
  }
  await appendEvents(store, events.filter(Boolean));
  return { row, events };
}
