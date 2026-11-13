// Acceptance fixtures — EIT items as they stood in Notion on 12 Nov 2026.
// Tasks DB fields + the Master Drawing Schedule rows with Dwg No. Assigned = Drawing
// (other rows never hold a stage open). Used by lib/acceptance.test.js.
import { emptyStages, resolveStages } from '../../hub-core/programme/schedule.js';

export const TODAY = '2026-11-12';

// MDS drawing row: [s4Sub, s4Status, s4Date, s5Sub, s5Status, s5Date, c01Sub, c01SignOff]
const D = (s4Sub, s4St, s4Date, s5Sub, s5St, s5Date, cSub, cSo) =>
  ({ s4Sub, s4St, s4Date, s5Sub, s5St, s5Date, cSub, cSo });
const N = () => D(null, null, null, null, null, null, null, null);   // drawing not issued yet

// Same rule as lib/routes.js addDrawingToStages (assigned drawings only)
function stagesOf(dwgs) {
  const st = emptyStages();
  const add = (k, d, counts) => {
    const s = st[k];
    if (d) { s.an++; s.afirst = !s.afirst || d < s.afirst ? d : s.afirst; s.alast = !s.alast || d > s.alast ? d : s.alast; }
    if (!counts) return;
    s.n++;
    if (d) { s.done++; s.first = !s.first || d < s.first ? d : s.first; s.last = !s.last || d > s.last ? d : s.last; }
  };
  for (const d of dwgs) {
    const s5na = d.s5St === 'NA';
    add('s4Sub', d.s4Sub, true); add('s4Date', d.s4Date, true);
    add('s5Sub', d.s5Sub, !s5na); add('s5Date', d.s5Date, !s5na);
    add('c01Sub', d.cSub, true); add('c01Date', d.cSo, true);
  }
  return st;
}
const uniq = a => { const u = [...new Set(a.filter(Boolean))].sort(); return u.length ? u : null; };

function item(name, task, dwgs) {
  const stages = stagesOf(dwgs);
  const { fields, open, progress } = resolveStages(stages);
  return {
    id: name, pageId: name, name, status: 'In Progress', ...task, _stages: stages,
    _dwgs: dwgs.map((d, i) => ({ id: `${name}-${i}`, no: `${name.replace('Suffix ', 'EIT-')}-${String(i + 1).padStart(2, '0')}`, assigned: 'Drawing', ...d })),
    s4Status: uniq(dwgs.map(d => d.s4St)), s5Status: uniq(dwgs.map(d => d.s5St)),
    ...fields, mdsOpen: open, mdsProgress: progress,
  };
}

// Stored Adj values as read back from Notion (inputs to the tool)
const adj = (d1, s1, st2, d2, s2, stc, dc, sc) => ({
  del1AdjIn: d1, subAdj1In: s1, st2AdjIn: st2, del2AdjIn: d2, subAdj2In: s2,
  stCAdjIn: stc, delCAdjIn: dc, subAdjCIn: sc,
});

// ── 24-354 EIT Auditorium ────────────────────────────────────────────────────
export const AUDITORIUM = {
  137: item('Suffix 137', { dateOfInstruction: '2026-05-14',
    ...adj('2026-06-12', '2026-06-12', '2026-07-15', '2026-07-24', '2026-11-04', '2026-10-28', '2026-10-28', '2026-11-02') }, [
    D('2026-06-12', 'B', '2026-07-15', '2026-11-04'), D('2026-06-12', 'B', '2026-07-08', '2026-11-04'),
    D('2026-06-12', 'B', '2026-07-15', '2026-11-04')]),
  190: item('Suffix 190', { dateOfInstruction: '2026-05-14',
    ...adj('2026-06-12', '2026-06-12', '2026-07-13', '2026-07-22', '2026-11-04', '2026-10-28', '2026-10-28', '2026-11-02') },
    Array.from({ length: 4 }, () => D('2026-06-12', 'B', '2026-07-13', '2026-11-04'))),
  191: item('Suffix 191', { dateOfInstruction: '2026-05-14',
    ...adj('2026-06-12', '2026-06-16', '2026-07-08', '2026-07-17', '2026-11-04', '2026-10-28', '2026-10-28', '2026-11-02') },
    Array.from({ length: 3 }, () => D('2026-06-16', 'B', '2026-07-08', '2026-11-04'))),
  471: item('Suffix 471', { dtStart1PlanInput: '2026-06-08', dtStart1Act: '2026-06-08', dd1: 3,
    ...adj('2026-06-11', '2026-06-12', '2026-07-15', '2026-07-24', '2026-11-10', '2026-10-28', '2026-10-28', '2026-11-02') }, [
    D('2026-06-12', 'A', '2026-07-15', '2026-11-10')]),
  666: item('Suffix 666', { dtStart1PlanInput: '2026-05-20', dtStart1Act: '2026-05-20', dd1: 2,
    ...adj('2026-05-22', '2026-06-08', '2026-07-08', '2026-07-17', '2026-11-10', '2026-10-28', '2026-10-28', '2026-11-02') }, [
    D('2026-06-08', 'B', '2026-07-08', '2026-11-10')]),
  700: item('Suffix 700', { dtStart1PlanInput: '2026-01-27', dtStart1Act: '2026-01-30', del1Act: '2026-02-23',
    dtStart2Act: '2026-03-05', dd1: 14,
    ...adj('2026-02-23', '2026-03-11', '2026-03-05', '2026-03-16', '2026-10-14', '2026-10-28', '2026-10-28', '2026-11-02') }, [
    D('2026-03-11', 'B', '2026-03-24'),
    ...Array.from({ length: 10 }, () => D('2026-02-25', 'B', '2026-03-04', '2026-06-18', 'B', '2026-07-14', '2026-06-16', '2026-07-14'))]),
  111: item('Suffix 111', { dtStart1PlanInput: '2026-02-09', dtStart1Act: '2026-02-10', del1Act: '2026-02-13', coordS4Days: 30,
    ...adj('2026-02-13', '2026-02-13', '2026-03-31', '2026-04-13', '2026-10-14', '2026-10-28', '2026-10-28', '2026-06-01') }, [
    D('2026-02-13', 'B', '2026-03-31', null, null, null, '2026-06-01')]),
  155: item('Suffix 155', { dtStart1PlanInput: '2026-02-09', dtStart1Act: '2026-02-10', del1Act: '2026-02-13',
    ...adj('2026-02-13', '2026-02-17', '2026-03-31', '2026-04-13', '2026-10-14', '2026-10-28', '2026-10-28', '2026-06-09') },
    Array.from({ length: 3 }, () => D('2026-02-17', 'B', '2026-03-31', null, null, null, '2026-06-09'))),
  200: item('Suffix 200', { status: 'In Production', dtStart1PlanInput: '2025-12-04', dtStart1Act: '2026-01-23', dd1: 10, constrDrawDays: 10,
    ...adj('2026-02-06', '2026-02-20', '2026-03-17', '2026-03-26', '2026-10-14', '2026-10-28', '2026-11-11', '2026-07-02') },
    Array.from({ length: 7 }, () => D('2026-02-20', 'B', '2026-03-17', null, null, null, '2026-07-02'))),
  109: item('Suffix 109', { dtStart1PlanInput: '2026-03-24', dtStart1Act: '2026-03-24', del1Act: '2026-04-28',
    ...adj('2026-04-28', '2026-11-04', '2026-10-14', '2026-10-23', '2026-10-28', '2026-11-11', '2026-11-11', '2026-11-16') }, [
    ...Array.from({ length: 8 }, () => D('2026-06-08', 'B', '2026-06-16', '2026-09-18', 'B', '2026-10-14', '2026-11-04')),
    D('2026-09-18', 'A', '2026-10-15', '2026-10-20', null, null, '2026-11-04'),
    D('2026-09-18', 'B', '2026-10-15', '2026-10-20', 'B', '2026-11-09', '2026-11-04'),
    D('2026-11-04'), D('2026-11-04')]),
};

// ── 24-367 EIT Observatory Hall (all programme-driven) ───────────────────────
const P = { programmeDriven: true };
export const OBSERVATORY = {
  '010': item('Suffix 010', { ...P, dtStart1PlanInput: '2025-12-01', dtStart1Act: '2025-12-01', del1Act: '2026-01-19', del2Act: '2026-02-06',
    ...adj('2026-01-22', '2026-01-23', '2026-01-27', '2026-02-05', '2026-11-06', '2026-03-04', '2026-03-25', '2026-11-27') }, [
    D('2026-01-23', 'A', '2026-01-27', '2026-10-07', 'B', '2026-10-19'), D('2026-01-23', 'A', '2026-01-27', '2026-10-07', 'B', '2026-10-19'),
    D('2026-01-23', 'A', '2026-01-27', '2026-10-07', 'NA', '2026-10-29'), D('2026-01-23', 'B', '2026-01-27', '2026-10-07', 'B', '2026-10-19'),
    D('2026-01-23', 'A', '2026-01-27', '2026-10-07', 'B', '2026-10-19'),
    N(), N(), N(), N(), N(), N()]),
  '024': item('Suffix 024', { ...P, reissueReason: 'Design Change', dateOfInstruction: '2025-08-11', dtStart1PlanInput: '2025-11-03',
    dtStart1Act: '2025-11-03', del1Act: '2025-11-24', del2Act: '2026-01-15', constrDrawDays: 40,
    ...adj('2025-11-24', '2025-11-27', '2026-10-23', '2026-11-03', '2026-11-06', '2026-10-13', '2026-12-08', '2026-12-11') },
    Array.from({ length: 2 }, () => D('2025-11-27', 'B', '2026-01-07', '2026-01-16', 'C', '2026-02-04'))),
  '041': item('Suffix 041', { ...P, reissueReason: 'Design Change', dateOfInstruction: '2025-08-11', dtStart1PlanInput: '2025-11-17',
    dtStart1Act: '2025-11-17', del1Act: '2026-01-05', del2Act: '2026-03-09', constrDrawDays: 40,
    ...adj('2026-01-05', '2026-10-09', '2026-10-23', '2026-11-03', '2026-11-06', '2026-10-15', '2026-12-10', '2026-12-15') }, [
    D('2026-01-06', 'B', '2026-01-22', '2026-10-09', 'C', '2026-10-28'),
    D('2026-01-06', 'B', '2026-01-22', '2026-08-13', 'C', '2026-11-02'), D('2026-01-06', 'B', '2026-01-22', '2026-08-13', 'C', '2026-11-02'),
    D('2026-10-09', 'C', '2026-11-02', '2026-03-10', null, '2026-03-24'),
    D('2026-01-06', 'B', '2026-01-22', '2026-08-13', 'C', '2026-11-02'),
    D('2026-10-09', 'C', '2026-11-02', '2026-03-10', null, '2026-03-24'),
    N(), N(), N(), N()]),
  '082': item('Suffix 082', { ...P, status: 'To Do', dtStart1PlanInput: '2026-03-30',
    ...adj('2026-04-08', '2026-04-13', '2026-05-01', '2026-05-13', '2026-10-30', '2026-06-08', '2026-06-29', '2026-12-11') }, []),
  '090': item('Suffix 090', { ...P, dtStart1PlanInput: '2026-01-07', dtStart1Act: '2026-01-07', del1Act: '2026-01-22', del2Act: '2026-03-03',
    constrDrawDays: 20,
    ...adj('2026-01-08', '2026-01-23', '2026-02-13', '2026-02-24', '2026-03-03', '2026-03-24', '2026-04-16', '2027-01-20') }, [
    ...Array.from({ length: 7 }, () => D('2026-01-23', 'B', '2026-02-13', '2026-03-03', 'B', '2026-03-24')),
    D('2026-01-23', 'B', '2026-02-13', '2026-03-03', 'A', '2026-03-24'), D('2026-01-23', 'B', '2026-02-13', '2026-03-03', 'A', '2026-03-24')]),
  '030': item('Suffix 030', { ...P, dtStart1PlanInput: '2026-01-14', dtStart1Act: '2026-01-14', del1Act: '2026-02-26', del2Act: '2026-03-20',
    constrDrawDays: 15,
    ...adj('2026-01-22', '2026-02-26', '2026-03-19', '2026-03-30', '2026-03-24', '2026-04-15', '2026-05-07', '2026-12-15') },
    Array.from({ length: 3 }, () => D('2026-02-26', 'B', '2026-03-19', '2026-03-24', 'B', '2026-04-13'))),
  '002': item('Suffix 002', { ...P, reissueReason: 'Design Change', dtStart1PlanInput: '2025-09-22', dtStart1Act: '2025-09-22',
    del1Act: '2025-12-19', del2Act: '2026-01-27',
    ...adj('2025-12-19', '2025-12-19', '2026-10-23', '2026-11-03', '2026-11-06', '2026-11-19', '2026-11-24', '2026-11-27') },
    Array.from({ length: 2 }, () => D('2025-12-19', 'B', '2026-01-12', '2026-01-28', 'NA', '2026-02-13'))),
};
