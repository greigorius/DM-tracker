// Each drawing's revisions within each stage, for the Drawings tracker.
//
// Actuals come from the Submissions DB (Drawing Flow): one row per submission,
// with its Stage, Revision, Issued (to the client) and Client Grade, graded on
// Reviewed. QA bounces that never reached the client are left out. Drawings
// issued before the Drawing Flow started have no Submissions rows, so the
// Master Drawing Schedule's stage dates stand in (rev unknown unless it's the
// drawing's current stage).
//
// Where nothing is recorded, dates are forecast:
//   - result of an issued rev not yet graded: issue + client review / sign-off
//     period (or the item's forecast approval when later)
//   - next issue (no issue yet in the stage, or the last one came back C):
//     the item's forecast submission from the programme engine (or, when that
//     is before this drawing came back, return + DT revision period + QA),
//     and its forecast approval.
// Forecasts are only given for counted drawings (Dwg No. Assigned = Drawing),
// on live items, for stages the drawing still needs.

import { addWD, toISO, toDate, resolvePeriods } from './programme/schedule.js';

export const REV_STAGES = [
  { key: 's4', label: 'S4', subStage: 'S4', mds: d => ({ issued: d.s4?.submitted, grade: d.s4?.status, graded: d.s4?.statusDate }), sub: 'sub1A', appr: 's4A', period: 'clientReview', mdsStage: /^S4/ },
  { key: 's5', label: 'S5', subStage: 'S5', mds: d => ({ issued: d.s5?.submitted, grade: d.s5?.status, graded: d.s5?.statusDate }), sub: 'sub2A', appr: 's5A', period: 'clientReview', mdsStage: /^S5/ },
  { key: 'c01', label: 'A4.5', subStage: 'A4.5', mds: d => ({ issued: d.c01?.submitted, grade: d.c01?.signOff ? 'Signed off' : null, graded: d.c01?.signOff }), sub: 'subCA', appr: 'c01SignOffAdj', period: 'c01SignOff', mdsStage: /^A4\.5/ },
  { key: 'prd', label: 'PRD', subStage: 'PRD', mds: d => ({ issued: d.prd?.scheduled, grade: d.prd?.status, graded: d.prd?.statusDate }), mdsStage: /^PRD/ },
];

const REISSUE = new Set(['C', 'Rejected', 'QA Rejected']);
const IN_FLIGHT = { Submitted: 'In QA', Approved: 'QA approved, to issue', 'Awaiting Issue': 'Awaiting issue' };
const DONE_DRAWING = new Set(['Complete', 'In Production', 'As Built Updates']);
const iso = d => (d ? toISO(d) : null);
const later = (a, b) => (!a ? b : !b ? a : (a > b ? a : b));

// P01 → P02, C03 → C04; first rev of a stage when nothing is known
export function nextRev(rev, stageKey) {
  if (stageKey === 'c01' && (!rev || /^P/i.test(rev))) return 'C01';
  if (!rev) return 'P01';
  const m = /^([A-Z]+)(\d+)$/i.exec(rev);
  if (!m) return null;
  return `${m[1].toUpperCase()}${String(Number(m[2]) + 1).padStart(m[2].length, '0')}`;
}

function actualsFromSubmissions(subs) {
  // Issued revs: latest row per revision
  const byRev = new Map();
  for (const s of subs.filter(x => x.issued)) {
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
  // A rev with the DM now (not issued yet), after the last issue
  const lastIssued = entries.at(-1)?.issued.date || '';
  const flight = subs
    .filter(s => !s.issued && IN_FLIGHT[s.status] && (s.submitted || s.createdAt || '').slice(0, 10) >= lastIssued)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
  return { entries, flight };
}

/**
 * @param drawings     drawings snapshot rows
 * @param submissions  submissions snapshot rows
 * @param programme    Map itemId → { row, c, project } (hub-core/programme/adapter buildProgramme)
 * @returns Map drawingId → { s4: Entry[], s5, c01, prd }
 *   Entry = { rev, issued: {date, kind}, result: {date, kind, grade} | null, note, inFlight, source, url }
 */
export function buildDrawingRevs({ drawings = [], submissions = [], programme = new Map(), today = '' }) {
  const subsBy = new Map();
  for (const s of submissions) {
    if (s.archived) continue;
    for (const id of s.drawingIds || []) {
      if (!subsBy.has(id)) subsBy.set(id, []);
      subsBy.get(id).push(s);
    }
  }
  const out = new Map();
  for (const d of drawings) {
    if (d.archived) continue;
    const subs = subsBy.get(d.id) || [];
    const prog = programme.get(d.itemIds?.[0]);
    const periods = prog ? resolvePeriods(prog.row, prog.project).values : null;
    const counted = d.type === 'Drawing';
    const nca = !!d.noClientApproval || !!prog?.c?.nca;
    const result = {};
    let knownRev = null;          // latest rev seen so far, for numbering forecasts
    let laterStageStarted = false;

    // Walk stages backwards to know whether a later stage has already started
    const startedAfter = {};
    for (const st of [...REV_STAGES].reverse()) {
      startedAfter[st.key] = laterStageStarted;
      const m = st.mds(d);
      if (m.issued || subs.some(s => s.stage === st.subStage && (s.issued || IN_FLIGHT[s.status]))) laterStageStarted = true;
    }

    for (const st of REV_STAGES) {
      const stageSubs = subs.filter(s => s.stage === st.subStage);
      let { entries, flight } = actualsFromSubmissions(stageSubs);
      const m = st.mds(d);
      if (!entries.length && m.issued) {
        // Before the Drawing Flow: the schedule's stage dates
        entries = [{
          rev: st.mdsStage.test(d.stage || '') ? d.rev || null : null,
          issued: { date: m.issued, kind: 'act' },
          result: m.grade || m.graded ? { date: m.graded || null, kind: 'act', grade: m.grade || null } : null,
          source: 'schedule',
          url: d.url,
        }];
      }
      for (const e of entries) if (e.rev) knownRev = e.rev;

      const na = (st.key === 's4' || st.key === 's5') && nca
        || (st.key === 's5' && d.s5?.status === 'NA');
      const canForecast = counted && prog && !prog.c?.omitted && !na && !DONE_DRAWING.has(d.status) && !startedAfter[st.key] && st.sub;

      if (canForecast) {
        const fcSub = iso(prog.c[st.sub]);
        const fcAppr = iso(prog.c[st.appr]);
        // Result of the last issue, if not graded yet
        const last = entries.at(-1);
        if (last && !last.result && periods) {
          const byPeriod = iso(addWD(toDate(last.issued.date), periods[st.period] || 0));
          last.result = { date: fcAppr && fcAppr > last.issued.date ? later(byPeriod, fcAppr) : byPeriod, kind: 'fc', grade: null };
        }
        // Next issue: nothing issued yet, or the last one came back for reissue
        const needsIssue = !last || REISSUE.has(last.result?.grade);
        if (needsIssue) {
          const after = last?.result?.date || last?.issued.date || '';
          // The item's forecast, unless it's before this drawing came back: then
          // the reissue is the DT revision period + QA after the return
          const redraw = (st.key === 'c01' ? periods.constrIssue : periods.revisionIssue) + periods.qa;
          let issueDate = fcSub && fcSub > after ? fcSub : after ? iso(addWD(toDate(after), redraw)) : null;
          if (flight && issueDate && issueDate < today) issueDate = today;   // with the DM now: goes out once issued
          const resultDate = issueDate
            ? (fcAppr && fcAppr > issueDate ? fcAppr : periods ? iso(addWD(toDate(issueDate), periods[st.period] || 0)) : null)
            : null;
          entries.push({
            rev: flight?.revision || nextRev(knownRev || (st.mdsStage.test(d.stage || '') ? null : d.rev), st.key),
            issued: { date: issueDate, kind: 'fc' },
            result: resultDate ? { date: resultDate, kind: 'fc', grade: null } : null,
            note: flight ? IN_FLIGHT[flight.status] : issueDate ? null : 'Date to be confirmed',
            inFlight: !!flight,
            url: flight?.url,
          });
        }
      } else if (flight) {
        entries.push({ rev: flight.revision || null, issued: { date: null, kind: 'fc' }, result: null, note: IN_FLIGHT[flight.status], inFlight: true, url: flight.url });
      }
      for (const e of entries) if (e.rev) knownRev = e.rev;
      result[st.key] = na && !entries.length ? null : entries;
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

