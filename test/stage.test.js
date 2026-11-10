import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemStage, stagesFor } from '../hub-core/stage.js';

const dw = (stage, status, extra = {}) => ({ type: 'Drawing', stage, status, itemIds: ['i1'], ...extra });
const S4 = 'S4 - For Review and Authorisation', S5 = 'S5 - For Review and Acceptance', A45 = 'A4.5 - Authorised Mfg. & Constr. Design';

test('Item Status wins for finished, held and omitted items', () => {
  assert.equal(itemStage({ status: 'Design Complete' }, [dw(S5, 'Client Review')]).label, 'Design complete');
  assert.equal(itemStage({ status: 'Blocked' }, []).label, 'On hold');
  assert.equal(itemStage({ status: 'Omitted' }, []).label, 'Omitted');
  assert.equal(itemStage({ status: 'In Production' }, []).label, 'In production');
});

test('no drawings in Drawing Flow: not started or in progress from Item Status', () => {
  assert.equal(itemStage({ status: 'To Do' }, []).label, 'Not started');
  assert.equal(itemStage({ status: 'In Progress' }, [dw(null, null)]).label, 'In progress');
});

test('the item is as far along as its least-advanced drawing', () => {
  const s = itemStage({ status: 'In Progress' }, [dw(A45, 'Schedule'), dw(S5, 'Client Review'), dw(S5, 'DM Review')]);
  assert.equal(s.label, 'S5 · DM review');
  assert.equal(s.tone, 'accent');
  assert.match(s.why, /^S5: DM review 1, With client 1 · 1 drawing further on$/);
});

test('a held drawing shows first; an unissued drawing reads as DT drawing', () => {
  assert.equal(itemStage({ status: 'In Progress' }, [dw(S5, 'Client Review'), dw(S5, 'On Hold')]).label, 'S5 · On hold');
  assert.equal(itemStage({ status: 'In Progress' }, [dw(S4, null)]).label, 'S4 · DT drawing');
  assert.equal(itemStage({ status: 'In Progress' }, [dw(A45, 'Schedule')]).label, 'A4.5 · Approved');
});

test('sketches only count when an item has no numbered drawings', () => {
  const st = itemStage({ status: 'In Progress' }, [dw(S5, 'Client Review'), dw(S4, 'DT Review', { type: 'Sketch' })]);
  assert.equal(st.label, 'S5 · With client');
  assert.equal(stagesFor([{ id: 'i1', status: 'In Progress' }], [dw(S4, 'DM Review', { type: 'Sketch' })]).get('i1').label, 'S4 · DM review');
});
