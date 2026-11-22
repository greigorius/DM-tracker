// Triage inbox (workspace spec §3): every open record that isn't fully filed.
// A record leaves the inbox once it has everything it needs:
//   Action    item · ball in court · responsible (to match BIC) · due
//   Note      item
//   To-do     item · person · end date · est hours
//   RFI       item · TBC by · response due
//   Variation item · type · raised by
import { OPEN_RFI_STATUSES, isOpenVc } from '../../../hub-core/derive.js';
import { partyFor } from '../actions/party.js';

export const INBOX_DBS = ['actions', 'rfis', 'variations', 'todo', 'team'];
export const FIELD_LABEL = { item: 'item', bic: 'ball in court', responsible: 'responsible', due: 'due date', person: 'DT', end: 'end date', hours: 'est hours', tbcBy: 'TBC by', type: 'type', raisedBy: 'raised by' };

const has = v => (Array.isArray(v) ? v.length > 0 : v != null && v !== '');

export function missingOf(db, kind, r) {
  const m = [];
  if (!has(r.itemIds)) m.push('item');
  if (db === 'actions' && kind === 'Action') {
    if (!r.bic) m.push('bic');
    else {
      const p = partyFor(r.bic);
      const ok = p.kind === 'person' ? has(r.personIds) : p.kind === 'company' ? has(r.companyIds) : has(r.contact);
      if (!ok) m.push('responsible');
    }
    if (!r.due) m.push('due');
  }
  if (db === 'todo') {
    if (!has(r.personIds)) m.push('person');
    if (!r.end) m.push('end');
    if (!(Number(r.hours) > 0)) m.push('hours');
  }
  if (db === 'rfis') { if (!r.tbcBy) m.push('tbcBy'); if (!r.due) m.push('due'); }
  if (db === 'variations') { if (!r.type) m.push('type'); if (!r.raisedBy) m.push('raisedBy'); }
  return m;
}

function open(snaps) {
  const out = [];
  for (const a of snaps.actions || []) if (!a.archived && !a.done) out.push({ db: 'actions', kind: a.type === 'Note' ? 'Note' : 'Action', row: a, at: a.received || a.createdAt });
  for (const r of snaps.rfis || []) if (!r.archived && OPEN_RFI_STATUSES.has(r.status)) out.push({ db: 'rfis', kind: 'RFI', row: r, at: r.raised || r.createdAt });
  for (const v of snaps.variations || []) if (!v.archived && isOpenVc(v)) out.push({ db: 'variations', kind: 'Variation', row: v, at: v.requested || v.createdAt });
  for (const t of snaps.todo || []) if (!t.archived && !t.done) out.push({ db: 'todo', kind: 'To-do', row: t, at: t.start || t.createdAt });
  return out;
}

/** Records still missing something, newest first, each with `missing`. */
export function inboxRecords(snaps) {
  return open(snaps).map(r => ({ ...r, missing: missingOf(r.db, r.kind, r.row) })).filter(r => r.missing.length)
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
}

/** Complete records created today: shown as "Filed today" so you can see where they went. */
export function filedToday(snaps, today) {
  return open(snaps).filter(r => (r.row.createdAt || '').slice(0, 10) === today && !missingOf(r.db, r.kind, r.row).length);
}

// Kept for older callers
export const unlinkedRecords = inboxRecords;
