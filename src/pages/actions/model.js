// Actions tracker model (spec claude/item-tracker-spec.md §10): A&I actions and
// To Do tasks normalised to one row shape, plus the chase groups and views.
// Pure functions, shared by the page and the Excel round trip.

export const AI_STATUSES = ['Not issued', 'Open', 'Chasing', 'Response in', 'Closed'];
export const TASK_STATUSES = ['Not Started', 'In Progress', 'Blocked', 'Done'];
export const TRADES = ['Metalwork', 'Glazing', 'Doors', 'AV', 'M&E', 'Fire', 'Joinery', 'General'];

// Who an action sits with → chase group (the meeting agenda)
export const GROUPS = {
  supplier: { label: 'Suppliers', bics: ['Supplier'] },
  external: { label: 'External', bics: ['Client', 'Architect', 'Contractor', 'Consultant'] },
  internal: { label: 'Internal', bics: ['Project Team', 'Production', 'Site', 'Document Control'] },
  dt: { label: 'DTs', bics: ['DT'] },
  dm: { label: 'Me (DM)', bics: ['DM'] },
};
export const groupOfBic = bic => Object.keys(GROUPS).find(k => GROUPS[k].bics.includes(bic)) || 'none';

const iso = d => d.toISOString().slice(0, 10);
export function dates(today) {
  const t = new Date(`${today}T12:00:00Z`);
  const dow = t.getUTCDay();
  const sun = new Date(t); sun.setUTCDate(t.getUTCDate() + ((7 - dow) % 7));
  const wkAgo = new Date(t); wkAgo.setUTCDate(t.getUTCDate() - 7);
  const in14 = new Date(t); in14.setUTCDate(t.getUTCDate() + 14);
  return { today, weekEnd: iso(sun), weekAgo: iso(wkAgo), in14: iso(in14) };
}
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

/** One row per open-or-recent A&I action (not notes) and To Do task. */
export function buildRows({ actions = [], todo = [], tasks = [], suppliers = [], team = [], projects = [] }) {
  const items = new Map(tasks.map(t => [t.id, t]));
  const sup = new Map(suppliers.map(s => [s.id, s.title]));
  const people = new Map(team.map(p => [p.id, p.title]));
  const proj = new Map(projects.map(p => [p.id, p.title]));
  const todoRef = new Map(todo.map(t => [t.id, t.number != null ? `TD-${String(t.number).padStart(3, '0')}` : 'To Do']));
  const out = [];
  for (const a of actions) {
    if (a.archived || a.type === 'Note') continue;
    const item = items.get(a.itemIds?.[0]);
    const moved = !!a.taskIds?.length;
    out.push({
      id: a.id, db: 'actions', src: 'Action', ref: 'A&I', url: a.url, raw: a,
      title: a.title || '(no text)', itemId: item?.id || null, itemName: item?.title || null,
      projectId: item?.projectId || null, projectName: item ? proj.get(item.projectId) || null : null,
      bic: a.bic || null, companyId: a.companyIds?.[0] || null, company: sup.get(a.companyIds?.[0]) || null,
      contact: a.contact || null, personId: a.personIds?.[0] || null, person: people.get(a.personIds?.[0]) || null,
      responsible: sup.get(a.companyIds?.[0]) || people.get(a.personIds?.[0]) || a.contact || null,
      raised: (a.received || a.createdAt || '').slice(0, 10) || null, due: a.due || null, chaseBy: a.chaseBy || null,
      status: moved ? 'Moved to Tasks' : a.done ? 'Closed' : a.chaseStatus || 'Open',
      closed: !!a.done || moved, closedOn: a.closedOn || (a.done ? (a.editedAt || '').slice(0, 10) : null),
      impact: a.blocks ? 'blocking' : item ? 'risk' : 'watch',
      nextAction: a.nextAction || null, closesWhen: a.closesWhen || null, trade: a.trade || [],
      source: a.source || null, from: a.from || null, log: a.log || null, editedAt: a.editedAt, moved,
      forTask: (a.forTaskIds || []).map(id => todoRef.get(id)).filter(Boolean),
    });
  }
  for (const t of todo) {
    if (t.archived) continue;
    const item = items.get(t.itemIds?.[0]);
    out.push({
      id: t.id, db: 'todo', src: 'Task', ref: t.number != null ? `TD-${String(t.number).padStart(3, '0')}` : 'To Do', url: t.url, raw: t,
      title: t.title || '(no text)', itemId: item?.id || null, itemName: item?.title || null,
      projectId: item?.projectId || null, projectName: item ? proj.get(item.projectId) || null : null,
      bic: 'DT', companyId: null, company: null, contact: null,
      personId: t.personIds?.[0] || null, person: people.get(t.personIds?.[0]) || null, responsible: people.get(t.personIds?.[0]) || null,
      raised: t.start || (t.createdAt || '').slice(0, 10) || null, due: t.end || null, chaseBy: null,
      status: t.status || 'Not Started', closed: !!t.done, closedOn: t.done ? (t.editedAt || '').slice(0, 10) : null,
      impact: t.status === 'Blocked' ? 'blocking' : item ? 'risk' : 'watch',
      nextAction: null, closesWhen: null, trade: [], source: 'To Do', from: null, log: null, editedAt: t.editedAt,
      hours: t.hours, changeTask: t.changeTask, start: t.start,
      waitingOn: actions.filter(a => !a.archived && !a.done && (a.forTaskIds || []).includes(t.id)).map(a => ({ id: a.id, bic: a.bic, title: a.title })),
    });
  }
  return out;
}

export const isOver = (r, d) => !r.closed && r.due && r.due < d.today;
export const dueSoon = (r, d) => !r.closed && r.due && !isOver(r, d) && daysBetween(d.today, r.due) <= 3;

export const DEFAULT_FILTER = { q: '', project: '', bic: '', company: '', group: '', status: 'open', due: '', src: '', trade: '', impact: '' };

export function matches(r, f, d) {
  if (f.status === 'open' && r.closed) return false;
  if (f.status === 'closed' && !r.closed) return false;
  if (f.status === 'closedWeek' && !(r.closed && r.closedOn && r.closedOn >= d.weekAgo)) return false;
  if (f.project && r.projectId !== f.project) return false;
  if (f.bic && r.bic !== f.bic) return false;
  if (f.group && groupOfBic(r.bic) !== f.group) return false;
  if (f.company && (f.company === '-' ? r.companyId : r.companyId !== f.company)) return false;
  if (f.src && r.src !== f.src) return false;
  if (f.trade && !r.trade.includes(f.trade)) return false;
  if (f.impact && r.impact !== f.impact) return false;
  if (f.due === 'overdue' && !isOver(r, d)) return false;
  if (f.due === 'week' && !(r.due && !r.closed && r.due <= d.weekEnd)) return false;
  if (f.due === '14' && !(r.due && !r.closed && r.due <= d.in14)) return false;
  if (f.due === 'none' && r.due) return false;
  if (f.q) {
    const t = [r.title, r.itemName, r.company, r.contact, r.person, r.ref, r.nextAction, r.from].filter(Boolean).join(' ').toLowerCase();
    if (!t.includes(f.q.toLowerCase())) return false;
  }
  return true;
}

// Saved views (chips). Each is a filter preset; group-by preset optional.
export const VIEWS = [
  { id: 'open', label: 'All open', f: {} },
  { id: 'supplier', label: 'Suppliers', f: { group: 'supplier' }, by: 'company' },
  { id: 'external', label: 'External', f: { group: 'external' }, by: 'bic' },
  { id: 'internal', label: 'Internal', f: { group: 'internal' }, by: 'bic' },
  { id: 'dt', label: 'DTs', f: { group: 'dt' }, by: 'responsible' },
  { id: 'dm', label: 'Me (DM)', f: { group: 'dm' }, by: 'item' },
  { id: 'overdue', label: 'Overdue', f: { due: 'overdue' } },
  { id: 'blocking', label: 'Blocking', f: { impact: 'blocking' } },
  { id: 'week', label: 'Due this week', f: { due: 'week' } },
  { id: 'metalwork', label: 'Metalwork', f: { trade: 'Metalwork' }, by: 'item' },
  { id: 'closedWeek', label: 'Closed this week', f: { status: 'closedWeek' } },
];

export const GROUP_BY = [
  { value: 'responsible', label: 'Responsible', key: r => r.responsible || 'Not set' },
  { value: 'company', label: 'Company', key: r => r.company || (r.src === 'Task' ? 'DT tasks' : 'No company') },
  { value: 'bic', label: 'Ball in court', key: r => r.bic || 'No ball in court' },
  { value: 'person', label: 'Person', key: r => r.person || 'Unassigned' },
  { value: 'item', label: 'Item', key: r => r.itemName || 'No item' },
  { value: 'project', label: 'Project', key: r => r.projectName || 'No project' },
  { value: '', label: 'None', key: () => '' },
];

export const SORTS = {
  due: (a, b) => (a.due || '9999').localeCompare(b.due || '9999'),
  age: (a, b) => (a.raised || '9999').localeCompare(b.raised || '9999'),
  impact: (a, b) => ({ blocking: 0, risk: 1, watch: 2 }[a.impact] - { blocking: 0, risk: 1, watch: 2 }[b.impact]) || (a.due || '9999').localeCompare(b.due || '9999'),
};
