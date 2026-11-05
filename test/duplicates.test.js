import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicatePairs, words, pairKey, duplicateIds } from '../hub-core/duplicates.js';

const act = (id, title, extra = {}) => ({ id, title, type: 'Action', itemIds: ['i1'], done: false, ...extra });
const items = new Map([['i1', { id: 'i1', projectId: 'p1' }], ['i2', { id: 'i2', projectId: 'p1' }], ['i3', { id: 'i3', projectId: 'p2' }]]);
const filler = [
  act('f1', 'Issue revised door schedule to architect', { itemIds: ['i3'] }),
  act('f2', 'Book site survey for curtain wall', { itemIds: ['i3'] }),
  act('f3', 'Send fee proposal for balustrades', { itemIds: ['i3'] }),
];

test('reference numbers survive spacing and hyphens', () => {
  assert.deepEqual(words('DRS-303'), words('drs 303'));
  assert.deepEqual(words('DRS303'), words('DRS-303'));
});

test('the same action worded differently on the same item is flagged', () => {
  const pairs = findDuplicatePairs([
    act('a', 'Chase DRS-303 ironmongery schedule from client'),
    act('b', 'Client to send ironmongery schedule for DRS 303 - chase'),
    ...filler,
  ], { items });
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].key, pairKey('a', 'b'));
  assert.equal(pairs[0].shared, 'item');
});

test('different actions on the same item are not flagged', () => {
  const pairs = findDuplicatePairs([
    act('a', 'Chase DRS-303 ironmongery schedule from client'),
    act('b', 'Issue S5 drawings for entrance canopy'),
    ...filler,
  ], { items });
  assert.equal(pairs.length, 0);
});

test('closed actions, notes and dismissed pairs are left out', () => {
  const a = act('a', 'Confirm glass spec with facade engineer');
  const b = act('b', 'Facade engineer to confirm glass spec');
  assert.equal(findDuplicatePairs([a, b, ...filler], { items }).length, 1);
  assert.equal(findDuplicatePairs([a, { ...b, done: true }, ...filler], { items }).length, 0);
  assert.equal(findDuplicatePairs([a, { ...b, type: 'Note' }, ...filler], { items }).length, 0);
  assert.equal(findDuplicatePairs([a, b, ...filler], { items, dismissed: [pairKey('b', 'a')] }).length, 0);
});

test('items in different projects are never paired', () => {
  const pairs = findDuplicatePairs([
    act('a', 'Confirm glass spec with facade engineer', { itemIds: ['i1'] }),
    act('b', 'Confirm glass spec with facade engineer', { itemIds: ['i3'] }),
  ], { items });
  assert.equal(pairs.length, 0);
});

test('an unfiled action can match a filed one when it is close', () => {
  const pairs = findDuplicatePairs([
    act('a', 'Confirm glass spec with facade engineer'),
    act('b', 'confirm the glass spec with the facade engineer', { itemIds: [] }),
    ...filler,
  ], { items });
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].shared, 'any');
  assert.deepEqual([...duplicateIds(pairs)].sort(), ['a', 'b']);
});

test('actions naming different drawing numbers are not duplicates', () => {
  const pairs = findDuplicatePairs([
    act('a', 'Review EIT-TMJ-AA-B3-D-I-27240 Rev C01 — Suffix 236'),
    act('b', 'Review EIT-TMJ-AA-B3-D-I-27241 Rev C01 — Suffix 236'),
    act('c', 'Reissue drop rod setting out drawing'),
    act('d', 'Reissue drop rod setting out drawing', { itemIds: [] }),
    ...filler,
  ], { items });
  assert.deepEqual(pairs.map(p => p.key), [pairKey('c', 'd')]);
});
