// Pure derivations over snapshot rows. Shared by the server (bootstrap) and the
// client (optimistic updates, Triage filters). No Node or env imports here.

export const DONE_ITEM_STATUSES = new Set(['Complete', 'Omitted', 'Design Complete', 'Close Out', 'PC Approved']);
export const OPEN_RFI_STATUSES = new Set(['Raise', 'Open', 'Close Out']);
export const OPEN_VC_STATUSES = new Set(['Awaiting Design Info', 'Awaiting Instruction', null, undefined, '']);
export const CORE_BIC = ['DM', 'DT', 'Architect', 'Client'];
const HIDDEN = /axiom/i;

// ── Dates (Europe/London) ────────────────────────────────────────────────────
export function londonToday(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); // YYYY-MM-DD
}
export function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekEnd(today) {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = Sun
  return addDays(today, dow === 0 ? 0 : 7 - dow);
}

// ── Predicates ───────────────────────────────────────────────────────────────
export const isActiveItem = i => !i.archived && !DONE_ITEM_STATUSES.has(i.status);
export const isOpenAction = a => !a.archived && !a.done && a.type !== 'Note';
export const isOpenRfi = r => !r.archived && OPEN_RFI_STATUSES.has(r.status);
export const isOpenVc = vc => !vc.archived && OPEN_VC_STATUSES.has(vc.status);

// Filter definitions shared by the Cockpit count cards and /triage?filter=<key>.
export const FILTERS = {
  overdue: {
    label: 'Overdue',
    match: (s, t) => ({
      actions: (s.actions || []).filter(a => isOpenAction(a) && a.due && a.due < t.today),
      rfis: (s.rfis || []).filter(r => isOpenRfi(r) && r.due && r.due < t.today),
    }),
  },
  'due-week': {
    label: 'Due this week',
    match: (s, t) => ({
      actions: (s.actions || []).filter(a => isOpenAction(a) && a.due && a.due >= t.today && a.due <= t.weekEnd),
      rfis: (s.rfis || []).filter(r => isOpenRfi(r) && r.due && r.due >= t.today && r.due <= t.weekEnd),
    }),
  },
  'with-dts': {
    label: 'With DTs',
    match: s => ({ items: (s.tasks || []).filter(i => isActiveItem(i) && i.bic === 'DT') }),
  },
  'bic-dm': {
    label: 'BIC = DM',
    match: s => ({
      items: (s.tasks || []).filter(i => isActiveItem(i) && i.bic === 'DM'),
      actions: (s.actions || []).filter(a => isOpenAction(a) && a.bic === 'DM'),
    }),
  },
  'rfis-open': {
    label: 'Open RFIs',
    match: s => ({ rfis: (s.rfis || []).filter(isOpenRfi) }),
  },
  'vcs-open': {
    label: 'Open VCs',
    match: s => ({ variations: (s.variations || []).filter(isOpenVc) }),
  },
};

const len = o => Object.values(o).reduce((n, arr) => n + arr.length, 0);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function computeCounts(s, today = londonToday()) {
  const t = { today, weekEnd: weekEnd(today) };
  const m = Object.fromEntries(Object.entries(FILTERS).map(([k, f]) => [k, f.match(s, t)]));

  const dtCount = new Set(m['with-dts'].items.flatMap(i => i.dtIds)).size;
  const blocking = m['bic-dm'].actions.filter(a => a.blocks).length;

  return {
    overdue:    { value: len(m.overdue), sub: `${plural(m.overdue.actions.length, 'action')} · ${plural(m.overdue.rfis.length, 'RFI')}` },
    'due-week': { value: len(m['due-week']), sub: `${plural(m['due-week'].actions.length, 'action')} · ${plural(m['due-week'].rfis.length, 'RFI')}` },
    'with-dts': { value: len(m['with-dts']), sub: `across ${plural(dtCount, 'DT')}` },
    'bic-dm':   { value: len(m['bic-dm']), sub: `${plural(blocking, 'blocking item')}`, blocking },
    'rfis-open':{ value: len(m['rfis-open']), sub: `${m['rfis-open'].rfis.filter(r => r.stopsWork).length} stop work` },
    'vcs-open': { value: len(m['vcs-open']), sub: `${m['vcs-open'].variations.filter(v => v.status === 'Awaiting Instruction').length} awaiting instruction` },
  };
}

// Badge counts for the launch tiles.
export function computeTileCounts(s, counts) {
  const subs = s.submissions || [];
  return {
    brief: counts.overdue.value + counts['due-week'].value,
    triage: counts['bic-dm'].value,
    scheduling: null,
    'drawing-flow': subs.filter(x => !x.archived && x.bic === 'DM' && !['Complete', 'Graded'].includes(x.status)).length,
    'drawing-studio': null,
    rfis: counts['rfis-open'].value,
    variations: counts['vcs-open'].value,
    reports: null,
  };
}

// ── Lookups for dropdowns ────────────────────────────────────────────────────
const cleanOptions = list => (list || []).filter(o => o && !HIDDEN.test(o));

export function buildLookups(s, schema = {}) {
  const clients = new Map((s.clients || []).map(c => [c.id, c.title]));
  const projects = (s.projects || [])
    .filter(p => !p.archived && p.status !== 'Done')
    .map(p => ({ id: p.id, name: p.title || 'Untitled', client: clients.get(p.clientIds[0]) || null }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const projectIds = new Set(projects.map(p => p.id));

  const items = (s.tasks || [])
    .filter(i => isActiveItem(i) && projectIds.has(i.projectId))
    .map(i => ({ id: i.id, name: i.title || 'Untitled', projectId: i.projectId, status: i.status, bic: i.bic, dtIds: i.dtIds }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const dts = (s.team || [])
    .filter(t => !t.archived && t.role === 'DT')
    .map(t => ({ id: t.id, name: t.title }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const itemBic = cleanOptions(schema.taskBic);
  const bic = [...CORE_BIC, ...itemBic.filter(o => !CORE_BIC.includes(o))];

  return {
    projects,
    items,
    dts,
    bic,
    actionBic: [...CORE_BIC, ...cleanOptions(schema.actionBic).filter(o => !CORE_BIC.includes(o))],
    rfiTbcBy: ['DM', ...cleanOptions(schema.rfiTbcBy)],
    vcRaisedBy: cleanOptions(schema.vcRaisedBy).length ? cleanOptions(schema.vcRaisedBy) : ['DM', 'Architect', 'Client', 'Contractor', 'Consultant', 'Supplier'],
    statuses: cleanOptions(schema.taskStatuses),
    blockers: cleanOptions(schema.taskBlockers),
    rfiStatuses: cleanOptions(schema.rfiStatuses).length ? cleanOptions(schema.rfiStatuses) : ['Raise', 'Open', 'Close Out', 'Closed'],
    vcStatuses: cleanOptions(schema.vcStatuses).length ? cleanOptions(schema.vcStatuses) : ['Awaiting Design Info', 'Awaiting Instruction', 'Instruction Received', 'Declined', 'Withdrawn'],
    vcPause: cleanOptions(schema.vcPause),
    nextVc: Math.max(0, ...(s.variations || []).map(v => v.number || 0)) + 1,
    nextRfi: Math.max(0, ...(s.rfis || []).map(r => r.number || 0)) + 1,
  };
}

// ── Activity events ("Just logged") ─────────────────────────────────────────
export function itemLabel(itemsById, itemIds) {
  const it = itemsById.get(itemIds?.[0]);
  return it ? it.title : null;
}

export function makeEvent({ kind, row, summary, source, itemId, projectId, blocking = false, at }) {
  return {
    id: `${kind}:${row?.id || ''}:${at || Date.now()}`,
    at: at || new Date().toISOString(),
    kind,
    summary,
    source,
    itemId: itemId ?? null,
    projectId: projectId ?? null,
    refId: row?.id ?? null,
    url: row?.url ?? null,
    blocking,
  };
}

// Events for a newly seen row (by DB) — used by both sync and write paths.
export function eventForNewRow(db, row, itemsById, source) {
  const itemId = (row.itemIds || [])[0] ?? null;
  const projectId = itemsById.get(itemId)?.projectId ?? null;
  const at = row.createdAt;
  switch (db) {
    case 'actions':
      return makeEvent({ kind: row.type === 'Note' ? 'note' : 'action', row, at, itemId, projectId, source: source || row.source || 'Notion',
        summary: row.title || '(no text)', blocking: !!(row.blocks && !row.done) });
    case 'rfis':
      return makeEvent({ kind: 'rfi', row, at, itemId, projectId, source: source || 'Notion',
        summary: `RFI-${String(row.number ?? '?').padStart(3, '0')} ${row.title || ''}`.trim(), blocking: !!row.stopsWork });
    case 'variations':
      return makeEvent({ kind: 'vc', row, at, itemId, projectId, source: source || 'Notion',
        summary: `${row.code || 'VC'} ${row.title || ''}`.trim() });
    case 'submissions':
      return makeEvent({ kind: 'submission', row, at, itemId, projectId, source: 'via Drawing Flow',
        summary: [row.stage, row.revision, row.title].filter(Boolean).join(' · '), blocking: !!row.blocked });
    case 'todo':
      return makeEvent({ kind: 'task', row, at, itemId, projectId, source: source || 'Notion',
        summary: `${row.number != null ? `TD-${String(row.number).padStart(3, '0')} ` : ''}${row.title || ''}`.trim() });
    default:
      return null;
  }
}

// Events for a changed item (status / BIC / programme dates).
export function eventsForItemChange(prev, next, source) {
  if (!prev) return [];
  const out = [];
  const at = next.editedAt;
  const base = { row: next, at, itemId: next.id, projectId: next.projectId };
  if (prev.status !== next.status) out.push(makeEvent({ ...base, kind: 'status', source: source || 'Notion', summary: `${next.title}: ${prev.status || '—'} → ${next.status || '—'}` }));
  if (prev.bic !== next.bic) out.push(makeEvent({ ...base, kind: 'bic', source: source || 'Notion', summary: `${next.title}: BIC ${prev.bic || '—'} → ${next.bic || '—'}` }));
  // Only compare keys the previous row already had, so adding a field never floods the log.
  const changed = Object.keys(next.dates || {}).filter(k => prev.dates && k in prev.dates && prev.dates[k] !== next.dates[k]);
  if (changed.length) out.push(makeEvent({ ...base, kind: 'date', source: source || 'Scheduling', summary: `${next.title}: ${changed.map(k => `${k} ${next.dates[k] || '—'}`).join(', ')}` }));
  return out;
}

// ── Optimistic count deltas (client) ─────────────────────────────────────────
export function applyCountDelta(counts, kind, entry, today = londonToday()) {
  if (!counts) return counts;
  const c = structuredClone(counts);
  const bump = (k, by = 1) => { if (c[k]) c[k].value += by; };
  const wEnd = weekEnd(today);
  if (kind === 'action' && entry.type !== 'Note') {
    if (entry.bic === 'DM') { bump('bic-dm'); if (entry.blocks) c['bic-dm'].blocking = (c['bic-dm'].blocking || 0) + 1; }
    if (entry.due && entry.due < today) bump('overdue');
    else if (entry.due && entry.due <= wEnd) bump('due-week');
  }
  if (kind === 'rfi') {
    bump('rfis-open');
    if (entry.due && entry.due < today) bump('overdue');
    else if (entry.due && entry.due <= wEnd) bump('due-week');
  }
  if (kind === 'vc') bump('vcs-open');
  if (kind === 'item' && entry.prev) {
    const was = entry.prev.bic, now = entry.bic ?? was;
    if (was !== now) {
      if (was === 'DM') bump('bic-dm', -1);
      if (now === 'DM') bump('bic-dm');
      if (was === 'DT') bump('with-dts', -1);
      if (now === 'DT') bump('with-dts');
    }
  }
  if (c['bic-dm']) c['bic-dm'].sub = `${c['bic-dm'].blocking || 0} blocking item${c['bic-dm'].blocking === 1 ? '' : 's'}`;
  return c;
}
