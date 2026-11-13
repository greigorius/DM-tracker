// Programme sync plan: what the Hub would write to Notion, and the write guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPage } from '../hub-core/mappers.js';
import { programmePlan, changeProperties } from '../hub-core/programme/sync.js';
import { calcRow, adjPatch } from '../hub-core/programme/schedule.js';
import { AUDITORIUM, OBSERVATORY, TODAY } from './fixtures/eit-nov-2026.js';
import { taskPage, drawingPage, projectPage } from './fixtures/notion-pages.js';

function snapsFor(rows, projectStatus = 'In progress') {
  const tasks = [], drawings = [];
  for (const row of rows) {
    tasks.push(mapPage('tasks', taskPage(row, 'p1')));
    for (const d of row._dwgs || []) drawings.push(mapPage('drawings', drawingPage(d, row.pageId)));
  }
  return { tasks, drawings, variations: [], rfis: [], projects: [mapPage('projects', projectPage('p1', {}, projectStatus))] };
}

test('plan = the Scheduling Tool sync: differing Adj dates, blocked items listed', () => {
  const rows = [...Object.values(AUDITORIUM), ...Object.values(OBSERVATORY)];
  const plan = programmePlan(snapsFor(rows), {}, { today: TODAY });
  for (const row of rows) {
    const want = adjPatch(row, calcRow(row, {}, { today: TODAY }));
    const got = plan.changes.find(c => c.id === row.pageId);
    if (want.blocked) {
      assert.ok(plan.blocked.some(b => b.id === row.pageId), `${row.name} blocked`);
      assert.equal(got, undefined);
    } else assert.deepEqual(got?.fields || {}, want.fields, row.name);
  }
});

test('only live (In progress) projects are planned', () => {
  const plan = programmePlan(snapsFor(Object.values(AUDITORIUM), 'Done'), {}, { today: TODAY });
  assert.equal(plan.changes.length + plan.blocked.length, 0);
});

test('a newly issued stage snaps Adj to the Actual (second pass only)', () => {
  const row = { ...AUDITORIUM[137], subAdj2In: '2026-10-20' };   // S5 went out after its Adj date
  const snaps = snapsFor([row]);
  const first = programmePlan(snaps, {}, { today: TODAY });                 // baseline recorded
  const seen = { [row.pageId]: { ...first.rowCache[row.pageId], s5: '2026-10-01' } }; // pretend S5 was different before
  const second = programmePlan(snaps, seen, { today: TODAY });
  const c = second.changes.find(x => x.id === row.pageId);
  assert.ok(c?.snapped >= 1);
  assert.equal(c.fields['2nd Submission Date (Adj)'], row.sub2ActDate);
});

test('writes are limited to Adj dates and Reissue Reason', () => {
  const ok = changeProperties({ fields: { '2nd Submission Date (Adj)': '2026-11-20', '1st DT Delivery (Adj)': null }, selects: { 'Reissue Reason': null } });
  assert.deepEqual(Object.keys(ok).sort(), ['1st DT Delivery (Adj)', '2nd Submission Date (Adj)', 'Reissue Reason']);
  assert.throws(() => changeProperties({ fields: { '2nd Submission Date (Plan)': '2026-11-20' } }), /Refused/);
  assert.throws(() => changeProperties({ fields: { 'S5 Submit Date (Actual)': '2026-11-20' } }), /Refused/);
  assert.throws(() => changeProperties({ selects: { 'Item Status': 'Complete' } }), /Refused/);
});
