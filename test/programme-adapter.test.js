// Date-equality check for the Programme port: the same Notion data must give
// the same dates whether it goes through the Scheduling Tool's route mapping
// (fixtures = its task rows) or through the Hub's snapshot mappers + adapter.
//
// Each fixture row is turned back into Notion pages (Tasks, Master Drawing
// Schedule, Variations, RFIs, Projects), mapped by hub-core/mappers.js, rebuilt
// by hub-core/programme/adapter.js, and both rows are run through calcRow.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPage } from '../hub-core/mappers.js';
import { engineRow, engineProject, holdsByItem, drawingsByItem, buildProgramme } from '../hub-core/programme/adapter.js';
import { calcRow, adjPatch, ADJ_PROPS, toISO } from '../hub-core/programme/schedule.js';
import { AUDITORIUM, OBSERVATORY, TODAY } from './fixtures/eit-nov-2026.js';
import { taskPage, drawingPage, projectPage } from './fixtures/notion-pages.js';

// ── Compare ─────────────────────────────────────────────────────────────────
const DATE_KEYS = ['dtStart1A', 'del1A', 'sub1A', 's4A', 'st2A', 'del2A', 'sub2A', 's5A', 'stCA', 'delCA', 'subCA', 'c01SignOffAdj', 'prodDateAdj',
  'del1P', 'sub1P', 'st2P', 'del2P', 'sub2P', 'stCP', 'delCP', 'subCP', 'prodDateP'];
function summary(c, row) {
  const out = {};
  for (const k of DATE_KEYS) out[k] = c[k] ? toISO(c[k]) : null;
  out.flags = c.flags; out.violations = c.orderViolations; out.omitted = c.omitted; out.floatDays = c.floatDays;
  out.stages = Object.fromEntries(Object.entries(c.stages || {}).map(([k, s]) => [k, s.state]));
  out.patch = adjPatch(row, c).fields;
  return out;
}

function viaHub(row, { holds = [], project = {} } = {}) {
  const pid = 'proj-1';
  const task = mapPage('tasks', taskPage(row, pid));
  const dwgs = (row._dwgs || []).map(d => mapPage('drawings', drawingPage(d, row.pageId)));
  const proj = engineProject(mapPage('projects', projectPage(pid, project)));
  const hubRow = engineRow(task, dwgs, holds);
  return { hubRow, c: calcRow(hubRow, proj, { today: TODAY }) };
}

const ALL = { ...Object.fromEntries(Object.entries(AUDITORIUM).map(([k, v]) => [`24-354 ${k}`, v])),
  ...Object.fromEntries(Object.entries(OBSERVATORY).map(([k, v]) => [`24-367 ${k}`, v])) };

for (const [name, row] of Object.entries(ALL)) {
  test(`same dates through the Hub: ${name}`, () => {
    const want = summary(calcRow(row, {}, { today: TODAY }), row);
    const { hubRow, c } = viaHub(row);
    assert.deepEqual(summary(c, hubRow), want);
    // MDS-derived inputs match the tool's
    for (const k of ['sub1ActDate', 's4Date', 'sub2ActDate', 's5Date', 'subCActDate', 'c01SignOffActDate']) assert.equal(hubRow[k] ?? null, row[k] ?? null, k);
    assert.deepEqual(hubRow.s4Status, row.s4Status); assert.deepEqual(hubRow.s5Status, row.s5Status);
    assert.deepEqual(hubRow.mdsOpen ?? [], row.mdsOpen ?? []);
  });
}

test('project periods, minimums and holds carry through', () => {
  const row = AUDITORIUM[137];
  const project = { approvalDays: 5, mobilisationDays: 1, qaDays: 2, minQaDays: 1, revisionDays: 4 };
  const holds = [{ start: '2026-11-02', end: '2026-11-20', addedDays: 2, label: 'VO7 Change', source: 'variation' }];
  const want = summary(calcRow({ ...row, holds }, project, { today: TODAY }), row);
  const { hubRow, c } = viaHub(row, { holds, project });
  assert.deepEqual(summary(c, hubRow), want);
});

test('manual DT Start and programme-driven inputs carry through', () => {
  const row = { ...OBSERVATORY['010'], manualDtStart: ['S5'], st2AdjIn: '2026-01-20' };
  const want = summary(calcRow(row, {}, { today: TODAY }), row);
  const { hubRow, c } = viaHub(row);
  assert.equal(hubRow.programmeDriven, row.programmeDriven);
  assert.deepEqual(summary(c, hubRow), want);
});

test('holdsByItem follows the Scheduling Tool rules', () => {
  const vcs = [
    { id: 'v1', requested: '2026-10-01', decision: null, type: 'Design Change', status: 'Awaiting Instruction', itemIds: ['a'], number: 3, title: 'Glass', addedDays: 4 },
    { id: 'v2', requested: '2026-10-01', type: 'Cost Only', status: 'Awaiting Instruction', itemIds: ['a'] },                       // doesn't pause
    { id: 'v3', requested: '2026-10-01', type: 'Cost Only', pauseOverride: 'Pauses', status: 'Instruction Received', instructed: true, addedDays: 2, itemIds: ['b'], decision: '2026-10-10' },
    { id: 'v4', requested: '2026-10-01', type: 'Design Change', pauseOverride: "Doesn't pause", itemIds: ['a'] },
    { id: 'v5', requested: null, type: 'Design Change', itemIds: ['a'] },                                                                // no request date
    { id: 'v6', requested: '2026-09-01', type: 'Scope Change', status: 'Declined', editedAt: '2026-09-20T10:00:00Z', itemIds: ['c'] },
  ];
  const rfis = [
    { id: 'r1', stopsWork: true, raised: '2026-10-05', responded: null, status: 'Open', itemIds: ['a'], number: 12, title: 'Fixings' },
    { id: 'r2', stopsWork: false, raised: '2026-10-05', itemIds: ['a'] },
    { id: 'r3', stopsWork: true, raised: null, createdAt: '2026-08-01T09:00:00Z', status: 'Closed', editedAt: '2026-08-09T09:00:00Z', itemIds: ['c'] },
  ];
  const h = holdsByItem(vcs, rfis);
  assert.deepEqual(h.a.map(x => x.label), ['VO3 Glass', 'RFI 12 Fixings']);
  assert.equal(h.a[0].addedDays, 0);                       // not instructed
  assert.equal(h.b[0].addedDays, 2); assert.equal(h.b[0].end, '2026-10-10');
  assert.equal(h.c[0].end, '2026-09-20'); assert.ok(h.c[0].note);
  assert.equal(h.c[1].start, '2026-08-01'); assert.equal(h.c[1].end, '2026-08-09');
});

test('formula or roll-up properties are not read as inputs', () => {
  const page = taskPage({ name: 'x', pageId: 'x', status: 'In Progress' }, 'p');
  page.properties['Draw Days - DD1'] = { type: 'formula', formula: { type: 'number', number: 9 } };
  page.properties['Date of Instruction'] = { type: 'formula', formula: { type: 'date', date: { start: '2026-01-01' } } };
  const t = mapPage('tasks', page);
  assert.equal(t.sched.dd1, null); assert.equal(t.sched.dateOfInstruction, null);
});

test('buildProgramme groups drawings and holds per item and skips archived rows', () => {
  const row = AUDITORIUM[190];
  const task = mapPage('tasks', taskPage(row, 'p1'));
  const dwgs = row._dwgs.map(d => mapPage('drawings', drawingPage(d, row.pageId)));
  dwgs.push({ ...dwgs[0], id: 'gone', archived: true, s4: { submitted: '2027-01-01' } });
  const out = buildProgramme({ tasks: [task, { ...task, id: 'other', projectId: 'p2' }], drawings: dwgs, variations: [], rfis: [], projects: [] },
    { projectId: 'p1', today: TODAY });
  assert.equal(out.length, 1);
  assert.equal(drawingsByItem(dwgs).get(row.pageId).length, 4);
  assert.deepEqual(summary(out[0].c, out[0].row), summary(calcRow(row, {}, { today: TODAY }), row));
  assert.ok(Object.keys(ADJ_PROPS).length === 8);
});
