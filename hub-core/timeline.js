// Timeline: item-level drawing programme built from the Tasks and Master
// Drawing Schedule snapshots. Pure functions, shared by the page, the exports
// and the tests.
//
// Each item has three stages — S4 (approval), S5 (revision) and the
// construction issue (A4.5, or PRD when the item needs no client approval).
// A stage has two cells:
//   sub  when the drawings were submitted (or are planned to be)
//   ret  when comments / status came back (the MDS holds one date for both)

export const STAGES = [
  { key: 's4', code: 'S4', name: 'Approval issue' },
  { key: 's5', code: 'S5', name: 'Revision issue' },
  { key: 'con', code: 'A4.5 / PRD', name: 'Construction issue' },
];

const GRADE_RANK = { C: 4, Rejected: 4, B: 3, A: 2, Approved: 2, NA: 1 };

export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

const min = xs => xs.reduce((m, x) => (m == null || x < m ? x : m), null);
const max = xs => xs.reduce((m, x) => (m == null || x > m ? x : m), null);
export const worstGrade = gs => gs.filter(Boolean).reduce((w, g) => (w == null || (GRADE_RANK[g] || 0) > (GRADE_RANK[w] || 0) ? g : w), null);

// Raw dates for one drawing at one stage, or null when the stage is empty.
export function drawingStageDates(dw, key, prd) {
  let s;
  if (key === 's4') s = { act: dw.s4?.submitted, plan: dw.s4?.submitPlan, ret: dw.s4?.statusDate, retPlan: dw.s4?.statusPlan, grade: dw.s4?.status };
  else if (key === 's5') s = { act: dw.s5?.submitted, plan: dw.s5?.submitPlan, ret: dw.s5?.statusDate, retPlan: dw.s5?.statusPlan, grade: dw.s5?.status };
  else if (prd) s = { act: dw.c01?.submitted, plan: dw.c01?.submitPlan, ret: dw.prd?.statusDate, retPlan: null, grade: dw.prd?.status };
  else s = { act: dw.c01?.submitted, plan: dw.c01?.submitPlan, ret: dw.c01?.signOff, retPlan: null, grade: dw.c01?.signOff ? 'Approved' : null };
  for (const k of Object.keys(s)) s[k] = s[k] || null;
  // A grade with no date still counts as returned (dated with the grade unknown).
  if (s.grade && !s.ret && s.act) s.ret = s.act;
  return s.act || s.plan || s.ret || s.retPlan ? s : null;
}

const lateBy = (date, today) => (date && date < today ? daysBetween(date, today) : 0);

// Cells for a single drawing.
export function drawingCells(s, today) {
  if (!s) return { sub: null, ret: null };
  const sub = s.act
    ? { kind: 'act', date: s.act, reissue: !!(s.plan && s.plan > s.act) }
    : s.plan ? { kind: 'plan', date: s.plan, late: lateBy(s.plan, today) } : null;
  const ret = s.ret
    ? { kind: 'act', date: s.ret, grade: s.grade }
    : s.act ? { kind: 'await', date: s.retPlan, late: lateBy(s.retPlan, today) }
      : s.retPlan ? { kind: 'plan', date: s.retPlan } : null;
  return { sub, ret };
}

// Cells for an item: the earliest submission and the latest return across its
// drawings, with the worst grade.
export function itemCells(stages, today) {
  const list = stages.filter(Boolean);
  if (!list.length) return { sub: null, ret: null };
  const issued = list.filter(s => s.act);
  const toIssue = list.filter(s => !s.act && s.plan);

  let sub = null;
  if (issued.length) {
    const late = lateBy(min(toIssue.map(s => s.plan)), today);
    sub = {
      kind: 'act', date: min(issued.map(s => s.act)),
      reissue: issued.some(s => s.plan && s.plan > s.act),
      issued: issued.length, total: issued.length + toIssue.length, late,
    };
  } else if (toIssue.length) {
    const date = min(toIssue.map(s => s.plan));
    sub = { kind: 'plan', date, late: lateBy(date, today) };
  }

  let ret = null;
  if (issued.length) {
    const back = issued.filter(s => s.ret);
    const waiting = issued.filter(s => !s.ret);
    if (!waiting.length) {
      ret = { kind: 'act', date: max(back.map(s => s.ret)), grade: worstGrade(back.map(s => s.grade)) };
    } else {
      const date = max(waiting.map(s => s.retPlan).filter(Boolean));
      ret = { kind: 'await', date, late: lateBy(date, today), back: back.length, total: issued.length, grade: worstGrade(back.map(s => s.grade)) };
    }
  } else {
    const date = min(list.map(s => s.retPlan).filter(Boolean));
    if (date) ret = { kind: 'plan', date };
  }
  return { sub, ret };
}

const byNumber = (a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true });

/**
 * Build the timeline rows.
 * @param {object} p
 * @param {object[]} p.items     tasks snapshot rows (already filtered to the ones to show)
 * @param {object[]} p.drawings  drawings snapshot rows
 * @param {string}   p.today     YYYY-MM-DD (London)
 */
export function buildTimeline({ items, drawings, today }) {
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
    // Drawings with a number assigned lead; sketches etc. only when there is nothing else.
    const numbered = all.filter(d => d.type === 'Drawing');
    const list = numbered.length ? numbered : all;
    const prd = !!(item.noClientApproval || list.some(d => d.noClientApproval));

    const perDrawing = list.map(dw => {
      const raw = Object.fromEntries(STAGES.map(st => [st.key, drawingStageDates(dw, st.key, prd)]));
      return {
        id: dw.id, url: dw.url, title: dw.title, name: dw.name, rev: dw.rev,
        raw,
        stages: Object.fromEntries(STAGES.map(st => [st.key, drawingCells(raw[st.key], today)])),
      };
    });

    const stages = Object.fromEntries(STAGES.map(st => [st.key, itemCells(perDrawing.map(d => d.raw[st.key]), today)]));
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
      first: list[0]?.title || null,
      count: list.length,
      drawings: perDrawing.map(({ raw: _raw, ...d }) => d),
      stages,
      overdue: cells.some(c => c.late > 0),
      awaiting: cells.some(c => c.kind === 'await'),
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

// Plain-text cell values, used by the exports.
export function cellText(c) {
  if (!c) return '';
  if (c.kind === 'await') return c.date ? `Awaiting (due ${c.date})` : 'Awaiting';
  return c.date || '';
}
