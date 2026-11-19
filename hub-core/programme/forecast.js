// Programme forecast engine v2 (spec: claude/programme-baseline-spec.md §2, §4).
// Pure: one item in, one result out. Replaces calcRow's pinned / squeezed Adj walk.
//
//   Baseline  marker only (Programme Dates rows, written by Issue Baseline)
//   Actual    from the drawing schedule (item stage complete = every counted drawing)
//   Forecast  chained forward from the latest actual, never pinned, never before today
//
// Stage chain: S4 → S5 → A4.5 (PRD on No Client Approval items) → Production → Install.
// A stage ticked Not Required is skipped (e.g. S5 bypassed: S4 return → A4.5 DT start).

import { addWD, wdBetween, toDate, toISO, snapFwd, resolveProjectPeriods, mergeHolds, isWorkday } from './schedule.js';

export const PROVISIONAL_DT_DAYS = 10;
export const INSTALL_LEAD_WD = 30;
export const AMBER_BAND_WD = 3;
// Item statuses past drawing: issue stages with no actual get no forecast
export const PAST_DRAWING = /^(design complete|in production|on site|complete|pc approved|close out)$/i;
// Actual DT Days above this multiple of the estimate are flagged for a check
const OUTLIER_X = 3;

const iso = d => (d ? toISO(d) : null);
const D = v => (v ? snapFwd(v) : null);
const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const maxD = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

// n working days after `start`, not counting days inside a hold window
function addWDHold(start, n, holds) {
  const d = toDate(start); let rem = Math.max(0, n);
  const held = x => holds.some(h => x > h.start && x <= h.end);
  while (rem > 0) { d.setDate(d.getDate() + 1); if (isWorkday(d) && !held(d)) rem--; }
  return d;
}
// Added days from instructed variations whose hold ends inside [from, to]
const addedIn = (holds, from, to) => holds.filter(h => h.addedDays && h.end > from && h.end <= to).reduce((s, h) => s + h.addedDays, 0);

const ISSUE = {
  S4:    { sub: 'sub1ActDate', appr: 's4Date', status: 's4Status', review: 'clientReview', defaultDt: null },
  S5:    { sub: 'sub2ActDate', appr: 's5Date', status: 's5Status', review: 'clientReview', defaultDt: 'revisionIssue' },
  'A4.5':{ sub: 'subCActDate', appr: 'c01SignOffActDate', status: null, review: 'c01SignOff', defaultDt: 'constrIssue' },
  PRD:   { sub: 'subCActDate', appr: 'c01SignOffActDate', status: null, review: 'c01SignOff', defaultDt: null },
};
const hasC = v => (Array.isArray(v) ? v : v ? [v] : []).some(x => String(x).trim().toUpperCase().startsWith('C'));

/**
 * @param row      engine row (adapter.engineRow): item actuals from the drawing schedule + Tasks inputs
 * @param task     Tasks snapshot row (production / install actuals)
 * @param stages   Programme Dates rows for this item (Current ones), keyed by stage
 * @param project  engine project (periods)
 * @param holds    raw holds (adapter.holdsByItem)
 * @param today    'YYYY-MM-DD'
 */
export function forecastItem({ row, task, status = task?.status, stages = {}, project = {}, holds = [], today, amberBand = AMBER_BAND_WD, installLead = INSTALL_LEAD_WD }) {
  const P = resolveProjectPeriods(project).values;
  const T = D(today);
  const H = mergeHolds(holds, today);
  const nca = !!row.noClientApproval;
  const out = [];
  const issueStages = nca ? ['PRD'] : ['S4', 'S5', 'A4.5'];
  let manualHold = num(row.holdDaysManual) || 0;   // item-level hold days: go on the first stage still to issue
  let prev = null;                                  // { appr, sub, grade } of the last live stage
  let prevSub = null;

  issueStages.forEach(key => {
    const cfg = ISSUE[key];
    const r = stages[key] || {};
    if (r.notRequired) { out.push({ stage: key, notRequired: true, rowId: r.id || null }); return; }
    const first = !out.some(s => !s.notRequired);
    const qa = num(r.accQaDays) ?? P.qa;
    const review = num(r.accReviewDays) ?? P[cfg.review];
    const coord = num(r.coordDays) || 0;

    // Actuals (item complete = every counted drawing). A closed-cycle date (on or before
    // the previous stage's issue) or a return before its own issue is ignored.
    let actSub = D(row[cfg.sub]);
    let actAppr = D(row[cfg.appr]);
    const notes = [];
    if (actSub && prevSub && actSub <= prevSub) { notes.push(`Actual issue ${iso(actSub)} is on/before the previous stage's issue: ignored`); actSub = null; actAppr = null; }
    if (actAppr && actSub && actAppr < actSub) { notes.push(`Return ${iso(actAppr)} before issue ${iso(actSub)}: ignored`); actAppr = null; }
    if (!actSub) actAppr = null;
    const grade = actAppr ? (cfg.status ? (hasC(row[cfg.status]) ? 'C' : null) : 'Signed off') : null;

    // Recorded DT dates: a date on or before the previous stage's issue belongs to an earlier cycle
    const cur = d => (d && (!prevSub || d > prevSub) ? d : null);
    const recStart = cur(D(r.actual?.dtStart));
    const recDel = cur(D(r.actual?.dtDel));
    if (D(r.actual?.dtStart) && !recStart) notes.push(`Recorded DT start ${r.actual.dtStart} is from an earlier cycle: ignored`);
    if (D(r.actual?.dtDel) && !recDel) notes.push(`Recorded DT delivery ${r.actual.dtDel} is from an earlier cycle: ignored`);
    // DT start: recorded, else assumed (previous return + mobilisation; first issue: instruction + coordination)
    let assumed = null;
    if (prev?.appr) assumed = addWD(prev.appr, P.mobilisation);
    else if (first) {
      const instr = D(row.dateOfInstruction);
      assumed = instr ? addWD(instr, num(row.coordDays) ?? P.coordination) : D(row.dtStart1PlanInput);
    }
    const startUsed = recStart || assumed;

    // DT Days: entered → default → provisional (first issue only)
    const entered = num(r.dtDays);
    const isFirstIssue = key === 'S4' || key === 'PRD';
    const dtEst = entered ?? (isFirstIssue ? PROVISIONAL_DT_DAYS : P[cfg.defaultDt]);
    const dtSource = entered !== null ? 'entered' : isFirstIssue ? 'provisional' : 'default';

    const s = { stage: key, rowId: r.id || null, notes, qa, review };
    if (actSub) {
      // Issued: DT Days becomes the actual elapsed days (DT start → submission − QA)
      const delAt = addWD(actSub, -qa);
      s.actualDtDays = startUsed ? Math.max(0, wdBetween(startUsed, delAt)) : null;
      s.dtStartAssumed = !recStart && !!startUsed;
      s.dtStart = startUsed; s.dtDel = recDel || delAt;
      if (s.actualDtDays !== null && dtEst && s.actualDtDays > OUTLIER_X * dtEst) notes.push(`Actual ${s.actualDtDays} WD vs estimate ${dtEst}: check (drawings added later, or an old DT start)`); s.sub = actSub; s.subActual = true;
      s.appr = actAppr || maxD(addWDHold(actSub, review, H), T); s.apprActual = !!actAppr;
      s.grade = grade; s.dtDays = s.actualDtDays ?? entered; s.dtSource = s.actualDtDays !== null ? 'actual' : dtSource;
      s.unverified = false;
      prevSub = actSub;
      if (grade === 'C') {
        // Reissue of the same stage, from the return date
        const rStart = actAppr;
        const rDays = P[cfg.defaultDt || 'revisionIssue'] ?? 7;
        let rDel = addWDHold(rStart, rDays + coord, H); if (rDel < T) rDel = T;
        let rSub = addWD(rDel, qa); if (rSub < T) rSub = T;
        s.reissue = { dtStart: rStart, dtDel: rDel, sub: rSub, appr: addWDHold(rSub, review, H) };
        prev = { appr: s.reissue.appr, sub: s.reissue.sub };
      } else prev = { appr: s.appr, sub: s.sub };
    } else if (PAST_DRAWING.test(status || '')) {
      // Past drawing with no recorded issue: nothing to forecast
      s.noForecast = true; s.dtDays = entered; s.dtSource = entered !== null ? 'entered' : null; s.unverified = false;
      notes.push(`Item status ${status}: no issue recorded, no forecast`);
    } else {
      // To issue: chain forward, floored at today
      let start = recStart || assumed || T;
      const extra = coord + (manualHold > 0 ? manualHold : 0); manualHold = 0;
      let del = recDel;
      if (!del) { del = addWDHold(start, dtEst + extra, H); del = addWD(del, addedIn(H, start, del)); if (del < T) del = T; }
      let sub = addWD(del, qa); if (sub < T) sub = T;
      const appr = addWDHold(sub, review, H);
      Object.assign(s, { dtStart: start, dtDel: del, sub, appr, dtDays: dtEst, dtSource, unverified: dtSource === 'provisional' });
      prev = { appr, sub };
    }
    out.push(s);
  });

  // Production: last sign-off + Production Pack (DT Days on the Production row)
  const pr = stages.Production || {};
  const packDays = num(pr.dtDays) ?? P.productionPack;
  const prodAct = D(task?.dt?.productionAct);
  const prodFrom = prev?.appr || null;
  let prod = prodAct || (prodFrom ? addWDHold(prodFrom, packDays, H) : null);
  if (prod && !prodAct && prod < T) prod = T;
  out.push({ stage: 'Production', rowId: pr.id || null, sub: prod, subActual: !!prodAct, dtDays: packDays, dtSource: num(pr.dtDays) !== null ? 'entered' : 'default' });

  // Install: override → actual → production + lead
  const ir = stages.Install || {};
  const instAct = D(task?.dt?.installAct);
  const instOv = D(ir.installOverride);
  let inst = instAct || instOv || (prod ? addWD(prod, installLead) : null);
  out.push({ stage: 'Install', rowId: ir.id || null, sub: inst, subActual: !!instAct, override: !!instOv && !instAct });

  // Variance and RAG against the Current baseline (submission = the driving date)
  for (const s of out) {
    if (s.notRequired || s.noForecast) continue;
    const bl = D(stages[s.stage]?.baseline?.sub);
    const fcSub = s.reissue ? s.reissue.sub : s.sub;
    s.baselineSub = bl;
    s.variance = bl && fcSub ? wdBetween(bl, fcSub) : null;
    s.rag = !bl || !fcSub ? null
      : s.subActual && !s.reissue ? 'Done'
      : s.variance > 0 ? 'Red'
      : s.variance > -amberBand ? 'Amber' : 'Green';
  }
  return out.map(s => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v instanceof Date ? iso(v) : v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, b instanceof Date ? iso(b) : b])) : v])));
}

// Notion patch for one stage result (Programme Dates row). Forecast columns, actual DT Days,
// unverified flag, variance and RAG only — baseline and inputs are never written here.
export function forecastPatch(s) {
  const date = v => ({ date: v ? { start: v } : null });
  if (s.notRequired) return null;
  const f = s.reissue || s;
  if (s.noForecast) return { 'DT Days Unverified': { checkbox: false }, RAG: { select: null }, 'Variance (days)': { number: null } };
  const p = {
    'Forecast Submission': date(f.sub),
    'Variance (days)': { number: s.variance ?? null },
    RAG: { select: s.rag ? { name: s.rag } : null },
  };
  if (s.stage !== 'Production' && s.stage !== 'Install') {
    Object.assign(p, {
      'Forecast DT Start': date(f.dtStart), 'Forecast DT Delivery': date(f.dtDel), 'Forecast Approval': date(f.appr),
      'DT Days Unverified': { checkbox: !!s.unverified },
    });
    if (s.dtSource === 'actual') p['DT Days'] = { number: s.actualDtDays };
  }
  return p;
}
