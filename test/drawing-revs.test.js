// Drawings tracker: revisions within each stage, actual or forecast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDrawingRevs, nextRev } from '../hub-core/drawingRevs.js';
import { calcRow } from '../hub-core/programme/schedule.js';
import { OBSERVATORY, TODAY } from './fixtures/eit-nov-2026.js';

const row = OBSERVATORY['024'];
const prog = new Map([['item1', { row, c: calcRow(row, {}, { today: TODAY }), project: {} }]]);
const dwg = (over = {}) => ({ id: 'd1', title: '34303', type: 'Drawing', itemIds: ['item1'], status: 'Client Review', stage: 'S5 - For Review and Acceptance', rev: 'P03',
  s4: {}, s5: {}, c01: {}, prd: {}, ...over });
const sub = (o) => ({ id: Math.random().toString(36), drawingIds: ['d1'], createdAt: `${o.issued || o.submitted || '2026-11-01'}T10:00:00Z`, ...o });

test('next revision numbering', () => {
  assert.equal(nextRev('P02', 's5'), 'P03');
  assert.equal(nextRev('C09', 'c01'), 'C10');
  assert.equal(nextRev('P03', 'c01'), 'C01');
  assert.equal(nextRev(null, 's4'), 'P01');
});

test('each issued rev in a stage, with grade; QA bounces left out; C forces a forecast reissue', () => {
  const subs = [
    sub({ stage: 'S4', revision: 'P01', status: 'Graded', issued: '2026-06-05', reviewed: '2026-06-19', grade: 'C' }),
    sub({ stage: 'S4', revision: 'P02', status: 'Rejected', submitted: '2026-06-25' }),               // QA bounce
    sub({ stage: 'S4', revision: 'P02', status: 'Graded', issued: '2026-07-01', reviewed: '2026-07-15', grade: 'B' }),
    sub({ stage: 'S5', revision: 'P03', status: 'Graded', issued: '2026-10-22', reviewed: '2026-11-10', grade: 'C' }),
  ];
  const r = buildDrawingRevs({ drawings: [dwg()], submissions: subs, programme: prog, today: TODAY }).get('d1');
  assert.deepEqual(r.s4.map(e => [e.rev, e.issued.date, e.result?.grade]), [['P01', '2026-06-05', 'C'], ['P02', '2026-07-01', 'B']]);
  assert.equal(r.s5[0].issued.kind, 'act');
  const fc = r.s5[1];
  assert.equal(fc.rev, 'P04'); assert.equal(fc.issued.kind, 'fc');
  assert.ok(fc.issued.date > '2026-11-10');                 // never before the C came back
  assert.ok(fc.result.date > fc.issued.date);
  assert.ok(r.c01.length === 1 && r.c01[0].issued.kind === 'fc' && r.c01[0].rev === 'C01');
});

test('issued but not graded: forecast result; in-flight rev shown with its note', () => {
  const subs = [
    sub({ stage: 'S4', revision: 'P01', status: 'Graded', issued: '2026-06-05', reviewed: '2026-06-19', grade: 'B' }),
    sub({ stage: 'S5', revision: 'P02', status: 'Issued', issued: '2026-11-04' }),
  ];
  const r = buildDrawingRevs({ drawings: [dwg()], submissions: subs, programme: prog, today: TODAY }).get('d1');
  assert.equal(r.s5[0].result.kind, 'fc'); assert.ok(r.s5[0].result.date > '2026-11-04');
  const r2 = buildDrawingRevs({ drawings: [dwg()], submissions: [subs[0], sub({ stage: 'S5', revision: 'P02', status: 'Approved', submitted: '2026-11-17' })], programme: prog }).get('d1');
  assert.equal(r2.s5[0].rev, 'P02'); assert.equal(r2.s5[0].note, 'QA approved, to issue'); assert.equal(r2.s5[0].issued.kind, 'fc');
});

test('before the Drawing Flow: schedule dates stand in; earlier stages not forecast once a later one started', () => {
  const d = dwg({ s4: { submitted: '2026-01-10', status: 'C', statusDate: '2026-01-30' }, s5: { submitted: '2026-03-01', status: 'B', statusDate: '2026-03-20' }, rev: 'P03' });
  const r = buildDrawingRevs({ drawings: [d], submissions: [], programme: prog }).get('d1');
  assert.equal(r.s4.length, 1);                 // C at S4 but S5 already issued: no S4 reissue forecast
  assert.equal(r.s5[0].rev, 'P03'); assert.equal(r.s5[0].result.grade, 'B');
});

test('no forecasts for sketches, items off the programme, or skipped stages', () => {
  const r = buildDrawingRevs({ drawings: [dwg({ type: 'Sketch' })], submissions: [], programme: prog }).get('d1');
  assert.deepEqual([r.s4, r.s5, r.c01], [[], [], []]);
  const n = buildDrawingRevs({ drawings: [dwg({ noClientApproval: true })], submissions: [], programme: prog }).get('d1');
  assert.equal(n.s4, null); assert.equal(n.s5, null); assert.equal(n.c01[0].issued.kind, 'fc');
});
