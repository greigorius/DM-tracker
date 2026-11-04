import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, worstGrade, daysBetween, SHOW } from '../hub-core/timeline.js';
import { addWD } from '../hub-core/workdays.js';

const today = '2026-10-30';
const dw = (title, extra) => ({ id: title, title, type: 'Drawing', itemIds: ['i1'], s4: {}, s5: {}, c01: {}, prd: {}, ...extra });
const item = (extra = {}) => ({ id: 'i1', title: 'Suffix 060 - DRS-303 - Entrance Door', bic: 'DM', dtIds: [], prog: {}, projectId: 'p1', ...extra });
const one = (it, drawings, projects) => buildTimeline({ items: [it], drawings, projects, today })[0];

test('working days match the Scheduling Tool (weekends and UK bank holidays)', () => {
  assert.equal(addWD('2026-10-30', 1), '2026-11-02');           // Fri → Mon
  assert.equal(addWD('2026-12-24', 1), '2026-12-29');           // Christmas + Boxing Day (moved)
  assert.equal(addWD('2026-10-31', 0), '2026-11-02');           // weekend snaps forward
});

test('first drawing number and count use Dwg No. Assigned = Drawing', () => {
  const row = one(item(), [dw('EIT-24302'), dw('EIT-24301'), { ...dw('SK-01'), type: 'Sketch' }]);
  assert.equal(row.first, 'EIT-24301');
  assert.equal(row.count, 2);
});

test('stage is complete only when every drawing is issued; date is the last', () => {
  const drawings = [
    dw('A', { s4: { submitted: '2026-09-02', statusDate: '2026-09-16', status: 'A' } }),
    dw('B', { s4: { submitted: '2026-09-05', statusDate: '2026-09-18', status: 'B' } }),
  ];
  const { sub, ret } = one(item(), drawings).stages.s4;
  assert.deepEqual(sub, { kind: 'act', date: '2026-09-05', issued: 2, total: 2 });
  assert.deepEqual(ret, { kind: 'act', date: '2026-09-18', grade: 'B' });
});

test('every date not actual is a forecast: returns use the review period', () => {
  const row = one(item({ prog: { s5Adj: '2026-11-13', conAdj: '2026-12-18' } }), [dw('A')]);
  assert.deepEqual(row.stages.s5.sub, { kind: 'plan', date: '2026-11-13', late: 0 });
  assert.equal(row.stages.s5.ret.date, addWD('2026-11-13', 10));
  assert.equal(row.stages.con.ret.date, addWD('2026-12-18', 2));
});

test('project and item periods override the defaults', () => {
  const projects = new Map([['p1', { id: 'p1', reviewDays: 5 }]]);
  const row = one(item({ prog: { s4Adj: '2026-11-02', s5Adj: '2026-11-16', s5ReviewDays: 2 } }), [dw('A')], projects);
  assert.equal(row.stages.s4.ret.date, addWD('2026-11-02', 5));
  assert.equal(row.stages.s5.ret.date, addWD('2026-11-16', 2));
});

test('part issued: Adj forecast with n/N, return forecast marked awaiting', () => {
  const row = one(item({ prog: { s4Adj: '2026-10-28' } }), [dw('A', { s4: { submitted: '2026-09-02' } }), dw('B')]);
  const { sub, ret } = row.stages.s4;
  assert.deepEqual(sub, { kind: 'plan', date: '2026-10-28', late: 2, issued: 1, total: 2 });
  assert.equal(ret.awaiting, true);
  assert.equal(ret.date, addWD('2026-10-28', 10));
  assert.ok(row.overdue && row.awaiting);
});

test('reissue needs a later Adj plus a Reissue Reason or programme-driven', () => {
  const drawings = [dw('A', { s4: { submitted: '2026-09-02', statusDate: '2026-09-16', status: 'C' } })];
  assert.equal(one(item({ prog: { s4Adj: '2026-11-04' } }), drawings).stages.s4.sub.kind, 'act');
  const r = one(item({ prog: { s4Adj: '2026-11-04' }, reissueReason: 'Client Comments' }), drawings).stages.s4;
  assert.equal(r.sub.reissue, true);
  assert.equal(r.ret.date, addWD('2026-11-04', 10));
});

// Suffix 071 - FX-562: S5 reissue pending (Adj 13 Nov after the 27 Jan issue).
// The C01 actuals (28 Sep) are set aside, so A4.5 is a forecast with no R.
test('a pending reissue sets aside the actuals of later stages', () => {
  const d = t => dw(t, {
    s4: { submitted: '2025-12-12', status: 'B', statusDate: '2026-01-14' },
    s5: { submitted: '2026-01-27', status: 'B', statusDate: '2026-02-13' },
    c01: { submitted: '2026-09-28' },
  });
  const row = one(item({ programmeDriven: true, reissueReason: 'Design Change', prog: { s4Adj: '2025-12-12', s5Adj: '2026-11-13', conAdj: '2026-12-18' } }), [d('34560'), d('34561')]);
  assert.equal(row.stages.s4.sub.kind, 'act');
  assert.equal(row.stages.s5.sub.reissue, true);
  assert.equal(row.stages.s5.sub.date, '2026-11-13');
  assert.equal(row.stages.con.sub.reissue, undefined);
  assert.deepEqual(row.stages.con.sub, { kind: 'plan', date: '2026-12-18', late: 0 });
  assert.equal(row.drawings[0].stages.con.sub.kind, 'plan');
});

test('No Client Approval items skip S4/S5 and use PRD for the construction issue', () => {
  const drawings = [dw('A', { c01: { submitted: '2026-10-19', signOff: '2026-10-21' }, prd: { status: 'Rejected', statusDate: '2026-10-24' } })];
  const a45 = one(item(), drawings);
  assert.equal(a45.stages.con.ret.grade, 'Approved');
  const prd = one(item({ noClientApproval: true }), drawings);
  assert.equal(prd.stages.s4.na, true);
  assert.equal(prd.stages.con.ret.grade, 'Rejected');
});

test('S5 Status NA drawings drop out of S5', () => {
  const drawings = [dw('A', { s5: { submitted: '2026-10-01', statusDate: '2026-10-10', status: 'A' } }), dw('B', { s5: { status: 'NA' } })];
  assert.deepEqual(one(item(), drawings).stages.s5.sub, { kind: 'act', date: '2026-10-01', issued: 1, total: 1 });
});

test('helpers', () => {
  assert.equal(worstGrade(['A', 'B', null]), 'B');
  assert.equal(worstGrade(['Approved', 'Rejected']), 'Rejected');
  assert.equal(daysBetween('2026-10-28', '2026-11-02'), 5);
  assert.deepEqual(SHOW.map(s => s.value), ['all', 'overdue', 'awaiting', 'dt']);
});
