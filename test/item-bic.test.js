import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bicContext, deriveItemBic, bicPlan, MIXED } from '../hub-core/item-bic.js';

const item = o => ({ id: 'i1', title: 'Suffix 100', status: 'In Progress', bic: null, dtIds: [], ...o });
const sub = (id, drawing, bic, o = {}) => ({ id, title: id, drawingIds: [drawing], itemIds: ['i1'], bic, status: 'Issued', createdAt: '2026-10-01', ...o });
const d = (it, snaps = {}) => deriveItemBic(it, bicContext(snaps));

test('lock status leaves it alone', () => assert.ok(d(item({ lockStatus: true })).skip));
test('closed items are cleared', () => assert.equal(d(item({ status: 'Design Complete', bic: 'DT' })).bic, null));

test('open variation that pauses beats drawings', () => {
  const r = d(item(), { variations: [{ id: 'v', itemIds: ['i1'], status: 'Awaiting Instruction', type: 'Design Change', bic: 'Project Team' }], submissions: [sub('s', 'd1', 'DT')] });
  assert.deepEqual([r.bic, r.source], ['Project Team', 'variation']);
});
test('open variation that does not pause is only logged: drawings decide', () => {
  const logged = { id: 'v', itemIds: ['i1'], status: 'Awaiting Instruction', type: 'Scope Change', pauseOverride: 'Does not pause', bic: 'Project Team' };
  assert.equal(d(item(), { variations: [logged], submissions: [sub('s', 'd1', 'DT')] }).bic, 'DT');
  assert.equal(d(item(), { variations: [{ ...logged, type: 'Altered for Buildability', pauseOverride: null }], submissions: [sub('s', 'd1', 'DT')] }).bic, 'DT');
});
test('variation with no status is ignored', () => {
  assert.equal(d(item(), { variations: [{ id: 'v', itemIds: ['i1'], status: null, bic: 'Client' }], submissions: [sub('s', 'd1', 'DT')] }).bic, 'DT');
});
test('stop-work RFI, then blocking action', () => {
  assert.equal(d(item(), { rfis: [{ id: 'r', itemIds: ['i1'], status: 'Open', stopsWork: true, bic: 'Architect' }] }).bic, 'Architect');
  assert.equal(d(item(), { rfis: [{ id: 'r', itemIds: ['i1'], status: 'Open', stopsWork: false, bic: 'Architect' }] }).source, 'default');
  assert.equal(d(item(), { actions: [{ id: 'a', itemIds: ['i1'], blocks: true, done: false, bic: 'Contractor' }] }).bic, 'Contractor');
});

test('drawings: latest submission per drawing; several holders = Mixed', () => {
  const subs = [sub('old', 'd1', 'DM', { createdAt: '2026-09-01' }), sub('new', 'd1', 'Contractor'), sub('x', 'd2', 'Contractor')];
  assert.equal(d(item(), { submissions: subs }).bic, 'Contractor');
  const r = d(item(), { submissions: [...subs, sub('y', 'd3', 'DT')] });
  assert.equal(r.bic, MIXED);
  assert.match(r.reason, /Contractor, DT/);
});
test('completed submissions drop out', () => {
  assert.equal(d(item({ dtIds: ['p'] }), { submissions: [sub('s', 'd1', 'DM', { status: 'Complete' })] }).bic, 'DT');
});

test('no drawings: DT if assigned, else DM; In Production → Production', () => {
  assert.equal(d(item({ dtIds: ['p'] })).bic, 'DT');
  assert.equal(d(item()).bic, 'DM');
  assert.equal(d(item({ status: 'In Production' })).bic, 'Production');
});

test('plan lists only differences and skips values outside the options', () => {
  const tasks = [item({ id: 'a', bic: 'DM' }), item({ id: 'b', bic: 'Contractor' }), item({ id: 'c', lockStatus: true, bic: 'Site' })];
  const p = bicPlan({ tasks, actions: [{ id: 'x', itemIds: ['b'], blocks: true, done: false, bic: 'Weird' }] }, { allowed: ['DM', 'DT', 'Contractor'] });
  assert.deepEqual(p.changes.map(c => c.id), []);
  assert.deepEqual(p.invalid.map(c => c.id), ['b']);
  assert.deepEqual(p.locked.map(c => c.id), ['c']);
});
