import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDtEmail, teamIssues, teamErrorCount, todoStatus, weekCommencing, groupByItem } from '../hub-core/team.js';
import { mappers } from '../hub-core/mappers.js';

const today = '2026-11-02'; // Monday
const dt = { id: 'dt1', title: 'Jordan Salway', role: 'DT', email: 'j@example.com' };
const items = new Map([['i1', { id: 'i1', title: 'Suffix 200', projectId: 'p1' }], ['i2', { id: 'i2', title: 'Suffix 110', projectId: 'p1' }]]);
const projects = new Map([['p1', 'EIT Observatory']]);
const t = (id, o) => ({ id, title: id, personIds: ['dt1'], itemIds: ['i1'], status: 'Not Started', ...o });

test('status falls back to Task Done until backfilled', () => {
  assert.equal(todoStatus({ status: 'Blocked' }), 'Blocked');
  assert.equal(todoStatus({ done: true }), 'Done');
  assert.equal(todoStatus({ done: false }), 'Not Started');
});

test('mapper reads Status, falling back to Task Done', () => {
  const page = (status, done) => ({ id: 'x', properties: {
    'Status': { type: 'select', select: status ? { name: status } : null },
    'Task Done': { type: 'checkbox', checkbox: done },
  } });
  assert.deepEqual([mappers.todo(page(null, true)).status, mappers.todo(page(null, true)).done], ['Done', true]);
  assert.deepEqual([mappers.todo(page(null, false)).status, mappers.todo(page(null, false)).done], ['Not Started', false]);
  assert.deepEqual([mappers.todo(page('In Progress', true)).status, mappers.todo(page('In Progress', true)).done], ['In Progress', false]);
});

test('week commencing is the Monday', () => {
  assert.equal(weekCommencing('2026-11-02'), '2026-11-02');
  assert.equal(weekCommencing('2026-11-08'), '2026-11-02');
  assert.equal(weekCommencing('2026-11-05'), '2026-11-02');
});

test('email scope: overdue + next 14 days, open only, this DT only', () => {
  const todos = [
    t('late', { end: '2026-10-20', hours: 2 }),
    t('soon', { end: '2026-11-10', status: 'In Progress', itemIds: ['i2'] }),
    t('edge', { end: '2026-11-16', hours: 1.5 }),
    t('later', { end: '2026-11-17' }),
    t('done', { end: '2026-11-03', status: 'Done' }),
    t('undated', {}),
    t('other', { end: '2026-11-03', personIds: ['dt2'] }),
  ];
  const e = buildDtEmail({ dt, todos, itemsById: items, projectsById: projects, today });
  assert.equal(e.meta.openCount, 3);
  assert.equal(e.meta.overdueCount, 1);
  assert.equal(e.meta.estHours, 3.5);
  assert.equal(e.meta.windowEnd, '2026-11-16');
  assert.equal(e.undated, 1);
  assert.equal(e.subject, 'Your to-dos — w/c 2 Nov 2026');
  assert.match(e.html, /Hi Jordan/);
  assert.ok(e.html.indexOf('Suffix 200') < e.html.indexOf('Suffix 110'), 'item with the earliest end date first');
  assert.doesNotMatch(e.html, /later|>done</);
});

test('no hours anywhere → no hours total', () => {
  const e = buildDtEmail({ dt, todos: [t('a', { end: '2026-11-04' })], itemsById: items, projectsById: projects, today });
  assert.equal(e.meta.estHours, null);
  assert.doesNotMatch(e.html, /est\. hrs<\/strong>|<strong>\d+<\/strong> est/);
});

test('nothing in scope → empty', () => {
  const e = buildDtEmail({ dt, todos: [t('a', { end: '2027-01-01' })], itemsById: items, projectsById: projects, today });
  assert.equal(e.empty, true);
});

test('html escapes task text', () => {
  const e = buildDtEmail({ dt, todos: [t('<b>x</b>', { end: '2026-11-04' })], itemsById: items, projectsById: projects, today });
  assert.match(e.html, /&lt;b&gt;x&lt;\/b&gt;/);
});

test('groupByItem sorts tasks by end date inside each item', () => {
  const g = groupByItem([t('b', { end: '2026-11-09' }), t('a', { end: '2026-11-03' })], items);
  assert.deepEqual(g[0].rows.map(r => r.id), ['a', 'b']);
});

test('team issues and error count', () => {
  const todo = [
    { id: '1', status: 'Not Started', personIds: [], itemIds: ['i1'], end: '2026-11-03', hours: 1 },
    { id: '2', status: 'Blocked', personIds: ['dt1'], itemIds: [], end: null, rfiIds: [], vcIds: [], actionIds: [] },
    { id: '3', status: 'Done', personIds: [], itemIds: [], end: null },
  ];
  const team = [dt, { id: 'dt2', title: 'No Mail', role: 'DT', email: null }, { id: 'x', title: 'Nobody', role: null }];
  const i = teamIssues({ todo, team });
  assert.equal(i.noPerson.length, 1);
  assert.equal(i.noItem.length, 1);
  assert.equal(i.noEnd.length, 1);
  assert.equal(i.dtNoEmail.length, 1);
  assert.equal(i.noRole.length, 1);
  assert.equal(i.noHours.length, 1);
  assert.equal(i.blockedNoLink.length, 1);
  assert.equal(teamErrorCount(i), 4);
});
