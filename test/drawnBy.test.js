import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawnByFor, drawnByIds } from '../hub-core/drawnBy.js';

test('everyone who submitted drawings for an item, most recent first', () => {
  const m = drawnByFor([
    { itemIds: ['i1'], dtIds: ['gary'], submitted: '2026-09-01' },
    { itemIds: ['i1'], dtIds: ['andrew'], submitted: '2026-10-20' },
    { itemIds: ['i1'], dtIds: ['gary'], submitted: '2026-10-02' },
    { itemIds: ['i2'], dtIds: [], submitted: '2026-10-02' },
    { itemIds: ['i1'], dtIds: ['old'], submitted: '2026-11-01', archived: true },
  ]);
  assert.deepEqual(drawnByIds(m, 'i1'), ['andrew', 'gary']);
  assert.equal(m.get('i1')[1].count, 2);
  assert.deepEqual(drawnByIds(m, 'i2'), []);
});
