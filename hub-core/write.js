// Write side: write to Notion, map the returned page, patch it into the
// snapshot blob, log an event, return the row. The snapshot is correct
// immediately, without waiting for the 5-minute sync.

import { DATA_SOURCES, snapKey, HIDDEN_PARTY } from './config.js';
import { getHubStore } from './store.js';
import { notion, withRetry } from './notion.js';
import { mapPage } from './mappers.js';
import { readSnapshot, appendEvents } from './sync.js';
import { DISMISSED_KEY } from './read.js';
import { eventForNewRow, eventsForItemChange, londonToday } from './derive.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const text = s => [{ type: 'text', text: { content: String(s).slice(0, 1990) } }];
const sel = name => ({ select: name ? { name } : null });
const date = iso => ({ date: iso ? { start: iso } : null });
const rel = ids => ({ relation: (ids || []).filter(Boolean).map(id => ({ id })) });
const noHidden = (v, field) => { if (v && HIDDEN_PARTY.test(v)) throw bad(`"${v}" is not a valid ${field}; use DM`); return v; };

// Snapshot upkeep after a Notion write. Notion is the source of truth: if the
// blob store has a problem the write still succeeds and the next sync repairs
// the copy, so these never throw.
async function patchSnapshot(db, row) {
  try {
    const store = await getHubStore();
    const snap = await readSnapshot(store, db);
    const rows = snap.rows.filter(r => r.id !== row.id);
    if (!row.archived) rows.push(row);
    await store.setJSON(snapKey(db), { ...snap, rows });
    return store;
  } catch (err) {
    console.error(`[hub-store] could not patch ${db} snapshot:`, err.message);
    return null;
  }
}

// Snapshot reads used only for context (previous row, events): null on a store problem.
async function snapshotRows(db) {
  try { return (await readSnapshot(await getHubStore(), db)).rows; }
  catch (err) { console.error(`[hub-store] could not read ${db} snapshot:`, err.message); return null; }
}

async function logEvents(store, events) {
  if (!store || !events?.length) return;
  try { await appendEvents(store, events); }
  catch (err) { console.error('[hub-store] could not log events:', err.message); }
}

// A page that was archived / trashed / deleted in Notion after the last full
// sync (incremental syncs can't see that: Notion's queries skip archived pages).
const isGone = err => err?.code === 'object_not_found'
  || (err?.code === 'validation_error' && /archived|in trash/i.test(err.message || ''));

async function dropFromSnapshot(db, id) {
  try {
    const store = await getHubStore();
    const snap = await readSnapshot(store, db);
    if (snap.rows.some(r => r.id === id)) await store.setJSON(snapKey(db), { ...snap, rows: snap.rows.filter(r => r.id !== id) });
  } catch (err) {
    console.error(`[hub-store] could not drop from ${db} snapshot:`, err.message);
  }
}

// pages.update, but a page that's already gone from Notion is removed from the
// Hub and reported clearly (410) instead of Notion's "unarchive the block".
async function updatePage(db, id, args) {
  try {
    return await withRetry(() => notion().pages.update({ page_id: id, ...args }));
  } catch (err) {
    if (!isGone(err)) throw err;
    await dropFromSnapshot(db, id);
    throw bad('This was archived or deleted in Notion, so it has been removed from the Hub. Restore it in Notion to edit it.', 410);
  }
}

async function itemsIndex() {
  return new Map((await snapshotRows('tasks') || []).map(r => [r.id, r]));
}

async function create(db, properties) {
  const page = await withRetry(() => notion().pages.create({ parent: { type: 'data_source_id', data_source_id: DATA_SOURCES[db] }, properties }));
  const row = mapPage(db, page);
  const store = await patchSnapshot(db, row);
  const event = eventForNewRow(db, row, await itemsIndex(), 'Cockpit');
  if (event) await logEvents(store, [event]);
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
  let rows = await snapshotRows('rfis');
  if (!rows) {
    const res = await withRetry(() => notion().dataSources.query({ data_source_id: DATA_SOURCES.rfis, page_size: 1, sorts: [{ property: 'RFI Number', direction: 'descending' }] }));
    rows = res.results.map(pg => mapPage('rfis', pg));
  }
  const next = Math.max(0, ...rows.map(r => r.number || 0)) + 1;
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

  const prev = (await snapshotRows('tasks'))?.find(r => r.id === id) || null;
  const page = await updatePage('tasks', id, { properties: props });
  const row = mapPage('tasks', page);
  const store = await patchSnapshot('tasks', row);
  const events = eventsForItemChange(prev, row, 'Cockpit');
  if (dtId !== undefined && prev && (prev.dtIds[0] || null) !== (dtId || null)) {
    events.push({ ...events[0], id: `dt:${id}:${Date.now()}`, kind: 'status', summary: `${row.title}: DT reassigned`, at: row.editedAt, itemId: id, projectId: row.projectId, source: 'Cockpit', refId: id, url: row.url, blocking: false });
  }
  await logEvents(store, events.filter(Boolean));
  return { row, events };
}

// ── Generic record edits (Triage) ───────────────────────────────────────────
// Whitelisted fields per DB: [Notion property, kind]. Anything else is refused.
const FIELD_MAP = {
  actions: {
    title: ['Note', 'title'], // description: a manual fix to a meeting / email transcription
    bic: ['Ball in Court', 'select'], dtId: ['Person', 'rel1'], due: ['Due', 'date'], itemIds: ['Items', 'rel'],
    done: ['Checked', 'check'], blocks: ['Blocks Item', 'check'],
  },
  tasks: {
    status: ['Item Status', 'status'], bic: ['Ball In Court', 'select'], dtId: ['Person', 'rel1'], dmPhase: ['DM Phase', 'select'],
    blocker: ['Blocker', 'multi'], blockerNote: ['Blocker Note', 'text'], lockStatus: ['Lock Status', 'check'],
    // Inputs the Scheduling Tool reads (never its calculated dates):
    instruction: ['Date of Instruction', 'date'], holdDays: ['Hold Days', 'number'],
    s4StartAct: ['1st DT Start (Actual)', 'date'], s4DelAct: ['1st DT Delivery (Actual)', 'date'],
    s5StartAct: ['2nd DT Start (Actual)', 'date'], s5DelAct: ['2nd DT Delivery (Actual)', 'date'],
    cStartAct: ['Constr. DT Start (Actual)', 'date'], cDelAct: ['Constr. DT Delivery (Actual)', 'date'],
  },
  rfis: {
    status: ['RFI Status', 'select'], tbcBy: ['TBC by', 'select'], stopsWork: ['Stops Work', 'check'],
    responded: ['Date Responded', 'date'], due: ['Response Due', 'date'], itemIds: ['Related Item(s)', 'rel'],
  },
  variations: {
    status: ['Variation Status', 'select'], decision: ['Decision Date', 'date'], addedDays: ['Added Days', 'number'],
    pauseOverride: ['Pause Override', 'select'], itemIds: ['Items', 'rel'], raisedBy: ['Raised By', 'select'],
  },
  submissions: { dtId: ['DT', 'rel1'] },
  todo: {
    title: ['Item Description', 'title'], status: ['Status', 'select'], personIds: ['Person', 'rel'], personId: ['Person', 'rel1'], itemIds: ['Item', 'rel'],
    start: ['Start Date', 'date'], end: ['End Date (Manual)', 'date'], hours: ['Task Hours (Est)', 'number'],
    changeTask: ['Change Task', 'check'], vcIds: ['Related Variation', 'rel'], rfiIds: ['Related RFI', 'rel'],
  },
  meetings: { itemIds: ['Items', 'rel'] },
  team: { email: ['Email', 'email'], role: ['Role', 'select'], capacity: ['Weekly Capacity (hrs)', 'number'] },
};
// Until Task Done is deleted, a To Do Status write also ticks/unticks it so old
// Notion views stay right. Set TODO_MIRROR_TASK_DONE=off once it's gone.
const mirrorTaskDone = () => process.env.TODO_MIRROR_TASK_DONE !== 'off';
const PARTY_FIELDS = new Set(['bic', 'tbcBy', 'raisedBy']);

function toProp(kind, value) {
  switch (kind) {
    case 'select': return sel(value || null);
    case 'status': return { status: value ? { name: value } : null };
    case 'multi': return { multi_select: (value || []).map(name => ({ name })) };
    case 'date': return date(value || null);
    case 'check': return { checkbox: !!value };
    case 'number': return { number: value === '' || value == null ? null : Number(value) };
    case 'text': return { rich_text: value ? text(value) : [] };
    case 'rel': return rel(value || []);
    case 'rel1': return rel(value ? [value] : []);
    case 'title': return { title: text(value || '') };
    case 'email': return { email: value ? String(value).trim() : null };
    default: throw bad(`Unknown field kind ${kind}`);
  }
}

/**
 * PATCH /api/records/:db/:id  { set: { field: value }, chase?: string }
 * `chase` (actions only) prepends a dated line to Response Log, as Daily Triage did.
 */
export async function updateRecord(db, id, body) {
  const map = FIELD_MAP[db];
  if (!map) throw bad(`Records in ${db} can't be edited here`);
  const { set = {}, chase } = body || {};
  const props = {};
  for (const [field, value] of Object.entries(set)) {
    const spec = map[field];
    if (!spec) throw bad(`Field ${field} can't be edited on ${db}`);
    if (PARTY_FIELDS.has(field)) noHidden(value, field);
    if (spec[1] === 'title' && !String(value ?? '').trim()) throw bad('The description can\'t be empty');
    if (db === 'todo' && field === 'status' && value && !['Not Started', 'In Progress', 'Blocked', 'Done'].includes(value)) throw bad(`Unknown status ${value}`);
    if (db === 'team' && field === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim())) throw bad('That email address doesn’t look right');
    props[spec[0]] = toProp(spec[1], value);
  }
  if (db === 'todo' && 'status' in set && mirrorTaskDone()) props['Task Done'] = { checkbox: set.status === 'Done' };
  const prev = (await snapshotRows(db))?.find(r => r.id === id) || null;
  if (db === 'actions' && (chase || 'due' in set)) {
    const next = 'due' in set ? set.due : prev?.due;
    const line = `${londonToday()} — ${chase ? `chased: ${chase}` : 'due moved'}${next ? ` (next ${next})` : ''}`;
    props['Response Log'] = { rich_text: text(prev?.log ? `${line}\n${prev.log}` : line) };
  }
  if (!Object.keys(props).length) throw bad('Nothing to update');
  const page = await updatePage(db, id, { properties: props });
  const row = mapPage(db, page);
  const store = await patchSnapshot(db, row);
  const events = db === 'tasks' ? eventsForItemChange(prev, row, 'Triage') : [];
  await logEvents(store, events);
  return { row, events };
}

// POST /api/records/:db/:id/trash | /restore — Notion Trash keeps pages 30 days.
export async function trashRecord(db, id, restore = false) {
  if (!FIELD_MAP[db]) throw bad(`Records in ${db} can't be deleted here`);
  let page;
  try {
    page = await withRetry(() => notion().pages.update({ page_id: id, in_trash: !restore }));
  } catch (err) {
    if (!isGone(err)) throw err;
    // Deleting something Notion already archived: the job's done, just drop it from the Hub.
    if (!restore) { await dropFromSnapshot(db, id); return { row: { id, archived: true }, alreadyGone: true }; }
    page = await withRetry(() => notion().pages.update({ page_id: id, archived: false }));
  }
  const row = { ...mapPage(db, page), archived: !restore };
  await patchSnapshot(db, row);
  return { row };
}

// ── Action → To Do task ─────────────────────────────────────────────────────
// POST /api/actions/:id/to-task  { title?, personId?, start?, end?, hours?, changeTask?, vcId?, rfiId? }
// Creates the To Do row (linked back through "From Action"), then closes the
// action and logs the move in its Response Log. Refuses if already moved.
export async function actionToTask(id, body = {}) {
  // Read the action from Notion: proves it still exists (no orphan task) and doesn't depend on the snapshot
  const live = await withRetry(() => notion().pages.retrieve({ page_id: id })).catch(err => { if (isGone(err)) return null; throw err; });
  if (!live || live.archived || live.in_trash) {
    await dropFromSnapshot('actions', id);
    throw bad('This action was archived or deleted in Notion, so it has been removed from the Hub. Restore it in Notion to move it.', 410);
  }
  const action = mapPage('actions', live);
  if (action.taskIds?.length) throw bad('This action is already in Tasks', 409);
  const itemId = body.itemId || action.itemIds?.[0];
  if (!itemId) throw bad('Link the action to an item first');
  const title = (body.title || action.title || '').trim();
  if (!title) throw bad('Task description is required');
  const hours = body.hours === '' || body.hours == null ? null : Number(body.hours);
  if (hours != null && (!Number.isFinite(hours) || hours < 0)) throw bad('Hours must be a positive number');

  const props = {
    'Item Description': { title: text(title) },
    Item: rel([itemId]),
    Person: rel([body.personId || action.personIds?.[0]]),
    'Start Date': date(body.start || londonToday()),
    'End Date (Manual)': date(body.end || action.due || null),
    'Task Hours (Est)': { number: hours },
    'Change Task': { checkbox: !!body.changeTask },
    'Related Variation': rel([body.vcId]),
    'Related RFI': rel([body.rfiId]),
    Status: sel('Not Started'),
    ...(mirrorTaskDone() && { 'Task Done': { checkbox: false } }),
    'From Action': rel([id]),
  };
  const page = await withRetry(() => notion().pages.create({ parent: { type: 'data_source_id', data_source_id: DATA_SOURCES.todo }, properties: props }));
  const task = mapPage('todo', page);
  await patchSnapshot('todo', task);

  const ref = task.number != null ? `TD-${String(task.number).padStart(3, '0')}` : 'Tasks';
  const line = `${londonToday()} — moved to Tasks (${ref})`;
  const aPage = await updatePage('actions', id, { properties: {
    Checked: { checkbox: true },
    Task: rel([task.id]),
    'Response Log': { rich_text: text(action.log ? `${line}\n${action.log}` : line) },
  } });
  const actionRow = mapPage('actions', aPage);
  const store = await patchSnapshot('actions', actionRow);

  const event = eventForNewRow('todo', task, await itemsIndex(), 'Triage');
  if (event) await logEvents(store, [event]);
  return { row: task, action: actionRow, event };
}

// ── Duplicate actions ────────────────────────────────────────────────────────
// POST /api/duplicates/merge  { keep, drop }
// Keeps one action and deletes the other (Notion Trash, 30 days). Before the
// delete, the dropped action's wording and source go into the kept action's
// Response Log, its items are added, and its due date / ball in court fill
// any gaps.
export async function mergeDuplicate(body = {}) {
  const { keep, drop } = body;
  if (!keep || !drop || keep === drop) throw bad('Pick the action to keep and the one to delete');
  const live = async id => {
    const page = await withRetry(() => notion().pages.retrieve({ page_id: id })).catch(err => { if (isGone(err)) return null; throw err; });
    if (!page || page.archived || page.in_trash) {
      await dropFromSnapshot('actions', id);
      return null;
    }
    return mapPage('actions', page);
  };
  const [k, d] = await Promise.all([live(keep), live(drop)]);
  if (!k) throw bad('The action to keep was archived or deleted in Notion, so it has been removed from the Hub.', 410);
  if (!d) return { row: k, dropped: drop, alreadyGone: true };

  const meta = [d.source, d.from, d.received].filter(Boolean).join(', ');
  const line = `${londonToday()} — merged duplicate: "${d.title}"${meta ? ` (${meta})` : ''}`;
  const props = { 'Response Log': { rich_text: text([line, k.log, d.log && `[merged log] ${d.log}`].filter(Boolean).join('\n')) } };
  const itemIds = [...new Set([...(k.itemIds || []), ...(d.itemIds || [])])];
  if (itemIds.length !== (k.itemIds || []).length) props.Items = rel(itemIds);
  if (!k.due && d.due) props.Due = date(d.due);
  if (!k.bic && d.bic) props['Ball in Court'] = sel(d.bic);
  if (!k.personIds?.length && d.personIds?.length) props.Person = rel(d.personIds.slice(0, 1));
  if (d.blocks && !k.blocks) props['Blocks Item'] = { checkbox: true };

  const page = await updatePage('actions', keep, { properties: props });
  const row = mapPage('actions', page);
  await patchSnapshot('actions', row);
  await trashRecord('actions', drop);
  return { row, dropped: drop };
}

// "Not a duplicate": remembered in the Hub store so the pair isn't raised again.
export async function dismissDuplicate(body = {}) {
  const key = String(body.key || '');
  if (!/^[\w-]+\|[\w-]+$/.test(key)) throw bad('Unknown pair');
  const store = await getHubStore();
  const cur = (await store.getJSON(DISMISSED_KEY)) || [];
  const next = body.undo ? cur.filter(x => x !== key) : [...new Set([key, ...cur])].slice(0, 2000);
  await store.setJSON(DISMISSED_KEY, next);
  return { dismissed: next };
}
