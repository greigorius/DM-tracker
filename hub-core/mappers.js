// Notion page → flattened snapshot row. Pure functions, no SDK import.
// Rows hold plain values only (strings, numbers, booleans, id arrays).

import { HIDDEN_PARTY } from './config.js';

// ── Property readers ─────────────────────────────────────────────────────────
const P = (page, name) => page.properties?.[name];

export function plain(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case 'title':            return prop.title.map(t => t.plain_text).join('').trim() || null;
    case 'rich_text':        return prop.rich_text.map(t => t.plain_text).join('').trim() || null;
    case 'select':           return prop.select?.name ?? null;
    case 'status':           return prop.status?.name ?? null;
    case 'multi_select':     return prop.multi_select.map(o => o.name);
    case 'date':             return prop.date?.start ?? null;
    case 'checkbox':         return !!prop.checkbox;
    case 'number':           return prop.number ?? null;
    case 'url':              return prop.url ?? null;
    case 'email':            return prop.email ?? null;
    case 'relation':         return prop.relation.map(r => r.id);
    case 'people':           return prop.people.map(p => p.name).filter(Boolean);
    case 'unique_id':        return prop.unique_id?.number ?? null;
    case 'created_time':     return prop.created_time ?? null;
    case 'last_edited_time': return prop.last_edited_time ?? null;
    case 'formula': {
      const f = prop.formula;
      if (!f) return null;
      if (f.type === 'date') return f.date?.start ?? null;
      return f[f.type] ?? null;
    }
    case 'rollup': {
      const r = prop.rollup;
      if (!r) return null;
      if (r.type === 'array') return r.array.map(plain).flat().filter(v => v != null);
      if (r.type === 'date') return r.date?.start ?? null;
      return r[r.type] ?? null;
    }
    default: return null;
  }
}

const v = (page, name) => plain(P(page, name));
const ids = (page, name) => v(page, name) || [];
const party = val => (val && HIDDEN_PARTY.test(val) ? 'DM' : val); // "Axiom" never leaves the server
const day = iso => (iso ? iso.slice(0, 10) : null);

function base(page) {
  return {
    id: page.id,
    url: page.url,
    createdAt: page.created_time,
    editedAt: page.last_edited_time,
    archived: !!(page.archived || page.in_trash),
  };
}

// ── Per-DB mappers ───────────────────────────────────────────────────────────
export const mappers = {
  tasks: page => ({
    ...base(page),
    title: v(page, 'Item Name'),
    status: v(page, 'Item Status'),
    bic: party(v(page, 'Ball In Court')),
    projectId: ids(page, 'Projects')[0] ?? null,
    dtIds: ids(page, 'Person'),
    dmPhase: v(page, 'DM Phase'),
    priority: v(page, 'Priority'),
    blocker: v(page, 'Blocker') || [],
    blockerNote: v(page, 'Blocker Note'),
    lockStatus: v(page, 'Lock Status'),
    drawingRef: v(page, 'Drawing Ref'),
    dates: {
      instruction: day(v(page, 'Date of Instruction')),
      dt1Start: day(v(page, '1st DT Start (Plan)')),
      sub1: day(v(page, '1st Submission Date (Adj)')) || day(v(page, '1st Submission Date (Plan)')),
      sub2: day(v(page, '2nd Submission Date (Adj)')) || day(v(page, '2nd Submission Date (Plan)')),
      constrSub: day(v(page, 'Constr. Submission Date (Adj)')) || day(v(page, 'Constr. Submission Date (Plan)')),
      production: day(v(page, 'Production Date (Actual)')) || day(v(page, 'Production Date (Plan)')),
      install: day(v(page, 'Install Date (Actual)')) || day(v(page, 'Install Date (Plan)')),
      woRaised: day(v(page, 'WO Raised')),
    },
  }),

  rfis: page => ({
    ...base(page),
    number: v(page, 'RFI Number'),
    title: v(page, 'RFI Description'),
    question: v(page, 'Question'),
    status: v(page, 'RFI Status'),
    tbcBy: party(v(page, 'TBC by')),
    bic: party(v(page, 'Ball in Court')),
    stopsWork: v(page, 'Stops Work'),
    itemIds: ids(page, 'Related Item(s)'),
    raised: day(v(page, 'Date Raised')),
    due: day(v(page, 'Response Due')),
    responded: day(v(page, 'Date Responded')),
    closed: day(v(page, 'Date Closed')),
  }),

  variations: page => {
    const n = v(page, 'ID');
    return {
      ...base(page),
      number: n,
      code: n != null ? `VC-${String(n).padStart(4, '0')}` : null,
      title: v(page, 'Variation Description'),
      status: v(page, 'Variation Status'),
      type: v(page, 'Variation Type'),
      raisedBy: party(v(page, 'Raised By')),
      tbcBy: (v(page, 'TBC by') || []).map(party),
      bic: party(v(page, 'Ball in Court')),
      instructed: v(page, 'Instructed Change'),
      itemIds: ids(page, 'Items'),
      requested: day(v(page, 'Change Request Date')),
      decision: day(v(page, 'Decision Date')),
    };
  },

  submissions: page => ({
    ...base(page),
    title: v(page, 'Submission'),
    status: v(page, 'Status'),
    stage: v(page, 'Stage'),
    revision: v(page, 'Revision'),
    bic: party(v(page, 'Ball In Court')),
    blocked: v(page, 'Blocked'),
    grade: v(page, 'Client Grade'),
    dmAction: v(page, 'DM Action'),
    itemIds: ids(page, 'Item'),
    drawingIds: ids(page, 'Drawing'),
    dtIds: ids(page, 'DT'),
    submitted: day(v(page, 'Submitted')),
    reviewed: day(v(page, 'Reviewed')),
    issued: day(v(page, 'Issued')),
  }),

  drawings: page => ({
    ...base(page),
    title: v(page, 'Drawing Number'),
    name: v(page, 'Drawing Title 1'),
    status: v(page, 'Drawing Status'),
    stage: v(page, 'Submission Stage'),
    rev: v(page, 'Rev'),
    itemIds: ids(page, 'Item'),
    lockStatus: v(page, 'Lock Status'),
  }),

  actions: page => ({
    ...base(page),
    title: v(page, 'Note'),
    type: v(page, 'Type') || 'Action',
    bic: party(v(page, 'Ball in Court')),
    due: day(v(page, 'Due')),
    done: v(page, 'Checked'),
    blocks: v(page, 'Blocks Item'),
    itemIds: ids(page, 'Items'),
    personIds: ids(page, 'Person'),
    category: v(page, 'Category'),
    source: v(page, 'Source'),
    from: v(page, 'From'),
    received: day(v(page, 'Received')),
  }),

  todo: page => ({
    ...base(page),
    title: v(page, 'Item Description'),
    status: v(page, 'Status'),
    done: v(page, 'Task Done'),
    itemIds: ids(page, 'Item'),
    personIds: ids(page, 'Person'),
    start: day(v(page, 'Start Date')),
    end: day(v(page, 'End Date (Manual)')),
  }),

  projects: page => ({
    ...base(page),
    title: v(page, 'Project Name'),
    status: v(page, 'Status'),
    clientIds: ids(page, 'Client'),
    ownerIds: ids(page, 'Owner'),
    start: day(v(page, 'Start Date')),
    end: day(v(page, 'End Date')),
  }),

  clients: page => ({
    ...base(page),
    title: v(page, 'Company'),
  }),

  team: page => ({
    ...base(page),
    title: v(page, 'Name'),
    role: v(page, 'Role'),
    email: v(page, 'Email'),
  }),
};

export function mapPage(db, page) {
  const fn = mappers[db];
  if (!fn) throw new Error(`No mapper for ${db}`);
  return fn(page);
}
