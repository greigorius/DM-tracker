// Each drawing's revisions within each stage, for the Drawings tracker
// (spec: claude/programme-baseline-spec.md §5).
//
// Actuals come from the Submissions DB (Drawing Flow): one row per submission,
// with its Stage, Revision, Issued (to the client) and Client Grade, graded on
// Reviewed. QA bounces that never reached the client are left out. Drawings
// issued before the Drawing Flow have no Submissions rows, so the Master
// Drawing Schedule's stage dates stand in — unless they are on/before the
// previous stage's issue (a closed cycle) or a return before its issue.
//
// Forecasts walk forward from the drawing's OWN latest actual, never before today:
//   - return of an issued rev not yet graded: issue + review period
//   - reissue after C: return + the stage's DT Days + QA
//   - first issue of the next stage: previous return + mobilisation + DT Days + QA
//   - nothing issued yet in the first stage: the item's forecast (Programme Dates),
//     else today + DT Days + QA
// S5 is skipped when the drawing's S5 Status is NA or the item's S5 is Not Required.
// The item's Current baseline is the marker per stage, with RAG against the drawing's issue.

import { addWD, toISO, toDate, wdBetween, resolveProjectPeriods } from './programme/schedule.js';
import { engineProject } from './programme/adapter.js';
import { PROVISIONAL_DT_DAYS, AMBER_BAND_WD, PAST_DRAWING } from './programme/forecast.js';

export const REV_STAGES = [
  { key: 's4', label: 'S4', subStage: 'S4', pd: 'S4', mds: d => ({ issued: d.s4?.submitted, grade: d.s4?.status, graded: d.s4?.statusDate }), review: 'clientReview', dt: null, mdsStage: /^S4/ },
  { key: 's5', label: 'S5', subStage: 'S5', pd: 'S5', mds: d => ({ issued: d.s5?.submitted, grade: d.s5?.status, graded: d.s5?.statusDate }), review: 'clientReview', dt: 'revisionIssue', mdsStage: /^S5/ },
  { key: 'c01', label: 'A4.5', subStage: 'A4.5', pd: 'A4.5', mds: d => ({ issued: d.c01?.submitted, grade: d.c01?.signOff ? 'Signed off' : null, graded: d.c01?.signOff }), review: 'c01SignOff', dt: 'constrIssue', mdsStage: /^A4\.5/ },
  { key: 'prd', label: 'PRD', subStage: 'PRD', pd: null, mds: d => ({ issued: d.prd?.scheduled, grade: d.prd?.status, graded: d.prd?.statusDate }), mdsStage: /^PRD/ },
];

const REISSUE = new Set(['C', 'Rejected', 'QA Rejected']);
const IN_FLIGHT = { Submitted: 'In QA', Approved: 'QA approved, to issue', 'Awaiting Issue': 'Awaiting issue' };
const DONE_DRAWING = new Set(['Complete', 'In Production', 'As Built Updates']);
const iso = d => (d ? toISO(d) : null);
const wd = (date, n) => iso(addWD(toDate(date), n));
const later = (a, b) => (!a ? b : !b ? a : (a > b ? a : b));
const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));

// P01 → P02, C03 → C04; first rev of a stage when nothing is known
export function nextRev(rev, stageKey) {
  if (stageKey === 'c01' && (!rev || /^P/i.test(rev))) return 'C01';
  if (!rev) return 'P01';
  const m = /^([A-Z]+)(\d+)$/i.exec(rev);
  if (!m) return null;
  return `${m[1].toUpperCase()}${String(Number(m[2]) + 1).padStart(m[2].length, '0')}`;
}

function actualsFromSubmissions(subs) {
  const byRev = new Map();
  for (const s of subs.filter(x => x.issued && x.grade !== 'QA Rejected')) {
    const k = s.revision || `#${s.id}`;
    const prev = byRev.get(k);
    if (!prev || (s.createdAt || '') > (prev.createdAt || '')) byRev.set(k, s);
  }
  const entries = [...byRev.values()]
    .sort((a, b) => a.issued.localeCompare(b.issued) || (a.createdAt || '').localeCompare(b.createdAt || ''))
    .map(s => ({
      rev: s.revision || null,
      issued: { date: s.issued, kind: 'act' },
      result: s.grade ? { date: s.reviewed || null, kind: 'act', grade: s.grade } : null,
      url: s.url,
    }));
  const lastIssued = entries.at(-1)?.issued.date || '';
  const flight = subs
    .filter(s => !s.issued && IN_FLIGHT[s.status] && (s.submitted || s.createdAt || '').slice(0, 10) >= lastIssued)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
  return { entries, flight };
}

/**
 * @param drawings, submissions   snapshot rows
 * @param programmeRows           Programme Dates snapshot rows (Current baseline, inputs, item forecast)
 * @param tasks, projects         snapshot rows (item status / NCA, project periods)
 * @returns Map drawingId → { s4, s5, c01, prd: Entry[] | null, meta: { [stageKey]: { baseline, variance, rag, unverified, skipped } } }
 */
export function buildDrawingRevs({ drawings = [], submissions = [], programmeRows = [], tasks = [], projects = [], today = '' }) {
  const subsBy = new Map();
  for (const s of submissions) {
    if (s.archived) continue;
    for (const id of s.drawingIds || []) {
      if (!subsBy.has(id)) subsBy.set(id, []);
      subsBy.get(id).push(s);
    }
  }
  const pdBy = new Map();
  for (const r of programmeRows) {
    if (r.archived || !r.current) continue;
    for (const id of r.itemIds || []) { if (!pdBy.has(id)) pdBy.set(id, {}); pdBy.get(id)[r.stage] = r; }
  }
  const taskBy = new Map(tasks.map(t => [t.id, t]));
  const projBy = new Map(projects.map(p => [p.id, p]));
  const out = new Map();

  for (const d of drawings) {
    if (d.archived) continue;
    const itemId = d.itemIds?.[0];
    const task = taskBy.get(itemId);
    const pd = pdBy.get(itemId) || {};
    const P = resolveProjectPeriods(engineProject(projBy.get(task?.projectId))).values;
    const subs = subsBy.get(d.id) || [];
    const counted = d.type === 'Drawing';
    const nca = !!d.noClientApproval || !!task?.noClientApproval;
    const live = !!task && !/^omitted$/i.test(task.status || '') && !PAST_DRAWING.test(task.status || '');
    const result = { meta: {} };
    let knownRev = null;
    let prevReturn = null;     // previous stage's latest return, actual or forecast

    // Pass 1: actual entries per stage, dropping closed-cycle issues (on/before the
    // previous stage's latest issue) from both the Submissions DB and the drawing schedule
    const act = {};
    let lastIssue = null;
    for (const st of REV_STAGES) {
      const stageSubs = subs.filter(s => s.stage === st.subStage);
      let { entries, flight } = actualsFromSubmissions(stageSubs);
      entries = entries.filter(e => !(lastIssue && e.issued.date <= lastIssue));
      const m = st.mds(d);
      if (!entries.length && m.issued && !(lastIssue && m.issued <= lastIssue)) {
        const graded = m.graded && m.graded >= m.issued ? m.graded : null;
        entries = [{
          rev: st.mdsStage.test(d.stage || '') ? d.rev || null : null,
          issued: { date: m.issued, kind: 'act' },
          result: m.grade || graded ? { date: graded, kind: 'act', grade: m.grade || null } : null,
          source: 'schedule', url: d.url,
        }];
      }
      if (entries.length) lastIssue = entries.at(-1).issued.date;
      act[st.key] = { entries, flight };
    }
    // Whether a later stage has already started (then nothing earlier is forecast)
    const startedAfter = {};
    let laterStarted = false;
    for (const st of [...REV_STAGES].reverse()) {
      startedAfter[st.key] = laterStarted;
      if (act[st.key].entries.length || act[st.key].flight) laterStarted = true;
    }

    for (const st of REV_STAGES) {
      const row = st.pd ? pd[nca && st.key === 'c01' ? 'PRD' : st.pd] : null;
      const skip = (st.key === 's4' || st.key === 's5') && nca
        || (st.key === 's5' && (d.s5?.status === 'NA' || !!row?.notRequired));
      let { entries, flight } = act[st.key];
      entries = entries.map(e => ({ ...e, result: e.result && { ...e.result } }));
      if (skip && !entries.length) { result[st.key] = null; result.meta[st.key] = { skipped: true }; continue; }
      for (const e of entries) if (e.rev) knownRev = e.rev;

      const qa = num(row?.accQaDays) ?? P.qa;
      const review = st.review ? (num(row?.accReviewDays) ?? P[st.review]) : 0;
      const firstIssue = st.key === 's4' || (nca && st.key === 'c01');
      const dtEntered = num(row?.dtDays);
      const issuedInStage = entries.some(e => e.issued.kind === 'act');
      const dtDays = (!issuedInStage && dtEntered !== null) ? dtEntered
        : firstIssue ? (dtEntered ?? PROVISIONAL_DT_DAYS) : P[st.dt] ?? 7;
      const unverified = firstIssue && !issuedInStage && dtEntered === null;
      const canForecast = counted && live && st.pd && !DONE_DRAWING.has(d.status) && !startedAfter[st.key];

      if (canForecast) {
        const itemFc = row?.forecast?.sub || null;
        const last = entries.at(-1);
        // Return of the last issue, if not graded yet
        if (last && !last.result) {
          last.result = { date: later(wd(last.issued.date, review), today), kind: 'fc', grade: null };
        }
        const needsIssue = !last || REISSUE.has(last.result?.grade);
        if (needsIssue) {
          let issueDate, why;
          if (last) {                                   // reissue after C, from the return
            const redo = (firstIssue && !nca ? P.revisionIssue : P[st.dt] ?? P.revisionIssue) + qa;
            issueDate = wd(last.result.date || last.issued.date, redo); why = 'reissue';
          } else if (prevReturn) {                       // next stage, chained from this drawing's previous return
            issueDate = wd(prevReturn, P.mobilisation + dtDays + qa); why = 'chain';
          } else {                                       // first issue: the item's forecast, else from today
            issueDate = itemFc || wd(today, dtDays + qa); why = itemFc ? 'item' : 'today';
          }
          if (issueDate < today) issueDate = today;
          if (flight && issueDate > today && why !== 'item') issueDate = later(today, wd(today, Math.min(qa, 1)));
          entries.push({
            rev: flight?.revision || nextRev(knownRev || (st.mdsStage.test(d.stage || '') ? null : d.rev), st.key),
            issued: { date: issueDate, kind: 'fc' },
            result: review ? { date: wd(issueDate, review), kind: 'fc', grade: null } : { date: issueDate, kind: 'fc', grade: null },
            note: flight ? IN_FLIGHT[flight.status] : unverified ? 'S4 DT Days provisional (10)' : null,
            inFlight: !!flight, url: flight?.url,
          });
        }
      } else if (flight) {
        entries.push({ rev: flight.revision || null, issued: { date: null, kind: 'fc' }, result: null, note: IN_FLIGHT[flight.status], inFlight: true, url: flight.url });
      }

      for (const e of entries) if (e.rev) knownRev = e.rev;
      const lastE = entries.at(-1);
      if (lastE) prevReturn = lastE.result?.date || lastE.issued.date || prevReturn;

      // Baseline marker + RAG against this drawing's latest issue in the stage
      const bl = row?.baseline?.sub || null;
      const issue = lastE?.issued?.date || null;
      const actual = lastE?.issued?.kind === 'act';
      const variance = bl && issue ? wdBetween(bl, issue) : null;
      result.meta[st.key] = {
        baseline: bl, variance, unverified: unverified && !!entries.length,
        rag: !bl || !issue ? null : actual ? 'Done' : variance > 0 ? 'Red' : variance > -AMBER_BAND_WD ? 'Amber' : 'Green',
      };
      result[st.key] = skip && !entries.length ? null : entries;
    }
    out.set(d.id, result);
  }
  return out;
}

export const revText = e => [
  e.rev || '—',
  e.issued.date ? `${e.issued.kind === 'fc' ? 'fc ' : ''}${e.issued.date}` : e.note || 'TBC',
  e.result ? `${e.result.grade || (e.result.kind === 'fc' ? 'fc' : 'returned')} ${e.result.date || ''}`.trim() : null,
].filter(Boolean).join(' ');
