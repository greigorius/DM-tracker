import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, worstGrade, daysBetween, SHOW } from '../hub-core/timeline.js';

const today = '2026-10-30';
const dw = (title, extra) => ({ id: title, title, type: 'Drawing', itemIds: ['i1'], s4: {}, s5: {}, c01: {}, prd: {}, ...extra });
const item = (extra = {}) => ({ id: 'i1', title: 'Suffix 060 - DRS-303 - Entrance Door', bic: 'DM', dtIds: [], ...extra });

test('first drawing number and count use numbered drawings only', () => {
  const [row] = buildTimeline({
    items: [item()],
    drawings: [dw('EIT-24302'), dw('EIT-24301'), { ...dw('SK-01'), type: 'Sketch' }],
    today,
  });
  assert.equal(row.first, 'EIT-24301');
  assert.equal(row.count, 2);
});

test('item submission is the earliest actual; return waits for every drawing', () => {
  const [row] = buildTimeline({
    items: [item()],
    drawings: [
      dw('A', { s4: { submitted: '2026-09-02', statusDate: '2026-09-16', status: 'A' } }),
      dw('B', { s4: { submitted: '2026-09-05', statusPlan: '2026-10-20' } }),
    ],
    today,
  });
  const { sub, ret } = row.stages.s4;
  assert.equal(sub.kind, 'act');
  assert.equal(sub.date, '2026-09-02');
  assert.equal(ret.kind, 'await');
  assert.equal(ret.back, 1);
  assert.equal(ret.total, 2);
  assert.equal(ret.late, 10);
  assert.ok(row.overdue);
  assert.ok(row.awaiting);
});

test('once all are back the return shows the latest date and worst grade', () => {
  const [row] = buildTimeline({
    items: [item()],
    drawings: [
      dw('A', { s4: { submitted: '2026-09-02', statusDate: '2026-09-16', status: 'A' } }),
      dw('B', { s4: { submitted: '2026-09-02', statusDate: '2026-09-18', status: 'C' } }),
    ],
    today,
  });
  assert.deepEqual(row.stages.s4.ret, { kind: 'act', date: '2026-09-18', grade: 'C' });
  assert.equal(row.awaiting, false);
});

test('planned dates show when nothing is issued, late when past', () => {
  const [row] = buildTimeline({ items: [item()], drawings: [dw('A', { s5: { submitPlan: '2026-10-28' } })], today });
  assert.equal(row.stages.s5.sub.kind, 'plan');
  assert.equal(row.stages.s5.sub.late, 2);
});

test('an Adj date after the actual marks a pending reissue', () => {
  const [row] = buildTimeline({ items: [item()], drawings: [dw('A', { s4: { submitted: '2026-09-02', submitPlan: '2026-11-04' } })], today });
  assert.equal(row.stages.s4.sub.reissue, true);
});

test('construction issue follows PRD status when the item needs no client approval', () => {
  const drawings = [dw('A', { c01: { submitted: '2026-10-19', signOff: '2026-10-21' }, prd: { status: 'Rejected', statusDate: '2026-10-24' } })];
  const [a45] = buildTimeline({ items: [item()], drawings, today });
  assert.equal(a45.prd, false);
  assert.equal(a45.stages.con.ret.grade, 'Approved');
  const [prd] = buildTimeline({ items: [item({ noClientApproval: true })], drawings, today });
  assert.equal(prd.prd, true);
  assert.deepEqual(prd.stages.con.ret, { kind: 'act', date: '2026-10-24', grade: 'Rejected' });
});

test('helpers', () => {
  assert.equal(worstGrade(['A', 'B', null]), 'B');
  assert.equal(worstGrade(['Approved', 'Rejected']), 'Rejected');
  assert.equal(daysBetween('2026-10-28', '2026-11-02'), 5);
  assert.deepEqual(SHOW.map(s => s.value), ['all', 'overdue', 'awaiting', 'dt']);
});
