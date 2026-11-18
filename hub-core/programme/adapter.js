// Hub snapshots → the programme engine's inputs.
//
// The engine (schedule.js, release.js, ganttExport.js in this folder) is the
// Scheduling Tool's lib/ copied unchanged. This file rebuilds the rows the
// Scheduling Tool assembled from Notion (lib/routes.js + App.jsx
// applyMDSStatuses / withHolds) from the Hub's cached snapshots instead, so
// both give identical dates. test/programme-adapter.test.js checks that.

import { emptyStages, resolveStages, calcRow, toISO } from './schedule.js';

// ── Drawings → stage completion (routes.js addDrawingToStages) ──────────────
// Only Dwg No. Assigned = Drawing counts; No Client Approval skips S4/S5;
// S5 Status NA skips S5. Any dated drawing feeds the fallback counts.
const STAGE_DATES = {
  s4Sub: { get: d => d.s4?.submitted, s4s5: true },
  s4Date: { get: d => d.s4?.statusDate, s4s5: true },
  s5Sub: { get: d => d.s5?.submitted, s4s5: true, s5: true },
  s5Date: { get: d => d.s5?.statusDate, s4s5: true, s5: true },
  c01Sub: { get: d => d.c01?.submitted },
  c01Date: { get: d => d.c01?.signOff },
};
const minD = (a, b) => (!a ? b ?? null : !b ? a : (a < b ? a : b));
const maxD = (a, b) => (!a ? b ?? null : !b ? a : (a > b ? a : b));
const minDwg = (a, b) => (!a ? b ?? null : !b ? a : (a.localeCompare(b, undefined, { numeric: true }) <= 0 ? a : b));

export function stagesFromDrawings(dwgs) {
  const stages = emptyStages();
  for (const dw of dwgs) {
    const assigned = dw.type === 'Drawing';
    const nca = !!dw.noClientApproval;
    const s5na = dw.s5?.status === 'NA';
    for (const [k, def] of Object.entries(STAGE_DATES)) {
      const d = def.get(dw) || null;
      const st = stages[k];
      if (d) { st.an++; st.afirst = minD(st.afirst, d); st.alast = maxD(st.alast, d); }
      if (!assigned || (def.s4s5 && nca) || (def.s5 && s5na)) continue;
      st.n++;
      if (d) { st.done++; st.first = minD(st.first, d); st.last = maxD(st.last, d); }
    }
  }
  return stages;
}

const uniqSorted = xs => { const u = [...new Set(xs.filter(Boolean))].sort(); return u.length ? u : null; };

// One drawing's position for the per-drawing view (routes.js drawingRow)
const drawingRow = dw => ({
  id: dw.id, no: dw.title || null, title: dw.title1 || null, url: dw.url,
  assigned: dw.type || null, nca: !!dw.noClientApproval, rev: dw.rev || null, status: dw.status || null,
  s4Sub: dw.s4?.submitted || null, s4St: dw.s4?.status || null, s4Date: dw.s4?.statusDate || null,
  s5Sub: dw.s5?.submitted || null, s5St: dw.s5?.status || null, s5Date: dw.s5?.statusDate || null,
  cSub: dw.c01?.submitted || null, cSo: dw.c01?.signOff || null,
});

// ── Holds (routes.js GET /api/notion/holds) ─────────────────────────────────
const PAUSE_TYPES = new Set(['Design Change', 'Scope Change']);
const DECIDED = new Set(['Instruction Received', 'Declined', 'Withdrawn']);

// Variations that pause (Change Request Date set; Pause Override, else type) and
// stop-work RFIs → { [itemId]: hold[] }
export function holdsByItem(variations = [], rfis = []) {
  const items = {};
  const add = (ids, h) => (ids || []).forEach(id => { (items[id] ||= []).push(h); });
  for (const vc of variations) {
    if (vc.archived || !vc.requested) continue;
    const pauses = vc.pauseOverride === 'Pauses' || (!vc.pauseOverride && PAUSE_TYPES.has(vc.type));
    if (!pauses) continue;
    let end = vc.decision || null, note = null;
    if (!end && DECIDED.has(vc.status)) {
      end = (vc.editedAt || '').slice(0, 10) || null;
      note = 'Decision Date missing — hold ends on last edit';
    }
    const instructed = vc.status === 'Instruction Received' || !!vc.instructed;
    add(vc.itemIds, {
      start: vc.requested, end,
      addedDays: instructed ? (vc.addedDays ?? 0) : 0,
      label: `${vc.number != null ? `VO${vc.number} ` : ''}${vc.title || 'Variation'}`,
      source: 'variation', status: vc.status, note, url: vc.url,
    });
  }
  for (const rfi of rfis) {
    if (rfi.archived || !rfi.stopsWork) continue;
    const start = rfi.raised || (rfi.createdAt || '').slice(0, 10);
    let end = rfi.responded || rfi.closed || null, note = null;
    if (!end && rfi.status === 'Closed') { end = (rfi.editedAt || '').slice(0, 10); note = 'Date Responded missing — hold ends on last edit'; }
    add(rfi.itemIds, {
      start, end, addedDays: 0,
      label: `${rfi.number != null ? `RFI ${rfi.number} ` : 'RFI '}${rfi.title || ''}`.trim(),
      source: 'rfi', status: rfi.status, note, url: rfi.url,
    });
  }
  return items;
}

// ── Rows ────────────────────────────────────────────────────────────────────
export function drawingsByItem(drawings = []) {
  const map = new Map();
  for (const dw of drawings) {
    if (dw.archived) continue;
    for (const id of dw.itemIds || []) {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(dw);
    }
  }
  return map;
}

// Engine project object (PROJECT_PERIOD_KEYS / MIN_PROJECT_KEYS)
export const engineProject = p => (p ? { id: p.id, name: p.title, ...(p.sched || {}) } : {});

// Engine row for one item: the Tasks inputs, MDS stage completion and holds.
export function engineRow(task, dwgs = [], holds = []) {
  const row = {
    id: task.id, pageId: task.id, url: task.url, name: task.title || '', status: task.status || '',
    projectId: task.projectId,
    s4Status: null, s5Status: null, mdsPageIds: null,
    ...(task.sched || {}),
    sub1ActDate: null, sub2ActDate: null, subCActDate: null,
    s4Date: null, s5Date: null, c01SignOffActDate: null,
    qa1: null, qa2: null, qaC: null, contractCategory: null,
    holds,
  };
  if (!dwgs.length) return row;
  const { fields, open, progress } = resolveStages(stagesFromDrawings(dwgs));
  let dwgFirst = null, dwgCount = 0;
  for (const dw of dwgs) if (dw.type === 'Drawing') { dwgCount++; if (dw.title) dwgFirst = minDwg(dwgFirst, dw.title); }
  return {
    ...row,
    s4Status: uniqSorted(dwgs.map(d => d.s4?.status)),
    s5Status: uniqSorted(dwgs.map(d => d.s5?.status)),
    mdsPageIds: dwgs.map(d => d.id),
    ...fields,
    mdsOpen: open, mdsProgress: progress,
    mdsDrawings: dwgs.length, mdsDwgFirst: dwgFirst, mdsDwgCount: dwgCount,
    drawings: dwgs.map(drawingRow),
  };
}

// Every item of a project (or all items) with its engine row and result.
// `data` = { tasks, drawings, variations, rfis, projects } snapshots.
export function buildProgramme(data, { projectId = null, today, include = () => true } = {}) {
  const dwgMap = drawingsByItem(data.drawings);
  const holds = holdsByItem(data.variations, data.rfis);
  const projects = new Map((data.projects || []).map(p => [p.id, engineProject(p)]));
  const out = [];
  for (const t of data.tasks || []) {
    if (t.archived || (projectId && t.projectId !== projectId) || !include(t)) continue;
    const row = engineRow(t, dwgMap.get(t.id) || [], holds[t.id] || []);
    const project = projects.get(t.projectId) || {};
    out.push({ row, c: calcRow(row, project, { today }), project });
  }
  return out;
}

export const iso = d => (d ? toISO(d) : null);
