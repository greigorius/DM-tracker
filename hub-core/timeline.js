// Timeline: item-level drawing programme. Reads the Notion fields exactly as
// the Scheduling Tool keeps them.
//
//   Actuals   Master Drawing Schedule, per drawing (submit dates, grades,
//             status dates, C01 Sign Off)
//   Forecast  Tasks DB, per item: 1st / 2nd / Constr. Submission Date (Adj),
//             written by the Scheduling Tool
//
// Stage rules match the Scheduling Tool (lib/routes.js addDrawingToStages,
// lib/release.js, lib/schedule.js stageInputs / calcRow):
//   - only drawings with Dwg No. Assigned = Drawing count; a drawing with No
//     Client Approval skips S4/S5, and S5 Status NA skips S5. If an item has no
//     counted drawings, any dated drawing is used instead.
//   - a stage is complete when every counted drawing has the date; its date is
//     the LAST of them. Until then the Adj forecast is shown with n/N issued.
//   - a reissue is pending when the Adj date is later than the actual and the
//     item is programme-driven or has a Reissue Reason. A pending reissue sets
//     aside the actuals of every later stage: they are forecast again.
//   - items with No Client Approval have no S4 / S5; the construction issue is
//     A4.5 when client approval is needed, PRD when it isn't.
//
// Every date is either an actual or a forecast. Return forecasts (comments /
// status, sign-off) are not stored in Notion, so they use the Scheduling
// Tool's periods: submission + client review (S4, S5) or + sign-off (A4.5 /
// PRD), in UK working days — item acceleration, else the project's period,
// else the tool's default.

import { addWD } from './workdays.js';

export const STAGES = [
  { key: 's4', code: 'S4', name: 'Approval issue' },
  { key: 's5', code: 'S5', name: 'Revision issue' },
  { key: 'con', code: 'A4.5 / PRD', name: 'Construction issue' },
];

// Scheduling Tool defaults (lib/schedule.js PERIOD_DEFAULTS)
export const DEFAULT_REVIEW_DAYS = 10;
export const DEFAULT_SIGN_OFF_DAYS = 2;

const GRADE_RANK = { C: 4, Rejected: 4, B: 3, A: 2, Approved: 2, NA: 1 };

export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

const max = xs => xs.reduce((m, x) => (m == null || x > m ? x : m), null);
const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
export const worstGrade = gs => gs.filter(Boolean).reduce((w, g) => (w == null || (GRADE_RANK[g] || 0) > (GRADE_RANK[w] || 0) ? g : w), null);
const lateBy = (date, today) => (date && date < today ? daysBetween(date, today) : 0);
const forecast = (date, today) => ({ kind: 'plan', date: date || null, late: lateBy(date, today) });

// Working days from submission to the return, per stage.
export function returnDays(key, item, project) {
  const p = item.prog || {};
  if (key === 's4') return num(p.s4ReviewDays) ?? num(project?.reviewDays) ?? DEFAULT_REVIEW_DAYS;
  if (key === 's5') return num(p.s5ReviewDays) ?? num(project?.reviewDays) ?? DEFAULT_REVIEW_DAYS;
  return num(p.signOffDays) ?? num(project?.signOffDays) ?? DEFAULT_SIGN_OFF_DAYS;
}

// One drawing's actuals at a stage. `skip` = the drawing doesn't go through it.
export function drawingStage(dw, key, prd) {
  if (key === 's4') return { skip: !!dw.noClientApproval, sub: dw.s4?.submitted || null, ret: dw.s4?.statusDate || null, grade: dw.s4?.status || null };
  if (key === 's5') return { skip: !!dw.noClientApproval || dw.s5?.status === 'NA', sub: dw.s5?.submitted || null, ret: dw.s5?.statusDate || null, grade: dw.s5?.status || null };
  const signOff = dw.c01?.signOff || null;
  const grade = prd ? (dw.prd?.status || (signOff ? 'Approved' : null)) : (signOff ? 'Approved' : null);
  return { skip: false, sub: dw.c01?.submitted || null, ret: signOff || (prd ? dw.prd?.statusDate || null : null), grade };
}

// Item-level cells for one stage. `superseded` = an earlier stage is being
// reissued, so this stage's actuals no longer stand.
export function itemStage({ drawings, key, prd, item, project, superseded, today }) {
  if (key !== 'con' && item.noClientApproval) return { na: true, sub: null, ret: null };
  const adj = item.prog?.[`${key}Adj`] || null;
  const days = returnDays(key, item, project);
  const reissueOk = !!(item.programmeDriven || item.reissueReason);

  const all = drawings.map(dw => ({ dw, st: drawingStage(dw, key, prd) }));
  let counted = all.filter(x => x.dw.type === 'Drawing' && !x.st.skip);
  if (!counted.length) counted = all.filter(x => !x.st.skip && (x.st.sub || x.st.ret));
  const n = counted.length;

  if (superseded) {
    return { sub: forecast(adj, today), ret: forecast(addWD(adj, days), today), n, superseded: true };
  }

  const issued = counted.filter(x => x.st.sub);
  const actual = n && issued.length === n ? max(issued.map(x => x.st.sub)) : null;

  if (actual && adj && adj > actual && reissueOk) {
    const sub = { ...forecast(adj, today), reissue: true, actual };
    return { sub, ret: forecast(addWD(adj, days), today), n, reissue: true };
  }

  let sub;
  if (actual) sub = { kind: 'act', date: actual, issued: n, total: n };
  else if (issued.length) sub = { ...forecast(adj, today), issued: issued.length, total: n };
  else sub = forecast(adj, today);

  const back = issued.filter(x => x.st.ret);
  const grade = worstGrade(back.map(x => x.st.grade));
  let ret;
  if (actual && back.length === n) ret = { kind: 'act', date: max(back.map(x => x.st.ret)), grade };
  else {
    // Forecast from the stage's submission: the actual once complete, else the Adj forecast
    const f = forecast(addWD(actual || sub.date, days), today);
    ret = issued.length ? { ...f, awaiting: true, back: back.length, total: issued.length, grade } : f;
  }
  return { sub, ret, n };
}

// Drawing-level cells: the drawing's own actuals; forecasts where it hasn't
// been issued / returned, or where the stage is being reissued or superseded.
export function drawingCells({ dw, key, prd, item, project, stage, today }) {
  if (key !== 'con' && item.noClientApproval) return { na: true, sub: null, ret: null };
  const st = drawingStage(dw, key, prd);
  if (st.skip) return { na: true, sub: null, ret: null };
  const adj = item.prog?.[`${key}Adj`] || null;
  const days = returnDays(key, item, project);
  if (stage.superseded || (stage.reissue && st.sub && adj > st.sub)) {
    return { sub: { ...forecast(adj, today), reissue: !!stage.reissue }, ret: forecast(addWD(adj, days), today) };
  }
  const sub = st.sub ? { kind: 'act', date: st.sub } : forecast(adj, today);
  const ret = st.ret ? { kind: 'act', date: st.ret, grade: st.grade }
    : { ...forecast(addWD(sub.date, days), today), awaiting: !!st.sub };
  return { sub, ret };
}

const byNumber = (a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true });

/**
 * Build the timeline rows.
 * @param {object} p
 * @param {object[]} p.items     tasks snapshot rows (already filtered to the ones to show)
 * @param {object[]} p.drawings  drawings snapshot rows
 * @param {Map}      [p.projects] project id → projects snapshot row (for period overrides)
 * @param {string}   p.today     YYYY-MM-DD (London)
 */
export function buildTimeline({ items, drawings, projects, today }) {
  const byItem = new Map();
  for (const dw of drawings) {
    if (dw.archived) continue;
    for (const id of dw.itemIds || []) {
      if (!byItem.has(id)) byItem.set(id, []);
      byItem.get(id).push(dw);
    }
  }

  return items.map(item => {
    const all = (byItem.get(item.id) || []).sort(byNumber);
    // Release-schedule convention: first (lowest) number and count of Dwg No. Assigned = Drawing
    const numbered = all.filter(d => d.type === 'Drawing');
    const list = numbered.length ? numbered : all;
    const prd = !!item.noClientApproval;
    const project = projects?.get?.(item.projectId) || null;

    const stages = {};
    let superseded = false;
    for (const st of STAGES) {
      stages[st.key] = itemStage({ drawings: all, key: st.key, prd, item, project, superseded, today });
      if (stages[st.key].reissue) superseded = true;
    }
    const cells = Object.values(stages).flatMap(s => [s.sub, s.ret]).filter(Boolean);

    return {
      id: item.id,
      url: item.url,
      title: item.title,
      projectId: item.projectId,
      bic: item.bic,
      dtIds: item.dtIds || [],
      status: item.status,
      prd,
      programmeDriven: !!item.programmeDriven,
      first: list[0]?.title || null,
      count: numbered.length || all.length,
      drawings: list.map(dw => ({
        id: dw.id, url: dw.url, title: dw.title, name: dw.name, rev: dw.rev,
        stages: Object.fromEntries(STAGES.map(st => [st.key, drawingCells({ dw, key: st.key, prd, item, project, stage: stages[st.key], today })])),
      })),
      stages,
      overdue: cells.some(c => c.late > 0),
      awaiting: cells.some(c => c.awaiting),
    };
  });
}

// Show filter
export const SHOW = [
  { value: 'all', label: 'All items', test: () => true },
  { value: 'overdue', label: 'Overdue', test: r => r.overdue },
  { value: 'awaiting', label: 'Awaiting comments', test: r => r.awaiting },
  { value: 'dt', label: 'With DT', test: r => r.bic === 'DT' },
];
