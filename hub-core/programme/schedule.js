// ─────────────────────────────────────────────────────────────────────────────
// AXIOM SCHEDULE ENGINE
//
// Pure functions — no React, no fetch. Imported by App.jsx and by the tests in
// lib/schedule.test.js (run with `node lib/schedule.test.js`).
//
// An item's programme is a chain of steps between milestones. Each step has a
// duration in UK working days that comes from (in order of precedence):
//   item exception (Tasks DB) → project override (Projects DB) → PERIOD_DEFAULTS
//
// Plan  = the chain with no actuals and no holds:
//           forward from the start anchor (Date of Instruction, else 1st DT Start (Plan)),
//           or backward from the target (Production Date (Plan)) when there is no start.
// Adj   = forward from the start, each milestone replaced by its actual where one
//         exists, with holds (variations / RFIs) pausing the step they land in.
// Float = working days from the Adj production date to the target (negative = late).
// ─────────────────────────────────────────────────────────────────────────────

// UK PUBLIC HOLIDAYS — England & Wales 2024–2028
export const UK_HOLIDAYS = new Set([
  "2024-01-01","2024-03-29","2024-04-01","2024-05-06","2024-05-27",
  "2024-08-26","2024-12-25","2024-12-26",
  "2025-01-01","2025-04-18","2025-04-21","2025-05-05","2025-05-26",
  "2025-08-25","2025-12-25","2025-12-26",
  "2026-01-01","2026-04-03","2026-04-06","2026-05-04","2026-05-25",
  "2026-08-31","2026-12-25","2026-12-28",
  "2027-01-01","2027-03-26","2027-03-29","2027-05-03","2027-05-31",
  "2027-08-30","2027-12-27","2027-12-28",
  "2028-01-03","2028-04-14","2028-04-17","2028-05-01","2028-05-29",
  "2028-08-28","2028-12-25","2028-12-26",
]);

// Local Y-M-D key (avoids UTC drift from toISOString on dates near midnight)
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function isWorkday(d) {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  return !UK_HOLIDAYS.has(ymd(d));
}
// Parse 'YYYY-MM-DD' (or a Date) to a local-noon Date
export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) { const d = new Date(v); d.setHours(12,0,0,0); return isNaN(d) ? null : d; }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  const d = new Date(v); if (isNaN(d)) return null; d.setHours(12,0,0,0); return d;
}
export function snapFwd(date) {
  const d = toDate(date); if (!d) return null;
  while (!isWorkday(d)) d.setDate(d.getDate()+1);
  return d;
}
export function addWD(start, n) {
  if (!start || n == null) return null;
  const d = toDate(start);
  let rem = Math.abs(n); const dir = n >= 0 ? 1 : -1;
  while (rem > 0) { d.setDate(d.getDate()+dir); if (isWorkday(d)) rem--; }
  return d;
}
// Working days after a, up to and including b (negative when b is before a)
export function wdBetween(a, b) {
  if (!a || !b) return 0;
  const da = toDate(a), db = toDate(b);
  if (+da === +db) return 0;
  const sign = db > da ? 1 : -1;
  const [lo, hi] = sign > 0 ? [da, db] : [db, da];
  let c = 0; const cur = new Date(lo);
  while (cur < hi) { cur.setDate(cur.getDate()+1); if (isWorkday(cur)) c++; }
  return c * sign;
}
export function toISO(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : toDate(d);
  return dt && !isNaN(dt) ? ymd(dt) : null;
}

// ── MDS stage completion (shared by server + client) ─────────────────────────
// Per stage, raw counts over the item's drawings:
//   n/done/first/last — drawings with Dwg No. Assigned = Drawing that go through the stage
//   an/afirst/alast   — any drawing with a date (fallback when none are type Drawing)
// Engine row key each stage feeds:
export const MDS_STAGE_KEYS = {
  s4Sub: 'sub1ActDate', s4Date: 's4Date', s5Sub: 'sub2ActDate',
  s5Date: 's5Date', c01Sub: 'subCActDate', c01Date: 'c01SignOffActDate',
};
const minD = (a, b) => (!a ? b ?? null : !b ? a : (a < b ? a : b));
const maxD = (a, b) => (!a ? b ?? null : !b ? a : (a > b ? a : b));
export function emptyStages() {
  return Object.fromEntries(Object.keys(MDS_STAGE_KEYS).map(k =>
    [k, { n: 0, done: 0, first: null, last: null, an: 0, afirst: null, alast: null }]));
}
export function mergeStages(a = {}, b = {}) {
  const out = emptyStages();
  for (const k of Object.keys(out)) {
    const x = a[k] || {}, y = b[k] || {};
    out[k] = { n: (x.n || 0) + (y.n || 0), done: (x.done || 0) + (y.done || 0),
      first: minD(x.first, y.first), last: maxD(x.last, y.last),
      an: (x.an || 0) + (y.an || 0), afirst: minD(x.afirst, y.afirst), alast: maxD(x.alast, y.alast) };
  }
  return out;
}
// A stage is COMPLETE when every counted drawing has reached it → its date is the
// last of them. Until then it is OPEN: no actual date, and the engine forecasts it
// no earlier than today. Returns { fields, open, progress } keyed by engine row key.
export function resolveStages(stages) {
  const fields = {}, open = [], progress = {};
  for (const [k, rowKey] of Object.entries(MDS_STAGE_KEYS)) {
    const st = stages?.[k];
    if (!st) continue;
    if (st.n > 0) {
      progress[rowKey] = { n: st.n, done: st.done, first: st.first, last: st.last };
      if (st.done >= st.n) fields[rowKey] = st.last;
      else { fields[rowKey] = null; open.push(rowKey); }
    } else if (st.an > 0) {
      fields[rowKey] = st.alast;   // no assigned drawings: fall back to all dated drawings
      progress[rowKey] = { n: st.an, done: st.an, first: st.afirst, last: st.alast, unassigned: true };
    } else fields[rowKey] = null;
  }
  return { fields, open, progress };
}

// ── Per-drawing positions (read-only view) ───────────────────────────────────
// Where each drawing on the Master Drawing Schedule has got to. An item's stage is
// only complete when every counted drawing has passed it, so an item whose drawings
// are at different points ("split") shows the slowest drawing's journey. This lets
// the table show each drawing's own position.
// Counted = Dwg No. Assigned "Drawing" (same rule as the stage dates).
export const DRAWING_STEPS = [
  { key: 'none',  label: 'Not issued' },
  { key: 's4Sub', label: 'S4 issued' },
  { key: 's4',    label: 'S4 status' },
  { key: 's5Sub', label: 'S5 issued' },
  { key: 's5',    label: 'S5 status' },
  { key: 'cSub',  label: 'A4.5 issued' },
  { key: 'cSo',   label: 'A4.5 signed off' },
];
export function drawingPosition(d, nca = false) {
  const prd = nca || d.nca;
  const c = prd ? { s4Sub: 'PRD issued', cSub: 'PRD issued', cSo: 'PRD signed off' } : {};
  const at = (i, date, status) => ({ step: i, key: DRAWING_STEPS[i].key,
    label: c[DRAWING_STEPS[i].key] || DRAWING_STEPS[i].label, date, status: status || null });
  if (d.cSo)   return at(6, d.cSo);
  if (d.cSub)  return at(5, d.cSub);
  if (!prd) {
    if (d.s5Date) return at(4, d.s5Date, d.s5St);
    if (d.s5Sub) return at(3, d.s5Sub);
    if (d.s4Date) return at(2, d.s4Date, d.s4St);
    if (d.s4Sub) return at(1, d.s4Sub);
  }
  return at(0, null);
}
// { dwgs: [{ ...drawing, pos, counted, behind }], split, counted } — drawings sorted
// by number; `behind` = a counted drawing behind the furthest one (holding stages open)
export function drawingBreakdown(row) {
  const list = (row?.drawings || []).map(d => ({ ...d, counted: d.assigned === 'Drawing', pos: drawingPosition(d, row.noClientApproval) }));
  list.sort((a, b) => (b.counted - a.counted) || String(a.no || '').localeCompare(String(b.no || ''), undefined, { numeric: true }));
  const counted = list.filter(d => d.counted);
  const steps = new Set(counted.map(d => d.pos.step));
  const top = counted.length ? Math.max(...counted.map(d => d.pos.step)) : 0;
  for (const d of list) d.behind = d.counted && steps.size > 1 && d.pos.step < top;
  return { dwgs: list, split: steps.size > 1, counted: counted.length };
}

// ── Periods ──────────────────────────────────────────────────────────────────
export const PERIOD_DEFAULTS = {
  coordination:   10,  // Date of Instruction → 1st DT Start
  approvalIssue:  10,  // DT drawing, Approval (S4) issue
  qa:              3,  // DM QA, DT delivery → DM issue (every issue)
  clientReview:   10,  // client review, S4 and S5
  mobilisation:    3,  // approval → next DT Start (DT mobilisation), S5 and A4.5
  revisionIssue:   7,  // DT drawing, Revision (S5) issue
  constrIssue:     3,  // DT drawing, Construction (C01) issue
  c01SignOff:      2,  // C01 submission → C01 sign off
  productionPack: 21,  // C01 sign off → Production Date
};
export const PERIOD_LABELS = {
  coordination: 'Coordination', approvalIssue: 'Approval Issue', qa: 'QA',
  clientReview: 'Client review', mobilisation: 'DT Mobilisation', revisionIssue: 'Revision Issue',
  constrIssue: 'Construction Issue', c01SignOff: 'A4.5 / PRD sign-off', productionPack: 'Production Pack',
};
// Project object key (from /api/notion/projects) for each period
export const PROJECT_PERIOD_KEYS = {
  coordination: 'coordinationDays', approvalIssue: 'approvalIssueDays', qa: 'qaDays',
  clientReview: 'approvalDays', mobilisation: 'mobilisationDays', revisionIssue: 'revisionDays', constrIssue: 'constrIssueDays',
  c01SignOff: 'c01SignOffDays', productionPack: 'productionPackDays',
};
// Notion property on the Projects DB for each period
export const PROJECT_PERIOD_PROPS = {
  coordination: 'Coordination Days', approvalIssue: 'Approval Issue Days', qa: 'QA Days',
  clientReview: 'Approval Days', mobilisation: 'DT Mobilisation Days', revisionIssue: 'Revision Days', constrIssue: 'Construction Issue Days',
  c01SignOff: 'C01 Sign Off Days', productionPack: 'Production Pack Days',
};
// Item-level exceptions (Tasks DB) — row key for each period
const ITEM_PERIOD_KEYS = { coordination: 'coordDays', approvalIssue: 'dd1', constrIssue: 'constrDrawDays' };

const isNum = v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v));

export function resolveProjectPeriods(project) {
  const values = {}, source = {};
  for (const k of Object.keys(PERIOD_DEFAULTS)) {
    const pv = project?.[PROJECT_PERIOD_KEYS[k]];
    if (isNum(pv)) { values[k] = Number(pv); source[k] = 'P'; }
    else           { values[k] = PERIOD_DEFAULTS[k]; source[k] = 'D'; }
  }
  return { values, source };
}
// Item-only extra coordination per issue (client comments etc.) — added to that
// issue's DT period. Default 0.
export const ISSUE_COORD_KEYS = { coordS4: 'coordS4Days', coordS5: 'coordS5Days', coordC01: 'coordC01Days' };

// Item-only acceleration (Adjusted only): a shorter period for one stage of this
// item, e.g. a client agreeing a 2-day S5 review. Blank = normal period, 0 = remove.
// Plan stays as the baseline, so the gain shows as Variance vs Plan.
export const ACCEL_KEYS = {
  approvalIssue: 'accApprovalIssueDays', s4Review: 'accS4ReviewDays', revisionIssue: 'accRevisionDays',
  s5Review: 'accS5ReviewDays', constrIssue: 'accConstrIssueDays', qa: 'accQaDays',
  c01SignOff: 'accC01SignOffDays', productionPack: 'accProdPackDays',
};
// Notion number property on the Tasks DB for each acceleration field (row key → prop)
export const ACCEL_PROPS = {
  accApprovalIssueDays: 'Accel Approval Issue Days', accS4ReviewDays: 'Accel S4 Review Days',
  accRevisionDays: 'Accel Revision Issue Days',     accS5ReviewDays: 'Accel S5 Review Days',
  accConstrIssueDays: 'Accel Construction Issue Days', accQaDays: 'Accel QA Days',
  accC01SignOffDays: 'Accel C01 Sign Off Days',     accProdPackDays: 'Accel Production Pack Days',
};
// Which acceleration field applies to each chain step
const STEP_ACCEL = {
  del1: 'approvalIssue', sub1: 'qa', s4: 's4Review', del2: 'revisionIssue', sub2: 'qa',
  s5: 's5Review', delC: 'constrIssue', subC: 'qa', c01: 'c01SignOff', prod: 'productionPack',
};
export function resolveAccel(row) {
  const out = {};
  for (const [k, rk] of Object.entries(ACCEL_KEYS)) {
    const v = row?.[rk];
    if (v !== null && v !== undefined && v !== '' && !isNaN(Number(v))) out[k] = Math.max(0, Number(v));
  }
  return out;
}

export function resolvePeriods(row, project) {
  const { values, source } = resolveProjectPeriods(project);
  for (const [k, rk] of Object.entries(ITEM_PERIOD_KEYS)) {
    if (isNum(row?.[rk])) { values[k] = Number(row[rk]); source[k] = 'I'; }
  }
  for (const [k, rk] of Object.entries(ISSUE_COORD_KEYS)) {
    if (isNum(row?.[rk])) { values[k] = Number(row[rk]); source[k] = 'I'; }
    else { values[k] = 0; source[k] = 'D'; }
  }
  return { values, source };
}

// ── Reissues and programme-driven dates ─────────────────────────────────────
// One forward-looking slot per stage. History lives in the Submissions DB.
//   actual  latest actual issue for the stage (drawing schedule)
//   adj     stored Adj submission date (Tasks DB) — the next issue
// A stage's CURRENT CYCLE starts after its latest actual issue. Anything dated on
// or before it belongs to a closed cycle and locks nothing; recorded actuals are
// never overwritten.
// Once a stage has an actual it stays locked to it until a reissue is identified:
//   - Programme-driven items: the client programme date (typed in from Asta etc.)
//     is later than the actual — entering it is the identification.
//   - Other items: a Reissue Reason is set, or the drawing schedule shows status C
//     for the stage, given after the latest issue (S4 / S5 only).
// Status C with no reissue date yet = 'required': the reissue is forecast from
// today (DT period + QA) so every later stage re-anchors to the new cycle.
export const ISSUE_STAGES = [
  { key: 's4',  label: 'S4',  start: 'dtStart1', del: 'del1', sub: 'sub1', appr: 's4',
    subAct: 'sub1ActDate', apprAct: 's4Date',            dtActs: ['dtStart1Act', 'del1Act'],
    inKey: 'subAdj1In', prop: '1st Submission Date (Adj)', ncaSkip: true, status: 's4Status',
    startIn: null,       delIn: 'del1AdjIn', delProp: '1st DT Delivery (Adj)' },   // no 1st DT Start (Adj) property in Notion
  { key: 's5',  label: 'S5',  start: 'st2',      del: 'del2', sub: 'sub2', appr: 's5',
    subAct: 'sub2ActDate', apprAct: 's5Date',            dtActs: ['dtStart2Act', 'del2Act'],
    inKey: 'subAdj2In', prop: '2nd Submission Date (Adj)', ncaSkip: true, status: 's5Status',
    startIn: 'st2AdjIn', delIn: 'del2AdjIn', delProp: '2nd DT Delivery (Adj)' },
  { key: 'c01', label: 'A4.5 / PRD', start: 'stC',      del: 'delC', sub: 'subC', appr: 'c01',
    subAct: 'subCActDate', apprAct: 'c01SignOffActDate', dtActs: ['stCActDate', 'delCAct'],
    inKey: 'subAdjCIn', prop: 'Constr. Submission Date (Adj)', status: null,
    startIn: 'stCAdjIn', delIn: 'delCAdjIn', delProp: 'Constr. DT Delivery (Adj)' },
];
// The construction issue is A4.5 (Authorised Mfg. & Constr. Design) when the item
// needs client approval, and PRD (For Production) when it doesn't (No Client Approval).
// Notion property names keep "C01"; only what people see changes.
export const constrLabel = nca => (nca ? 'PRD' : 'A4.5');
export const stageLabel  = (sd, nca) => (sd.key === 'c01' ? constrLabel(nca) : sd.label);

export const REISSUE_REASONS = ['Client Comments', 'Design Change', 'Coordination', 'Programme'];

// DT Start (Adj) set by hand (any date, past included — it may only be logged here).
// Marked per stage in the Tasks DB multi-select "Manual DT Start" so a sync never
// replaces it; it's treated as a recorded date. No marker = automated.
export const MANUAL_DT_START_PROP = 'Manual DT Start';
export const MANUAL_DT_START_OPTS = { s5: 'S5', c01: 'A4.5/PRD' };
export const manualDtStart = (r, key) => {
  const opt = MANUAL_DT_START_OPTS[key];
  const sd = ISSUE_STAGES.find(x => x.key === key);
  return opt && sd?.startIn && (r?.manualDtStart || []).includes(opt) ? snapFwd(r[sd.startIn]) : null;
};

// Drawing-schedule status letters for a stage (array of unique values, or a string)
const statusLetters = v => (Array.isArray(v) ? v : v ? [v] : [])
  .map(x => String(x).replace(/\bstatus\b/gi, '').trim().toUpperCase().split(/[\s\-–:]/)[0]);
export const hasStatusC = v => statusLetters(v).includes('C');

// Cycles across stages (brief Nov 2026 §2): each stage's cycle is also bounded by
// the stage before it. A later stage's actuals dated on or before the previous
// stage's CURRENT submission belong to a closed cycle (e.g. an A4.5 issued in June
// before an S5 reissue in October) and lock nothing — that stage is 'superseded'
// and forecast again, chained after the stage before it. If a stage is reopened
// with no date yet, every later stage's actuals are superseded too.
// On items that aren't programme-driven, a stored Adj submission for a stage with
// no actual is normally just the last forecast; it is read as an identified issue
// date only when it is later than a later stage's actual (that later issue has to
// follow it, so the date was set on purpose).
export function stageInputs(r, nca) {
  const prog = !!r.programmeDriven;
  const out = {};
  const live = ISSUE_STAGES.filter(sd => !(nca && sd.ncaSkip));
  let cutoff = null, cascade = false;
  for (const sd of ISSUE_STAGES) {
    if (nca && sd.ncaSkip) { out[sd.key] = { state: 'na' }; continue; }
    const later = live.slice(live.indexOf(sd) + 1);
    const raw    = snapFwd(r[sd.subAct]);
    const stored = snapFwd(r[sd.inKey]);
    const appr   = snapFwd(r[sd.apprAct]);
    const superseded = !!raw && (cascade || (!!cutoff && raw <= cutoff));
    const actual = superseded ? null : raw;
    // Status C counts only when it was given after the latest issue — a C from an
    // earlier cycle has already been answered by that issue.
    // It also stops counting once a later stage has been issued since.
    const laterIssued = later.some(x => { const d = snapFwd(r[x.subAct]); return d && appr && d > appr; });
    const statusC = !!(sd.status && actual && appr && appr >= actual && !laterIssued && hasStatusC(r[sd.status]));
    const flagged = prog || !!r.reissueReason || statusC;
    const laterActBefore = !!stored && later.some(x => { const d = snapFwd(r[x.subAct]); return d && d < stored; });
    const adjIn  = !actual ? ((prog || laterActBefore) && stored && (!raw || stored > raw) ? stored : null)
                 : (stored && stored > actual && flagged) ? stored : null;
    const state  = !actual ? (adjIn ? (superseded ? 'pending' : 'forecast') : superseded ? 'superseded' : 'none')
                 : adjIn ? 'pending' : statusC ? 'required' : 'closed';
    const fixed  = state === 'pending' || state === 'forecast' ? adjIn : null;
    // The actual this stage's reopened cycle replaces (for the Gantt's closed bar)
    const closedSub = superseded ? raw : (state === 'pending' || state === 'required') ? actual : null;
    out[sd.key] = { state, actual: superseded ? raw : actual, stored, adjIn, fixed, statusC, superseded, closedSub, cutoff };
    // The next stage's cycle starts after this stage's current submission
    const current = state === 'closed' ? actual : fixed;
    if (current) cutoff = current;
    else if (state === 'required' || state === 'superseded') cascade = true;
  }
  return out;
}

// ── Chain definition ─────────────────────────────────────────────────────────
// Each step runs from the previous milestone to `to`. `actual` = row key whose
// date replaces the milestone in the Adj chain. kind: std (Axiom work),
// client (held by client/contractor), link (zero-length hand-over).
// withCoord: include each issue's extra coordination days (Adjusted chain only —
// the Plan is the baseline and never carries them).
function buildSteps(P, nca, withCoord = false, accel = null) {
  const s = (to, period, kind, actual, extra) => {
    const coord = withCoord && extra ? (P[extra] || 0) : 0;
    const normal = period ? P[period] : 0;
    const ak = accel && STEP_ACCEL[to];
    const base = ak && accel[ak] !== undefined ? accel[ak] : normal;
    // saved: days taken out of this step by acceleration (negative if lengthened)
    return { to, period, dur: base + coord, coord, saved: normal - base, kind, actual };
  };
  const tail = [
    { ...s('delC', 'constrIssue', 'std', 'delCAct', 'coordC01'), issueKeys: ['subCActDate', 'c01SignOffActDate'] },
    s('subC', 'qa',             'std',    'subCActDate'),
    s('c01',  'c01SignOff',     'client', 'c01SignOffActDate'),
    s('prod', 'productionPack', 'std',    null),
  ];
  if (nca) return [
    s('dtStart1', 'coordination', 'std',  'dtStart1Act'),
    s('stC',      null,           'link', 'stCActDate'),
    ...tail,
  ];
  return [
    s('dtStart1', 'coordination',  'std',    'dtStart1Act'),
    { ...s('del1', 'approvalIssue', 'std', 'del1Act', 'coordS4'), issueKeys: ['sub1ActDate', 's4Date'] },
    s('sub1',     'qa',            'std',    'sub1ActDate'),
    s('s4',       'clientReview',  'client', 's4Date'),
    s('st2',      'mobilisation',  'std',    'dtStart2Act'),   // DT mobilisation after the S4 approval
    { ...s('del2', 'revisionIssue', 'std', 'del2Act', 'coordS5'), issueKeys: ['sub2ActDate', 's5Date'] },
    s('sub2',     'qa',            'std',    'sub2ActDate'),
    s('s5',       'clientReview',  'client', 's5Date'),
    s('stC',      'mobilisation',  'std',    'stCActDate'),    // DT mobilisation after the S5 approval
    ...tail,
  ];
}

// ── Holds ────────────────────────────────────────────────────────────────────
// Raw hold: { start:'YYYY-MM-DD', end:'YYYY-MM-DD'|null, addedDays:number, label, source }
// end null = still open → runs to today. Overlapping windows are merged so days
// are never counted twice; added days stay with the window they belong to.
export function mergeHolds(holds, today) {
  const t = snapFwd(today || new Date());
  const list = (holds || [])
    .filter(h => h && h.start)
    .map(h => {
      const start = snapFwd(h.start);
      const open  = !h.end;
      let end = open ? t : snapFwd(h.end);
      if (end < start) end = start;
      return { start, end, open, addedDays: Number(h.addedDays) || 0, labels: [h.label].filter(Boolean) };
    })
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const h of list) {
    const last = out[out.length - 1];
    if (last && h.start <= last.end) {
      if (h.end > last.end) last.end = h.end;
      last.open = last.open || h.open;
      last.addedDays += h.addedDays;
      last.labels.push(...h.labels);
    } else out.push({ ...h, labels: [...h.labels] });
  }
  return out;
}

// ── Walks ────────────────────────────────────────────────────────────────────
// manual = { days, at }: extra hold days added to the step running on `at` (today),
// or to the first step if the item hasn't started. Never merged with dated holds.
// fix (Adjusted only): pins = milestone → fixed date (programme / reissue submission),
// back = milestone → back-calculated DT date, ignore = actual keys belonging to an
// issue that is being reissued (superseded).
function forward(steps, startKey, startDate, row, holds, useActuals, manual, today, fix = null, opts = {}) {
  // opts.noOpenFloor: programme-driven items — dates follow the client programme, so
  // open stages are not floored at today (and coordination isn't deferred)
  const openFloor = !!today && !opts.noOpenFloor;
  const ign = k => !!fix?.ignore?.has(k);
  // The start milestone's own actual (e.g. 1st DT Start (Actual)) beats its planned date
  if (useActuals) {
    const st0 = steps.find(st => st.to === startKey);
    const a0 = st0?.actual && !ign(st0.actual) ? snapFwd(row?.[st0.actual]) : null;
    if (a0) startDate = a0;
    else if (fix?.back?.[startKey]) startDate = fix.back[startKey];
  }
  const m = { [startKey]: startDate };
  const E = {};   // cumulative "explained" days (coordination + holds + added) at each milestone
  const S = {};   // cumulative days saved by acceleration at each milestone
  const applied = []; let holdDays = 0, addedDays = 0, carryAdded = 0, coordDays = 0, explained = 0;
  let pending = holds ? [...holds] : [];
  let manualLeft = manual?.days > 0 ? manual.days : 0;
  let prev = startDate;
  let started = startKey === 'instr';
  // A hold that began before the item started delays the start itself.
  if (pending.length) {
    for (const h of [...pending]) {
      if (h.start <= prev) {
        if (h.end > prev) {
          holdDays += wdBetween(prev, h.end);
          prev = h.end; m[startKey] = prev;
          if (h.addedDays) carryAdded += h.addedDays;
          applied.push(h);
        }
        pending = pending.filter(x => x !== h);
      }
    }
  }
  explained = holdDays;
  E[startKey] = explained;
  let saved = 0; S[startKey] = 0;
  // Coordination days of an issue that is IN PROGRESS on the drawing schedule mean
  // "still needs N more days": they are held back and added from today (or from the
  // forecast, if later) at the issue's first open milestone.
  let deferred = 0;

  for (const st of steps) {
    if (!started) { if (st.to === startKey) started = true; continue; }
    let dur = st.dur;
    const extra0 = holdDays + addedDays;      // to measure this step's holds / added days
    coordDays += st.coord || 0;
    let stepCoord = st.coord || 0;
    if (stepCoord && useActuals && openFloor && st.issueKeys?.some(k => row?.mdsOpen?.includes(k))) {
      dur -= stepCoord; deferred += stepCoord; stepCoord = 0;
    }
    if (carryAdded && st.kind === 'std') { dur += carryAdded; addedDays += carryAdded; carryAdded = 0; }
    let end = addWD(prev, dur);
    // Hold landing in this step: pause, then resume the remaining days.
    if (st.kind !== 'link') {
      for (const h of [...pending]) {
        if (h.start >= prev && h.start < end) {
          const elapsed = Math.max(0, wdBetween(prev, h.start));
          let extra = 0;
          if (h.addedDays) {
            if (st.kind === 'std') { extra = h.addedDays; addedDays += h.addedDays; }
            else carryAdded += h.addedDays;   // client review → next Axiom step
          }
          const remaining = Math.max(0, dur - elapsed) + extra;
          holdDays += wdBetween(h.start, h.end);
          end = addWD(h.end, remaining);
          applied.push(h);
          pending = pending.filter(x => x !== h);
        }
      }
    }
    // Manual hold days land in the step running today (or the first step if not started)
    if (manualLeft && st.kind !== 'link' && (manual.at <= prev || manual.at < end)) {
      end = addWD(end, manualLeft);
      holdDays += manualLeft;
      manualLeft = 0;
    }
    const act = useActuals && st.actual && !ign(st.actual) ? snapFwd(row?.[st.actual]) : null;
    const pin = fix?.pins?.[st.to] || null, back = fix?.back?.[st.to] || null;
    // A stage still in progress on the drawing schedule can't finish in the past,
    // and any coordination still needed is added on top.
    let applyDeferred = 0;
    if (!act && !pin && !back && useActuals && openFloor && st.actual && row?.mdsOpen?.includes(st.actual)) {
      if (end < today) end = today;
      if (deferred) { end = addWD(end, deferred); applyDeferred = deferred; deferred = 0; }
    }
    m[st.to] = pin || act || back || end;
    // Days this step was extended by (coordination + holds + added + manual).
    explained += stepCoord + applyDeferred + (holdDays + addedDays - extra0);
    E[st.to] = explained;
    saved += st.saved || 0;
    S[st.to] = saved;
    prev = m[st.to];
  }
  return { m, E, S, holdDays, addedDays, coordDays, applied, saved };
}

function backward(steps, endDate) {
  const m = { prod: endDate };
  let next = endDate;
  for (let i = steps.length - 1; i >= 0; i--) {
    const from = i === 0 ? 'instr' : steps[i - 1].to;
    m[from] = addWD(next, -steps[i].dur);
    next = m[from];
  }
  return m;
}

// ── Minimum periods for squeezing (brief Nov 2026 §4) ────────────────────────
// A squeezed DT / QA period stops here. Item Accel … Days (if set) is the floor
// instead; project overrides on the Projects DB (optional properties).
export const PERIOD_MINIMUMS = { approvalIssue: 5, revisionIssue: 3, constrIssue: 2, qa: 1 };
export const MIN_PROJECT_KEYS = { approvalIssue: 'minApprovalIssueDays', revisionIssue: 'minRevisionDays',
  constrIssue: 'minConstrIssueDays', qa: 'minQaDays' };
export const MIN_PROJECT_PROPS = { approvalIssue: 'Min Approval Issue Days', revisionIssue: 'Min Revision Days',
  constrIssue: 'Min Construction Issue Days', qa: 'Min QA Days' };
export function resolveMinimums(project) {
  const out = {};
  for (const [k, v] of Object.entries(PERIOD_MINIMUMS)) {
    const pv = project?.[MIN_PROJECT_KEYS[k]];
    out[k] = isNum(pv) ? Math.max(1, Number(pv)) : v;
  }
  return out;
}
// Each issue's DT period, its acceleration field and its coordination days
const STAGE_PERIODS = {
  s4:  { period: 'approvalIssue', accel: 'approvalIssue', coord: 'coordS4' },
  s5:  { period: 'revisionIssue', accel: 'revisionIssue', coord: 'coordS5' },
  c01: { period: 'constrIssue',   accel: 'constrIssue',   coord: 'coordC01' },
};
// n working days after start, not counting days inside a hold (merged holds)
function addWDHold(start, n, holds) {
  const d = toDate(start); let rem = n;
  const held = x => (holds || []).some(h => x > h.start && x <= h.end);
  while (rem > 0) { d.setDate(d.getDate() + 1); if (isWorkday(d) && !held(d)) rem--; }
  return d;
}

// Working days after a, up to and including b, not counting days inside a hold
function wdFree(a, b, holds) {
  if (!a || !b || b <= a) return 0;
  const d = toDate(a), e = toDate(b); let n = 0;
  const held = x => (holds || []).some(h => x > h.start && x <= h.end);
  while (d < e) { d.setDate(d.getDate() + 1); if (isWorkday(d) && !held(d)) n++; }
  return n;
}

// ── Order rule (brief Nov 2026 §3, §6) ───────────────────────────────────────
// S4 sub < S5 DT Start ≤ S5 DT Delivery < S5 sub < A4.5 DT Start ≤ A4.5 DT Delivery
//   < A4.5 sub < Production; each DT Start ≥ the previous approval.
// Checked on the final Adj dates. A break between two recorded actuals (or one
// forced by actuals on both sides) is a data issue — reported, never blocking.
// Any other break is a violation: nothing is written for that item.
export const ORDER_LABELS = {
  del1: 'S4 DT Delivery', sub1: 'S4 submission', s4: 'S4 approval',
  st2: 'S5 DT Start', del2: 'S5 DT Delivery', sub2: 'S5 submission', s5: 'S5 approval',
  stC: 'A4.5 DT Start', delC: 'A4.5 DT Delivery', subC: 'A4.5 submission', c01: 'A4.5 sign-off', prod: 'Production',
};
const ORDER_CHAIN     = ['del1', 'sub1', 's4', 'st2', 'del2', 'sub2', 's5', 'stC', 'delC', 'subC', 'c01', 'prod'];
const ORDER_CHAIN_NCA = ['stC', 'delC', 'subC', 'c01', 'prod'];
const ORDER_STRICT    = [['del1', 'sub1'], ['sub1', 'st2'], ['del2', 'sub2'], ['sub2', 'stC'], ['delC', 'subC'], ['subC', 'prod']];
export function checkOrder(adj, isAct = {}, nca = false) {
  const chain = (nca ? ORDER_CHAIN_NCA : ORDER_CHAIN).filter(k => adj[k]);
  const pos = Object.fromEntries(chain.map((k, i) => [k, i]));
  const violations = [], dataIssues = [];
  const pairs = [];
  for (const [a, b] of ORDER_STRICT) if (a in pos && b in pos) pairs.push([a, b, true]);
  for (let i = 1; i < chain.length; i++) pairs.push([chain[i - 1], chain[i], false]);
  const seen = new Set();
  for (const [a, b, strict] of pairs) {
    const da = adj[a], db = adj[b];
    const bad = strict ? !(da < db) : !(da <= db);
    if (!bad) continue;
    const key = `${a}>${b}`; if (seen.has(key)) continue; seen.add(key);
    // Forced by actuals? latest actual at/before a vs earliest actual at/after b
    let lo = null, hi = null;
    for (const k of chain.slice(0, pos[a] + 1)) if (isAct[k] && (!lo || adj[k] > lo)) lo = adj[k];
    for (const k of chain.slice(pos[b]))       if (isAct[k] && (!hi || adj[k] < hi)) hi = adj[k];
    const forced = (isAct[a] && isAct[b]) || (lo && hi && (strict ? !(lo < hi) : !(lo <= hi)));
    const v = { a, b, aDate: toISO(da), bDate: toISO(db), strict,
      text: `${ORDER_LABELS[a]} ${toISO(da)} ${strict ? 'must be before' : 'must not be after'} ${ORDER_LABELS[b]} ${toISO(db)}` };
    (forced ? dataIssues : violations).push(v);
  }
  return { violations, dataIssues };
}

// ── calcRow ──────────────────────────────────────────────────────────────────
// Output keys match the matrix columns in App.jsx.
export function calcRow(r, project, opts = {}) {
  const nca = !!r.noClientApproval;
  const { values: P, source: periodSource } = resolvePeriods(r, project);
  const steps    = buildSteps(P, nca, false);   // Plan: baseline durations
  const accel    = resolveAccel(r);
  const adjSteps = buildSteps(P, nca, true, accel);  // Adjusted: + issue coordination, − acceleration

  const target  = snapFwd(r.prodDate);
  const instr   = snapFwd(r.dateOfInstruction);
  const dtPlan1 = snapFwd(r.dtStart1PlanInput);
  // Start anchor: Date of Instruction, else 1st DT Start (Plan) (skips Coordination)
  const anchorKey  = instr ? 'instr' : dtPlan1 ? 'dtStart1' : null;
  const anchorDate = instr || dtPlan1 || null;
  const anchorType = anchorKey ? (anchorKey === 'instr' ? 'instruction' : 'dtStart') : (target ? 'target' : null);

  // Plan
  let plan = {};
  if (anchorKey) plan = forward(steps, anchorKey, anchorDate, r, null, false).m;
  else if (target) plan = backward(steps, target);

  // Adj — forward from the anchor (or the back-planned start), with actuals + holds
  let adj = {}, adjE = {}, adjS = {}, accelDays = 0, holdDays = 0, addedDays = 0, coordApplied = 0, applied = [];
  const holds = mergeHolds(r.holds, opts.today);
  const today = snapFwd(opts.today || new Date());
  const manualDays = isNum(r.holdDaysManual) ? Number(r.holdDaysManual) : 0;
  const manual = manualDays > 0 ? { days: manualDays, at: today } : null;
  const prog = !!r.programmeDriven;
  const startKey  = anchorKey || (target ? 'instr' : null);
  let   startDate = anchorDate || plan.instr || null;
  // An actual 1st DT Start beats any planned start
  const dtAct1 = snapFwd(r.dtStart1Act);

  // Programme-driven / reissue stages: pin the submission, back-calculate its DT
  // dates (DT Delivery = submission − QA, DT Start = delivery − DT period), and set
  // aside the closed cycle's actuals (submission, review, and DT actuals dated on
  // or before the latest issue) so the stages after it chain from the new issue.
  // DT actuals dated after the latest issue belong to the current cycle and lock.
  // Holds are not stepped over: the fixed date already has them baked in.
  // A back-calculated DT date that lands before today is flagged (dt.past) and can
  // be moved by hand — a stored DT Adj date between today and the submission is
  // used instead (it's what the tool pushed after a manual edit).
  // Manual DT Starts behave as recorded dates (a real actual still wins)
  const manualStarts = {};
  for (const sd of ISSUE_STAGES) {
    const m = manualDtStart(r, sd.key);
    if (m && !snapFwd(r[sd.dtActs[0]])) manualStarts[sd.key] = m;
  }
  if (Object.keys(manualStarts).length) {
    r = { ...r };
    for (const [k, d] of Object.entries(manualStarts)) r[ISSUE_STAGES.find(x => x.key === k).dtActs[0]] = d;
  }
  const SI = stageInputs(r, nca);
  const durTo = k => adjSteps.find(st => st.to === k)?.dur ?? 0;
  const fix = { pins: {}, back: {}, ignore: new Set() };
  const DT = {};
  // Manual DT dates (set by hand when a back-calculated one is in the past) only
  // apply to programme-driven items — elsewhere the today floor moves them (§4).
  const manualDT = (v, calc, hi) => {
    if (!prog) return null;
    const d = snapFwd(v);
    return d && calc < today && d >= today && (!hi || d <= hi) ? d : null;
  };
  const liveStages = ISSUE_STAGES.filter(sd => SI[sd.key] && SI[sd.key].state !== 'na' && adjSteps.some(st => st.to === sd.sub));
  for (const sd of liveStages) {
    const si = SI[sd.key];
    const reopened = si.state === 'pending' || si.state === 'required' || si.state === 'superseded';
    // Closed cycles (§2): the stage's own reopened cycle, and anything dated on or
    // before the previous stage's current submission
    if (reopened || si.superseded) {
      fix.ignore.add(sd.subAct); fix.ignore.add(sd.apprAct);
      for (const k of sd.dtActs) { const d = snapFwd(r[k]); if (d && si.actual && d <= si.actual) fix.ignore.add(k); }
    }
    if (si.cutoff) {
      for (const k of [...sd.dtActs, sd.apprAct]) { const d = snapFwd(r[k]); if (d && d <= si.cutoff) fix.ignore.add(k); }
    }
    // A status date older than the stage's current submission is from an earlier issue
    const ap = snapFwd(r[sd.apprAct]);
    if (si.state === 'closed' && ap && ap < si.actual) fix.ignore.add(sd.apprAct);
    if (si.state !== 'closed') fix.ignore.add(sd.apprAct);
    if (manualStarts[sd.key]) fix.ignore.delete(sd.dtActs[0]);     // set by hand: never a closed cycle
    const curAct = k => { const d = snapFwd(r[k]); return d && !fix.ignore.has(k) ? d : null; };
    const startAct = curAct(sd.dtActs[0]), delAct = curAct(sd.dtActs[1]);
    if (si.fixed) {
      const del0 = addWD(si.fixed, -durTo(sd.sub));
      const delOv = delAct ? null : manualDT(r[sd.delIn], del0, si.fixed);
      const del = delAct || delOv || del0;
      const start0 = addWD(del, -durTo(sd.del));
      fix.pins[sd.sub] = si.fixed;
      fix.back[sd.del] = delOv || del0;
      fix.back[sd.start] = startAct || start0;
      DT[sd.key] = { delManual: !!delOv, canDel: prog && !delAct && (del0 < today || !!delOv) };
    } else if (si.state === 'required') {
      // Status C, no reissue date yet: the reissue starts today (or at its actual
      // DT start if work has begun), and everything after chains from it.
      const start = startAct || today;
      const del = delAct || addWD(start, durTo(sd.del));
      let sub = addWD(del, durTo(sd.sub));
      if (sub < today) sub = today;
      fix.pins[sd.sub] = sub; fix.back[sd.del] = del; fix.back[sd.start] = start;
      DT[sd.key] = { canDel: false };
    }
    // DT Start can be set by hand on S5 and A4.5 — any date, past included —
    // unless an actual DT Start is recorded
    const realStart = snapFwd((manualStarts[sd.key] ? {} : r)[sd.dtActs[0]]) && !manualStarts[sd.key];
    DT[sd.key] = { ...(DT[sd.key] || { canDel: false }),
      startLocked: !!realStart && !fix.ignore.has(sd.dtActs[0]), delLocked: !!delAct,
      startManual: !!manualStarts[sd.key], canStart: !!sd.startIn && !(realStart && !fix.ignore.has(sd.dtActs[0])) };
  }
  const curAct = k => { const d = snapFwd(r[k]); return d && !fix.ignore.has(k) ? d : null; };
  const anyFix = Object.keys(fix.pins).length > 0;
  const fixArg = anyFix || fix.ignore.size ? fix : null;
  // With no start anchor, a programme-driven item starts at its first fixed stage
  let walkKey = startKey, walkDate = startDate;
  if (!walkKey && dtAct1) { walkKey = 'dtStart1'; walkDate = dtAct1; }
  if (!walkKey && anyFix) {
    const first = ISSUE_STAGES.find(sd => fix.back[sd.start]);
    if (first) { walkKey = first.start; walkDate = fix.back[first.start]; }
  }
  // W: the disturbed walk — holds, hold days, open stages floored at today.
  // R: the undisturbed reference — same actuals and pins, no holds (added days kept),
  //    no hold days, no today floor. Its submission dates are what squeezing protects.
  let W = {}, R = {};
  const walkOpts = { noOpenFloor: prog };
  if (walkKey) {
    const f = forward(adjSteps, walkKey, walkDate, r, holds, true, manual, today, fixArg, walkOpts);
    W = f.m; adjE = f.E; adjS = f.S; accelDays = f.saved; holdDays = f.holdDays; addedDays = f.addedDays; coordApplied = f.coordDays; applied = f.applied;
    const refHolds = holds.map(h => ({ ...h, end: h.start }));
    R = forward(adjSteps, walkKey, walkDate, r, refHolds, true, null, null, fixArg).m;
  }

  // ── Order, squeeze, slip (brief Nov 2026 §3–§5) ───────────────────────────
  // Stage by stage, each issue is fitted between the stage before it and its own
  // submission. DT Start ≥ previous approval and > previous submission;
  // DT Start ≤ DT Delivery < submission ≤ approval.
  //  • Submission recorded (actual): DT dates back-calculated from it and fitted
  //    in; it never moves.
  //  • Programme-driven: the client date never slips. Our side is squeezed to fit;
  //    below the floor = Programme conflict.
  //  • Otherwise: an earlier date moving later (reissue, hold, today floor) is
  //    absorbed by squeezing our side (DT period, then QA) down to the floor; past
  //    that the submission slips a working day per day lost, and every later
  //    unrecorded date shifts with it. Client reviews keep their full length.
  const MIN = resolveMinimums(project);
  const isAct = {};
  const flags = { squeezed: [], slipping: false, slipDays: 0, programmeConflict: false };
  const stageInfo = {};
  adj = { ...W };
  if (walkKey) {
    const subActs = Object.fromEntries(liveStages.map(sd => [sd.key, SI[sd.key].state === 'closed' ? SI[sd.key].actual : null]));
    const dt1 = curAct('dtStart1Act');
    if (dt1) isAct.dtStart1 = true;
    let prev = null, sigma = 0;
    const maxD2 = (a, b) => (!a ? b : !b ? a : a > b ? a : b);
    const clamp = (d, lo, hi) => (d < lo ? lo : d > hi ? hi : d);
    liveStages.forEach((sd, i) => {
      const si = SI[sd.key];
      const pe = STAGE_PERIODS[sd.key];
      const dtStd = durTo(sd.del), qaStd = durTo(sd.sub);
      const coord = P[pe.coord] || 0;
      const dtF = accel[pe.accel] !== undefined ? dtStd : Math.min(dtStd, (MIN[pe.period] ?? 0) + coord);
      const qaF = accel.qa !== undefined ? qaStd : Math.min(qaStd, MIN.qa ?? 0);
      const subAct = subActs[sd.key];
      const startAct = curAct(sd.dtActs[0]), delAct = curAct(sd.dtActs[1]);
      const apprAct = subAct ? curAct(sd.apprAct) : null;
      const pin = !subAct ? (fix.pins[sd.sub] || null) : null;
      const progPin = !!(pin && prog && si.fixed);
      const passed = liveStages.slice(i + 1).some(x => subActs[x.key]);
      const floorT = !prog && !passed && !subAct ? today : null;
      // Earliest DT Start: the previous approval + DT mobilisation, and after the
      // previous submission
      const L = prev ? maxD2(addWD(prev.appr, P.mobilisation ?? 0), addWD(prev.sub, 1)) : null;
      // Automated DT Start = L (DT starts as soon as it's mobilised after the approval).
      // A reissue of a stage already issued keeps its back-calculated start: its
      // trigger (comments, design change) isn't the previous approval.
      const reissue = si.state === 'pending' || si.state === 'required' || si.state === 'superseded';
      const first = i === 0;
      const Wstart = W[sd.start], Wdel = W[sd.del], Wsub = W[sd.sub], Wappr = W[sd.appr];
      if (!Wsub) { prev = null; return; }
      let start, del, T, slip = 0, conflict = 0, achievable = null;
      if (subAct || progPin) {
        // Fixed submission: back-calculate the DT dates and fit them in
        T = subAct || pin;
        const del0 = delAct || (subAct ? addWD(T, -qaStd) : Wdel);
        const start0 = startAct || (subAct ? addWD(del0, -dtStd) : Wstart);
        start = startAct || (first ? Wstart : reissue ? maxD2(start0, L) : (L || start0));
        if (delAct) del = delAct;
        else {
          const lo = addWD(start, dtF), hi = addWD(T, -qaF);
          if (lo <= hi) del = clamp(del0, lo, hi);
          else {                                        // no room even at the floor
            const lo2 = start, hi2 = addWD(T, -1);
            del = lo2 <= hi2 ? clamp(del0, lo2, hi2) : hi2;
            if (progPin) conflict = Math.max(conflict, wdBetween(T, addWD(addWD(start, dtF), qaF)));
          }
        }
        if (!startAct && start > del) start = del;
        if (progPin) {
          // Earliest the tool could issue it: from the DT start (not before today),
          // floor periods, holds paused
          const s1 = startAct || maxD2(start, today);
          const d1 = delAct || addWDHold(s1, dtF, holds);
          let t1 = addWDHold(d1, qaF, holds);
          if (t1 < today) t1 = today;
          if (t1 > T) { conflict = Math.max(conflict, wdBetween(T, t1)); achievable = t1; }
        }
      } else {
        // Flexible: protect the reference submission, squeeze our side, then slip.
        // The stage is re-walked from its fitted start (holds, open-stage floor and
        // coordination as in the main walk) to get where it would land unsqueezed.
        start = startAct || (pin && reissue ? (first || !L ? Wstart : maxD2(Wstart, L)) : (first || !L ? Wstart : L));
        let delN = Wdel, TN = Wsub;
        if (!(first && +start === +Wstart) && !(pin && reissue)) {
          const segFix = { pins: { ...fix.pins }, back: { ...fix.back }, ignore: fix.ignore };
          delete segFix.pins[sd.sub]; delete segFix.back[sd.start]; delete segFix.back[sd.del];
          const seg = forward(adjSteps, sd.start, start, r, holds.filter(h => h.end > start), true,
            today >= start ? manual : null, today, segFix, walkOpts).m;
          delN = seg[sd.del]; TN = seg[sd.sub];
          if (pin && TN < pin) { TN = pin; delN = maxD2(addWD(pin, -qaStd), delN); }
        } else if (pin && start > Wstart) {
          // A reissue date pushed by the stage before it: carry it by the push
          const sh = wdBetween(Wstart, start);
          delN = addWD(Wdel, sh); TN = addWD(Wsub, sh);
        }
        if (delAct) delN = delAct;
        if (floorT && !delAct && delN < floorT) { delN = floorT; if (TN < addWD(delN, qaStd)) TN = addWD(delN, qaStd); }
        const Tstar = pin || (R[sd.sub] ? addWD(R[sd.sub], sigma) : TN);
        const push = TN > Tstar ? wdBetween(Tstar, TN) : 0;
        if (!push) { T = TN; del = delN; }
        else {
          const dtCap = delAct ? 0 : Math.max(0, dtStd - dtF), qaCap = Math.max(0, qaStd - qaF);
          const absorb = Math.min(push, dtCap + qaCap);
          T = addWD(TN, -absorb);
          const qaUse = qaStd - Math.max(0, absorb - dtCap);
          del = delAct || addWD(T, -qaUse);
        }
        if (!delAct) {
          const lo = addWD(start, dtF);
          if (del < lo) del = lo;
          if (floorT && del < floorT) del = floorT;
        }
        if (T < addWD(del, qaF)) T = addWD(del, qaF);
        if (floorT && T < floorT) T = floorT;
        // Coordination entered on an issue in progress = days still needed from today.
        // It's an item input, never squeezed.
        const inProgress = [sd.subAct, sd.apprAct].some(k => r.mdsOpen?.includes(k));
        if (floorT && inProgress && coord > 0) { const cf = addWD(today, coord); if (T < cf) T = cf; }
        slip = T > Tstar ? wdBetween(Tstar, T) : 0;
        // A reissue date that slipped is written back as the new date; back-calculate
        // its DT Start from it now so the next sync lands on the same answer
        if (pin && reissue && T > pin && !startAct && sd.startIn) {
          const s2 = addWD(addWD(T, -qaStd), -dtStd);
          start = L && s2 < L ? L : s2;
          if (start > del) start = del;
        }
      }
      // Approval: the full client review, carried by the submission
      let appr = apprAct;
      if (!appr) {
        // Review length as walked (holds in the review pause it), carried by the submission
        appr = (subAct || progPin) && Wappr ? Wappr : addWDHold(T, durTo(sd.appr), holds);
        if (appr < T) appr = T;
        const floorA = !prog && !liveStages.slice(i + 1).some(x => subActs[x.key]) ? today : null;
        if (floorA && appr < floorA) appr = floorA;
      }
      adj[sd.start] = start; adj[sd.del] = del; adj[sd.sub] = T; adj[sd.appr] = appr;
      if (startAct) isAct[sd.start] = true;
      if (delAct) isAct[sd.del] = true;
      if (subAct) isAct[sd.sub] = true;
      if (apprAct) isAct[sd.appr] = true;
      if (sd.key === 'c01' && nca) adj.dtStart1 = adj.dtStart1 ?? start;
      sigma = R[sd.sub] ? wdBetween(R[sd.sub], T) : 0;
      // Flags: days left vs standard on stages not yet issued
      const used = wdFree(start, T, holds), std = dtStd + qaStd;
      const squeezed = !subAct && used < std ? { used: Math.max(0, used), std } : null;
      if (squeezed) flags.squeezed.push({ stage: sd.key, ...squeezed });
      if (slip > 0) { flags.slipping = true; flags.slipDays = Math.max(flags.slipDays, slip); }
      if (conflict > 0) flags.programmeConflict = true;
      stageInfo[sd.key] = { squeezed, slip, conflict, achievable, dtF, qaF, dtStd, qaStd };
      prev = { sub: T, appr };
    });
    // Production: carried by the last sign-off
    if (W.prod && adj.c01) adj.prod = isAct.c01 && W.c01 && +W.c01 === +adj.c01 ? W.prod : addWDHold(adj.c01, durTo('prod'), holds);
  }

  // Omitted items carry no forecast dates (§1)
  const omitted = /^omitted$/i.test(String(r.status || '').trim());
  if (omitted) adj = {};
  const order = omitted ? { violations: [], dataIssues: [] } : checkOrder(adj, isAct, nca);

  const stages = {};
  let anyPending = false;
  for (const sd of ISSUE_STAGES) {
    const si = SI[sd.key];
    if (!si || si.state === 'na' || (nca && sd.ncaSkip)) { stages[sd.key] = { state: 'na' }; continue; }
    const computed = adj[sd.sub] ?? null;
    let state = si.state;
    if ((state === 'none' || state === 'superseded') && computed) state = state === 'superseded' ? 'superseded' : 'forecast';
    if (state === 'pending' || state === 'required' || state === 'superseded') anyPending = true;
    const date = state === 'closed' ? si.actual : state === 'none' ? null : computed;
    const info = stageInfo[sd.key] || {};
    const dtInfo = DT[sd.key] ? { ...DT[sd.key], start: adj[sd.start] ?? null, del: adj[sd.del] ?? null, past: null } : null;
    if (dtInfo && prog) {
      const s0 = adj[sd.start], d0 = adj[sd.del];
      dtInfo.past = !dtInfo.startLocked && s0 && s0 < today && state !== 'closed' ? { key: 'start', date: s0, days: wdBetween(s0, today) }
                  : !dtInfo.delLocked && d0 && d0 < today && state !== 'closed' ? { key: 'del', date: d0, days: wdBetween(d0, today) } : null;
    }
    stages[sd.key] = { state, date, actual: si.actual, fixed: si.fixed, stored: si.stored, statusC: si.statusC,
      closedSub: si.closedSub, locked: !!(prog && si.fixed),
      warnDays: info.conflict || 0, achievable: info.achievable || null,
      squeezed: info.squeezed || null, slip: info.slip || 0, conflict: info.conflict || 0, dt: dtInfo };
  }

  // Net effect of acceleration on the production date (stages already pinned by
  // actuals can't be accelerated, so this is less than the sum of the cuts).
  if (Object.keys(accel).length && adj.prod) {
    const base = forward(buildSteps(P, nca, true), walkKey, walkDate, r, holds, true, manual, today, fixArg, walkOpts).m;
    accelDays = base.prod && W.prod ? wdBetween(W.prod, base.prod) : 0;
  } else accelDays = 0;
  const openHold = holds.find(h => h.open && h.start <= today);
  const floatDays = (target && adj.prod) ? wdBetween(adj.prod, target) : null;

  const slip = (p, a) => (p && a) ? wdBetween(p, a) : null;
  // Adjusted-vs-Plan slip at a milestone, and the part of it explained by
  // coordination / holds / added days. Stage slip = what happened inside a stage.
  const T  = k => slip(plan[k], adj[k]);
  const Ex = k => adjE[k] ?? null;
  // Per issue: the coordination / hold / added days in the issue are credited
  // against its lateness — DT stage first, then the client review. Credit never
  // exceeds the lateness, so it works the same whether the dates were pushed
  // (future stages) or are locked by actuals (stages already done).
  // Acceleration works the other way: days saved in the issue are credited
  // against its earliness, so a planned speed-up isn't reported as a gain in slip.
  const Sx = k => adjS[k] ?? null;
  const issue = (start, sub, appr) => {
    const t0 = T(start), t1 = T(sub), t2 = T(appr);
    if (t0 == null) return { dt: null, rev: null };
    const extra = Math.max(0, (Ex(appr) ?? Ex(sub) ?? 0) - (Ex(start) ?? 0));
    const gain  = Math.max(0, (Sx(appr) ?? Sx(sub) ?? 0) - (Sx(start) ?? 0));
    let pool = extra, early = gain, dt = null, rev = null;
    const credit = raw => {
      if (raw > 0) { const c = Math.min(pool, raw); pool -= c; return raw - c; }
      if (raw < 0) { const c = Math.min(early, -raw); early -= c; return raw + c; }
      return raw;
    };
    if (t1 != null) dt = credit(t1 - t0);
    if (t2 != null && t1 != null) rev = credit(t2 - t1);
    return { dt, rev };
  };
  const i1 = issue('dtStart1', 'sub1', 's4'), i2 = issue('st2', 'sub2', 's5'), iC = issue('stC', 'subC', 'c01');
  const act = k => snapFwd(r[k]);

  // NCA: the construction issue starts at 1st DT Start
  const dtStart1Plan = plan.dtStart1 ?? null;

  return {
    nca, periods: P, periodSource, anchorType,
    // Reissues / programme-driven: per stage { state, date, actual, fixed, locked, warnDays }
    stages, anyPending, programmeDriven: !!r.programmeDriven,
    // §3–§6: flags for the Plan view, and the order check on the final Adj dates
    flags, omitted, orderViolations: order.violations, orderDataIssues: order.dataIssues, isAct,
    // Plan
    instrPlan: plan.instr ?? null,
    dtStart1Plan, del1P: plan.del1 ?? null, sub1P: plan.sub1 ?? null, s4ApprovalPlan: plan.s4 ?? null,
    st2P: plan.st2 ?? null, del2P: plan.del2 ?? null, sub2P: plan.sub2 ?? null, s5ApprovalPlan: plan.s5 ?? null,
    stCP: plan.stC ?? null, delCP: plan.delC ?? null, subCP: plan.subC ?? null, c01SignOffPlan: plan.c01 ?? null,
    prodDateP: plan.prod ?? null,
    target,
    instDate: snapFwd(r.installDate),
    // Adj
    dtStart1A: adj.dtStart1 ?? null, del1A: adj.del1 ?? null, sub1A: adj.sub1 ?? null, s4A: adj.s4 ?? null,
    st2A: adj.st2 ?? null, del2A: adj.del2 ?? null, sub2A: adj.sub2 ?? null, s5A: adj.s5 ?? null,
    stCA: adj.stC ?? null, delCA: adj.delC ?? null, subCA: adj.subC ?? null,
    c01SignOffAdj: adj.c01 ?? null, prodDateAdj: adj.prod ?? null,
    // Actual snapshots
    sub1Act: act('sub1ActDate'), sub2Act: act('sub2ActDate'), subCActSnap: act('subCActDate'),
    // Slippage vs plan (Actual tab)
    dtSlip1: slip(plan.sub1, act('sub1ActDate')),   approvalSlip1: slip(plan.s4, act('s4Date')),
    dtSlip2: slip(plan.sub2, act('sub2ActDate')),   approvalSlip2: slip(plan.s5, act('s5Date')),
    dtSlipC: slip(plan.subC, act('subCActDate')),   approvalSlipC: slip(plan.c01, act('c01SignOffActDate')),
    // Adjusted tab, per issue: Coord days added, DT/other slip inside the issue
    // (DT start → submission, net of coordination/holds), review slip inside the
    // client review, and the running total vs Plan at the approval.
    coordS4A: P.coordS4 || 0, coordS5A: P.coordS5 || 0, coordC01A: P.coordC01 || 0,
    dtSlip1_adj: i1.dt, approvalSlip1_adj: i1.rev, totalSlip1: T('s4'),
    dtSlip2_adj: i2.dt, approvalSlip2_adj: i2.rev, totalSlip2: T('s5'),
    dtSlipC_adj: iC.dt, approvalSlipC_adj: iC.rev, totalSlipC: T('c01'),
    prodSlip_adj: T('prod'),
    coordDays: coordApplied,
    // Acceleration (Adjusted only): working days taken out vs the normal periods
    accel, accelDays,
    // Disruption
    holdDays, addedDays, onHold: !!openHold,
    holdLabels: [...applied.flatMap(h => h.labels), ...(manual ? [`Manual hold ${manualDays}d`] : [])],
    manualHoldDays: manualDays,
    openHoldDays: openHold ? wdBetween(openHold.start, today) : 0,
    floatDays,
  };
}

// Tasks DB Plan / Adj date properties written back by the tool
export const PLAN_PROPS = {
  del1P: '1st DT Delivery (Plan)',  sub1P: '1st Submission Date (Plan)',
  st2P:  '2nd DT Start (Plan)',     del2P: '2nd DT Delivery (Plan)', sub2P: '2nd Submission Date (Plan)',
  stCP:  'Constr. DT Start (Plan)', delCP: 'Constr. DT Delivery (Plan)', subCP: 'Constr. Submission Date (Plan)',
};
export const ADJ_PROPS = {
  del1A: '1st DT Delivery (Adj)',   sub1A: '1st Submission Date (Adj)',
  st2A:  '2nd DT Start (Adj)',      del2A: '2nd DT Delivery (Adj)', sub2A: '2nd Submission Date (Adj)',
  stCA:  'Constr. DT Start (Adj)',  delCA: 'Constr. DT Delivery (Adj)', subCA: 'Constr. Submission Date (Adj)',
};

// Where each Adj property is read back on the Tasks row (stored value)
export const ADJ_STORED = {
  del1A: 'del1AdjIn', sub1A: 'subAdj1In', st2A: 'st2AdjIn', del2A: 'del2AdjIn', sub2A: 'subAdj2In',
  stCA: 'stCAdjIn', delCA: 'delCAdjIn', subCA: 'subAdjCIn',
};
// Properties the tool may never write (brief Nov 2026 §1): Plan = baseline,
// Actual = submissions process. Guarded again on the server.
export const isProtectedProp = name => /\((Plan|Actual)\)\s*$/i.test(String(name));

// ── Sync write (brief Nov 2026 §1, §6) ───────────────────────────────────────
// The Notion patch for one item: every calculated Adj date that differs from what
// is stored. Items that break the order rule are blocked — nothing is written for
// them until they're resolved. Omitted items have their Adj dates cleared.
// Returns { fields, blocked, violations, changes }.
export function adjPatch(row, c) {
  if (c.orderViolations?.length) return { fields: {}, blocked: true, violations: c.orderViolations, changes: 0 };
  // Nothing calculated (no anchor, target or actual) — leave Notion alone
  if (!c.omitted && !c.prodDateAdj) return { fields: {}, blocked: false, violations: [], changes: 0 };
  const fields = {};
  for (const [k, prop] of Object.entries(ADJ_PROPS)) {
    const want = c.omitted ? null : (c[k] ? toISO(c[k]) : null);
    const have = row[ADJ_STORED[k]] ? toISO(toDate(row[ADJ_STORED[k]])) : null;
    if (want !== have) fields[prop] = want;
  }
  return { fields, blocked: false, violations: [], changes: Object.keys(fields).length };
}

// ── Snap Adj to Actual when a stage is issued (brief §5) ─────────────────────
// Drawings often go out earlier than forecast, leaving Adj later than Actual,
// which would read as a pending reissue. On each sync, a stage whose Actual has
// CHANGED since the previous sync gets Adj = Actual (closing the slot). That
// applies to programme-driven items too — it records what happened. Plan is
// never touched.
//   cache[pageId][stage] = the Actual seen at the previous sync (null = none yet)
// First sync (no cached value for the stage): the current Actual is recorded as
// the baseline and nothing is snapped. A stage whose Actual hasn't changed is
// never snapped — so a later programme / reissue Adj always stands.
// Returns new rows, the Notion patches to make, and the updated cache.
export function snapStages(rows, cache = {}) {
  const iso = v => { const d = toDate(v); return d ? toISO(d) : null; };
  const nextCache = { ...cache };
  const patches = [];
  const out = rows.map(row => {
    const id = row.pageId;
    if (!id) return row;
    const seenRow = cache[id] || null;
    const rowCache = {};
    let r = row; const fields = {}; let snapped = 0;
    for (const sd of ISSUE_STAGES) {
      if (row.noClientApproval && sd.ncaSkip) continue;
      const A = iso(row[sd.subAct]);
      const J = iso(row[sd.inKey]);
      const seen = !!seenRow && Object.prototype.hasOwnProperty.call(seenRow, sd.key);
      rowCache[sd.key] = A;
      // Snap only when a previous Actual is cached and the Actual has changed since
      if (!A || J === A || !seen || seenRow[sd.key] === A) continue;
      if (r === row) r = { ...row };
      r[sd.inKey] = A; fields[sd.prop] = A; snapped++;
      // §5 (Nov 2026): the stage's DT Delivery (Adj) can't be later than the issue
      const D = iso(row[sd.delIn]);
      if (D && D >= A) { const d = toISO(addWD(A, -1)); r[sd.delIn] = d; fields[sd.delProp] = d; }
    }
    nextCache[id] = rowCache;
    if (!snapped) return row;
    const patch = { pageId: id, rowId: row.id, name: row.name, fields, count: snapped };
    // The reissue was issued and nothing else is pending → clear the reason (§6)
    if (r.reissueReason) {
      const si = stageInputs(r, !!r.noClientApproval);
      if (!Object.values(si).some(x => x.state === 'pending')) { r.reissueReason = null; patch.selects = { 'Reissue Reason': null }; }
    }
    patches.push(patch);
    return r;
  });
  return { rows: out, patches, cache: nextCache };
}
