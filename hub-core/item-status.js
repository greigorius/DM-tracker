// Item Status and Drawing Status, worked out from the Hub snapshots.
//
// The rules themselves live in netlify/functions/_statusRules.js and are shared
// with the item-status functions (nightly sweep + Make calls), so the Hub and
// the automation can never disagree. This file only does the joining that
// _itemStatusEngine.js does against live Notion, but from snapshot rows.
// test/item-status-parity.test.js checks both give the same answer.
//
// Item Status, in order:
//   Lock Status ticked             → leave alone
//   Omitted                        → leave alone (only ever set by hand)
//   Hold (see below)               → Blocked, unless the item is Design Complete
//   Works order + all drawings Complete → Design Complete
//   Works order signal             → In Production  (WO Raised date, a PRD/AB drawing
//                                     issued or complete, or Schedule Production (Actual))
//   DT started or any submission   → In Progress
//   otherwise                      → To Do   (no Drawing Flow history: old value mapped)
// Hold: a pausing variation between Change Request Date and Decision Date, a
// stop-work RFI between Date Raised and Date Responded/Closed (on the item or one
// of its drawings), or a submission ticked Blocked in Drawing Flow.

import { variationHolds, rfiHolds, drawingStatus, itemStatus, latestSubmission, cleanId, ITEM } from '../netlify/functions/_statusRules.js';

export { ITEM };
export const ITEM_STATUS_OPTIONS = Object.values(ITEM);
const DECIDED = new Set(['Instruction Received', 'Declined', 'Withdrawn']);
const OPEN_VC = new Set(['Awaiting Design Info', 'Awaiting Instruction']);
const c = cleanId;
const live = r => r && !r.archived;
const rfiName = r => `${r.number != null ? `RFI ${r.number}: ` : ''}${r.title || 'Untitled RFI'}`;

/**
 * snaps: { tasks, drawings, submissions, rfis, variations } snapshot rows.
 * Returns { today, items, drawings } in the same shape as computeStatuses(),
 * plus pageId (the dashed Notion id) on every row.
 */
export function deriveStatuses(snaps, today) {
  const subs = (snaps.submissions || []).filter(live).map(s => ({
    id: c(s.id), pageId: s.id, url: s.url, name: s.title || '', blocked: !!s.blocked,
    drawing: s.drawingIds?.[0] ? c(s.drawingIds[0]) : null, item: s.itemIds?.[0] ? c(s.itemIds[0]) : null,
    stage: s.stage, status: s.status, grade: s.grade, dt: s.dtIds?.[0] ? c(s.dtIds[0]) : null,
    submitted: s.submitted, created: s.createdAt,
  }));
  const rfis = (snaps.rfis || []).filter(live).map(r => ({
    id: c(r.id), pageId: r.id, url: r.url, name: r.title || '', number: r.number, items: (r.itemIds || []).map(c), drawings: (r.drawingIds || []).map(c),
    stopsWork: !!r.stopsWork, status: r.status, tbc: r.tbcBy, raised: r.raised, responded: r.responded, closed: r.closed,
    created: (r.createdAt || '').slice(0, 10), title: r.title,
  }));
  const vars = (snaps.variations || []).filter(v => live(v) && v.requested).map(v => ({
    id: c(v.id), pageId: v.id, url: v.url, name: v.title || '', code: v.code, items: (v.itemIds || []).map(c), type: v.type, override: v.pauseOverride,
    status: v.status, requestDate: v.requested, decisionDate: v.decision,
  }));

  const subsByDrawing = new Map(), subItems = new Set();
  for (const s of subs) {
    if (s.item) subItems.add(s.item);
    if (!s.drawing) continue;
    if (!subsByDrawing.has(s.drawing)) subsByDrawing.set(s.drawing, []);
    subsByDrawing.get(s.drawing).push(s);
  }
  const heldItems = new Map(), rfisByDrawing = new Map();
  const hold = (i, b) => {
    if (!heldItems.has(i)) heldItems.set(i, []);
    const list = heldItems.get(i); if (!list.some(x => x.url === b.url)) list.push(b);
  };
  for (const v of vars) if (variationHolds(v, today)) v.items.forEach(i => hold(i,
    { kind: 'Variation', db: 'variations', id: v.pageId, name: [v.code, v.name].filter(Boolean).join(' '), url: v.url, since: v.requestDate, status: v.status, type: v.type }));
  for (const s of subs) if (s.blocked && !s.drawing && s.item) hold(s.item,
    { kind: 'Drawing Flow', db: 'submissions', id: s.pageId, name: `${s.name} (blocked submission)`, url: s.url, since: s.submitted });
  for (const r of rfis) {
    if (rfiHolds(r, today)) r.items.forEach(i => hold(i,
      { kind: 'RFI', db: 'rfis', id: r.pageId, name: rfiName(r), url: r.url, since: r.raised || r.created, status: r.status }));
    for (const d of r.drawings) { if (!rfisByDrawing.has(d)) rfisByDrawing.set(d, []); rfisByDrawing.get(d).push(r); }
  }

  const items = (snaps.tasks || []).filter(live).map(t => ({
    id: c(t.id), pageId: t.id, url: t.url, name: t.title || '', projectId: t.projectId, current: t.status,
    dtStart: t.dt?.s4StartAct || null, woRaised: t.dates?.woRaised || null, locked: !!t.lockStatus,
  }));
  const itemIds = new Set(items.map(i => i.id));

  // Same drawing set as the engine: drawings of items with Drawing Flow history or
  // a works order, plus drawings a stop-work RFI is holding.
  const need = new Set(items.filter(i => subItems.has(i.id) || i.woRaised).map(i => i.id));
  const allDrawings = (snaps.drawings || []).filter(live);
  const chosen = allDrawings.filter(d => (d.itemIds || []).some(i => need.has(c(i))));
  const loaded = new Set(chosen.map(d => c(d.id)));
  for (const d of allDrawings) {
    const id = c(d.id);
    if (loaded.has(id)) continue;
    const held = (rfisByDrawing.get(id) || []).some(r => rfiHolds(r, today));
    if (held && d.itemIds?.[0] && itemIds.has(c(d.itemIds[0]))) { chosen.push(d); loaded.add(id); }
  }

  const drawingsByItem = new Map(), drawingRows = [];
  for (const d of chosen) {
    const id = c(d.id), item = d.itemIds?.[0] ? c(d.itemIds[0]) : null;
    const current = d.status, locked = !!d.lockStatus, productionStage = d.productionStage || null;
    const ds = subsByDrawing.get(id) || [], drfis = rfisByDrawing.get(id) || [];
    const r = drawingStatus({ current, submissions: ds, rfis: drfis, productionStage }, today);
    if (r.held && item) {
      const rfi = drfis.find(x => rfiHolds(x, today));
      const latest = latestSubmission(ds);
      hold(item, rfi
        ? { kind: 'RFI', db: 'rfis', id: rfi.pageId, name: `${rfiName(rfi)} (on ${d.title})`, url: rfi.url, since: rfi.raised || rfi.created, status: rfi.status }
        : { kind: 'Drawing Flow', db: 'submissions', id: latest?.pageId, name: `${d.title} blocked in Drawing Flow`, url: latest?.url || d.url, since: latest?.submitted ?? null });
    }
    if (locked) { r.status = current; r.reason = 'Locked: status set by hand'; }
    const row = { id, pageId: d.id, url: d.url, item, number: d.title, current, proposed: r.status, reason: r.reason,
      fromFlow: r.fromFlow, stage: r.stage, schedProdActual: d.prd?.scheduled || null, c01SignOff: d.c01?.signOff || null, locked };
    row.changed = !locked && !!row.proposed && row.proposed !== row.current;
    drawingRows.push(row);
    if (!drawingsByItem.has(item)) drawingsByItem.set(item, []);
    drawingsByItem.get(item).push({ status: row.proposed, fromFlow: row.fromFlow, stage: row.stage, schedProdActual: row.schedProdActual, productionStage });
  }

  const itemRows = items.map(i => {
    const blockers = heldItems.get(i.id) || [];
    if (i.locked) return { ...i, blockers, proposed: i.current, reason: 'Locked: status set by hand', changed: false };
    const r = itemStatus(i, drawingsByItem.get(i.id) || [], blockers.length > 0);
    const reason = r.status === ITEM.BLOCKED ? 'On hold: ' + blockers.map(b => b.name).join('; ') : r.reason;
    return { ...i, blockers, proposed: r.status, reason, changed: r.status !== i.current };
  });
  return { today, items: itemRows, drawings: drawingRows, _ctx: { vars, rfis, subs, allDrawings } };
}

/** Rows that stop the rules seeing the real position. Each: { id, title, count, why, rows: [{ db, id, url, title, sub }] } */
export function statusGaps(snaps, result) {
  const { vars, rfis, subs } = result._ctx;
  const items = new Map((snaps.tasks || []).filter(live).map(t => [c(t.id), t]));
  const projOf = ids => items.get(c((ids || [])[0]))?.projectId ?? null;
  const itemName = ids => (ids || []).map(i => items.get(c(i))?.title).filter(Boolean).join(', ') || 'No item';
  const t = result.today;
  const allVars = (snaps.variations || []).filter(live);
  const pauses = v => v.pauseOverride === 'Pauses' || (!v.pauseOverride && ['Design Change', 'Scope Change'].includes(v.type));
  const gap = (id, title, why, rows) => ({ id, title, why, count: rows.length, rows });
  const vRow = v => ({ db: 'variations', id: v.id, projectId: projOf(v.itemIds), url: v.url, title: [v.code, v.title].filter(Boolean).join(' ') || 'Untitled variation', sub: [v.status || 'No status', v.type || 'No type', itemName(v.itemIds)].join(' · ') });
  const rRow = r => ({ db: 'rfis', id: r.id, projectId: projOf(r.itemIds), url: r.url, title: `RFI-${String(r.number ?? '?').padStart(3, '0')} ${r.title || ''}`.trim(), sub: [r.status || 'No status', r.stopsWork ? 'stops work' : null, itemName(r.itemIds)].filter(Boolean).join(' · ') });

  const doneItem = new Set(['Design Complete', 'Omitted']);
  const woMissing = [];
  for (const d of (snaps.drawings || []).filter(live)) {
    const it = items.get(c(d.itemIds?.[0]));
    if (!it || it.dates?.woRaised || doneItem.has(it.status) || !d.c01?.signOff) continue;
    if (!woMissing.some(x => x.id === it.id)) woMissing.push({ db: 'tasks', id: it.id, projectId: it.projectId, url: it.url, title: it.title || 'Untitled item', sub: `${d.title} signed off ${d.c01.signOff} · no WO Raised date` });
  }
  return [
    gap('vc-no-date', 'Pausing variation with no Change Request Date', 'Open (or no status) and set to pause, but the hold starts on Change Request Date, so it can’t block its item. If it should only be logged, set Pause Override to Does not pause.',
      allVars.filter(v => !v.requested && (OPEN_VC.has(v.status) || !v.status) && pauses(v)).map(vRow)),
    gap('vc-no-type', 'Open variation with no type or pause override', 'Only Design Change and Scope Change pause by type. Set the type, or Pause Override.',
      allVars.filter(v => (OPEN_VC.has(v.status) || !v.status) && !v.type && !v.pauseOverride).map(vRow)),
    gap('vc-decided-held', 'Decided variation still holding', 'Status says decided but there’s no Decision Date, or it’s in the future, so the item stays Blocked.',
      vars.filter(v => DECIDED.has(v.status) && variationHolds(v, t)).map(v => vRow(allVars.find(x => c(x.id) === v.id)))),
    gap('rfi-open-undecided', 'Open RFI: does it stop work?', 'Only RFIs with Stops Work ticked block an item. Tick it here if this one does.',
      (snaps.rfis || []).filter(r => live(r) && ['Raise', 'Open'].includes(r.status) && !r.stopsWork).map(rRow)),
    gap('rfi-closed-held', 'Stop-work RFI answered but still holding', 'Add Date Responded so the hold ends.',
      rfis.filter(r => rfiHolds(r, t) && ['Close Out', 'Closed'].includes(r.status)).map(r => rRow((snaps.rfis || []).find(x => c(x.id) === r.id)))),
    gap('wo-missing', 'Construction Issue signed off, no works order date', 'In Production needs a WO Raised date (or a PRD issue / production schedule date).', woMissing),
    gap('sub-unlinked', 'Submission not linked to a drawing', 'Unlinked submissions can’t set a Drawing Status. Link it in Drawing Flow.',
      subs.filter(s => !s.drawing).map(s => ({ db: 'submissions', id: s.pageId, projectId: s.item ? projOf([s.item]) : null, url: s.url, title: s.name || 'Untitled submission', sub: [s.stage, s.status, s.item ? itemName([s.item]) : 'No item'].filter(Boolean).join(' · ') }))),
  ].filter(g => g.count > 0);
}

/** The plan Triage shows. */
export function statusPlan(snaps, today) {
  const result = deriveStatuses(snaps, today);
  const projects = new Map((snaps.projects || []).map(p => [p.id, p.title]));
  const drawingsOf = new Map();
  for (const d of result.drawings) { if (!drawingsOf.has(d.item)) drawingsOf.set(d.item, []); drawingsOf.get(d.item).push(d); }
  const out = i => ({
    id: i.pageId, title: i.name, url: i.url, projectId: i.projectId, project: projects.get(i.projectId) || null,
    from: i.current || null, to: i.proposed || null, reason: i.reason, locked: i.locked, blockers: i.blockers,
    drawings: (drawingsOf.get(i.id) || []).filter(d => d.changed).map(({ pageId, number, url, current, proposed, reason }) => ({ id: pageId, number, url, from: current, to: proposed, reason })),
  });
  const changes = result.items.filter(i => i.changed || (drawingsOf.get(i.id) || []).some(d => d.changed)).map(out);
  return {
    today,
    changes,
    held: result.items.filter(i => i.blockers.length || i.current === ITEM.BLOCKED).map(out)
      .sort((a, b) => b.blockers.length - a.blockers.length || (a.title || '').localeCompare(b.title || '')),
    locked: result.items.filter(i => i.locked).map(out),
    gaps: statusGaps(snaps, result),
    counts: { items: result.items.length, drawings: result.drawings.length },
  };
}
