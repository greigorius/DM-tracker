// Run: node lib/acceptance.test.js
// The acceptance checks from "Scheduling Tool – Fixes & Rules (Nov 2026)", run
// against the EIT items as they stood in Notion on 12 Nov 2026
// (lib/fixtures/eit-nov-2026.js).
import assert from 'node:assert/strict';
import { calcRow, snapStages, adjPatch, isProtectedProp, ADJ_PROPS, toISO, wdBetween } from '../hub-core/programme/schedule.js';
import { ganttBars } from '../hub-core/programme/ganttExport.js';
import { AUDITORIUM as A, OBSERVATORY as O, TODAY } from './fixtures/eit-nov-2026.js';

const iso = toISO;
const calc = r => calcRow(r, {}, { today: TODAY });
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('✓', name); } catch (e) { fail++; console.log('✗', name, '—', e.message.split('\n')[0]); } };
const after = (a, b, msg) => assert.ok(a > b, `${msg}: ${iso(a)} should be after ${iso(b)}`);

const ORDER_KEYS = { sub1A: 'sub1', st2A: 'st2', del2A: 'del2', sub2A: 'sub2', stCA: 'stC', delCA: 'delC', subCA: 'subC', prodDateAdj: 'prod', s4A: 's4', s5A: 's5' };
function propToStored(prop) {
  return { '1st DT Delivery (Adj)': 'del1AdjIn', '1st Submission Date (Adj)': 'subAdj1In', '2nd DT Start (Adj)': 'st2AdjIn',
    '2nd DT Delivery (Adj)': 'del2AdjIn', '2nd Submission Date (Adj)': 'subAdj2In', 'Constr. DT Start (Adj)': 'stCAdjIn',
    'Constr. DT Delivery (Adj)': 'delCAdjIn', 'Constr. Submission Date (Adj)': 'subAdjCIn' }[prop];
}


// ── 24-354 EIT Auditorium ──
t('137, 190, 191, 471, 666, 700: A4.5 after S5, no zero-length DT periods', () => {
  for (const k of [137, 190, 191, 471, 666, 700]) {
    const c = calc(A[k]);
    after(c.stCA, c.sub2A, `${k} A4.5 DT Start vs S5 submission`);
    assert.ok(c.stCA >= c.s5A, `${k} A4.5 DT Start before the S5 approval`);
    after(c.subCA, c.sub2A, `${k} A4.5 vs S5`);
    assert.ok(wdBetween(c.stCA, c.delCA) > 0, `${k} zero-length A4.5 DT period`);
    assert.ok(wdBetween(c.st2A, c.del2A) > 0, `${k} zero-length S5 DT period`);
  }
  const c = calc(A[137]);                       // was DT Start = Delivery = 28/10, A4.5 02/11
  assert.notEqual(iso(c.stCA), iso(c.delCA));
  assert.notEqual(iso(c.subCA), '2026-11-02');
});

t('111, 155, 200: A4.5 after their S5 reissue of 14/10/26 (not Jun–Jul 2026)', () => {
  for (const k of [111, 155, 200]) {
    const c = calc(A[k]);
    assert.ok(c.sub2A >= new Date('2026-10-14'), `${k} S5`);
    after(c.subCA, c.sub2A, `${k} A4.5 vs S5`);
    after(c.stCA, c.sub2A, `${k} A4.5 DT Start vs S5`);
    assert.equal(c.stages.c01.state, 'superseded');       // the June A4.5 is a closed cycle
    assert.ok(c.subCA > new Date('2026-10-14'));
  }
});

t('109, 700: S5 DT Start after the S4 submission', () => {
  for (const k of [109, 700]) {
    const c = calc(A[k]);
    after(c.st2A, c.sub1A, `${k} S5 DT Start vs S4 submission`);
    assert.ok(c.st2A >= c.s4A, `${k} S5 DT Start before S4 approval`);
  }
});

// ── 24-367 EIT Observatory Hall ──
t('010, 024, 041, 082: Constr. DT Start after S5 submission', () => {
  for (const k of ['010', '024', '041', '082']) {
    const c = calc(O[k]);
    after(c.stCA, c.sub2A, `${k}`);
    assert.ok(c.stCA >= c.s5A, `${k} A4.5 DT Start before S5 approval`);
    assert.equal(iso(c.sub2A), iso(O[k].subAdj2In), `${k} S5 programme date moved`);
    assert.equal(iso(c.subCA), iso(O[k].subAdjCIn), `${k} A4.5 programme date moved`);
  }
});

t('090: Constr. DT Delivery around 15/01/27 (A4.5 is 20/01/27)', () => {
  const c = calc(O['090']);
  assert.equal(iso(c.subCA), '2027-01-20');
  assert.equal(iso(c.delCA), '2027-01-15');
});

t('030: S5 DT Delivery not later than S5 submission (24/03/26)', () => {
  const c = calc(O['030']);
  assert.equal(iso(c.sub2A), '2026-03-24');
  assert.ok(c.del2A <= c.sub2A, iso(c.del2A));
  assert.equal(adjPatch(O['030'], c).fields['2nd DT Delivery (Adj)'], '2026-03-20');   // was 30/03
});

t('002: still shows S5 Reissue pending 06/11/26 after a sync', () => {
  const row = O['002'];
  // A second sync: the cache has seen this S5 Actual before
  const { rows: [r], patches } = snapStages([row], { [row.pageId]: { s4: '2025-12-19', s5: '2026-01-28', c01: null } });
  assert.equal(patches.length, 0);
  const c = calc(r);
  assert.equal(c.stages.s5.state, 'pending');
  assert.equal(iso(c.stages.s5.date), '2026-11-06');
  const p = adjPatch(r, c);
  assert.ok(!('2nd Submission Date (Adj)' in p.fields));               // unchanged
  // and the write-back leaves it pending next time
  const next = { ...r, ...Object.fromEntries(Object.entries(p.fields).map(([prop, v]) => [propToStored(prop), v])) };
  assert.equal(calc(next).stages.s5.state, 'pending');
});

// ── General ──
const ALL = [...Object.entries(A).map(([k, r]) => [`24-354 ${k}`, r]), ...Object.entries(O).map(([k, r]) => [`24-367 ${k}`, r])];

t('the validation pass lists no items', () => {
  const listed = ALL.filter(([, r]) => calc(r).orderViolations.length)
    .map(([n, r]) => `${n}: ${calc(r).orderViolations.map(v => v.text).join('; ')}`);
  assert.deepEqual(listed, []);
});

t('no Plan or Actual field is ever written', () => {
  for (const [n, r] of ALL) {
    const p = adjPatch(r, calc(r));
    for (const prop of Object.keys(p.fields)) assert.ok(!isProtectedProp(prop), `${n} writes ${prop}`);
  }
  for (const prop of Object.values(ADJ_PROPS)) assert.ok(!isProtectedProp(prop));
});

t('order rule holds on every item (Adj dates as they would be written)', () => {
  for (const [n, r] of ALL) {
    const c = calc(r);
    const seq = [['sub1A', 'st2A', true], ['st2A', 'del2A', false], ['del2A', 'sub2A', true], ['sub2A', 'stCA', true],
                 ['stCA', 'delCA', false], ['delCA', 'subCA', true], ['subCA', 'prodDateAdj', true],
                 ['s4A', 'st2A', false], ['s5A', 'stCA', false]];
    for (const [a, b, strict] of seq) {
      if (!c[a] || !c[b]) continue;
      // two recorded actuals can't be fixed by the tool — reported as data issues
      if (c.orderDataIssues.some(d => ORDER_KEYS[a] === d.a && ORDER_KEYS[b] === d.b)) continue;
      assert.ok(strict ? c[a] < c[b] : c[a] <= c[b], `${n}: ${a} ${iso(c[a])} vs ${b} ${iso(c[b])}`);
    }
  }
});

t('a sync is stable: writing the patch back and recalculating changes nothing', () => {
  for (const [n, r] of ALL) {
    const p1 = adjPatch(r, calc(r));
    const r2 = { ...r, ...Object.fromEntries(Object.entries(p1.fields).map(([prop, v]) => [propToStored(prop), v])) };
    const p2 = adjPatch(r2, calc(r2));
    assert.deepEqual(p2.fields, {}, `${n} second sync would write ${JSON.stringify(p2.fields)}`);
  }
});

t('gantt: reissued / superseded stages show the closed actual bar and the forecast bar', () => {
  const c = calc(A[111]);
  const g = ganttBars(A[111], c);
  const closed = g.bars.find(b => b.key === 'c01' && b.cycle === 'closed');
  assert.equal(iso(closed.sub.date), '2026-06-01'); assert.ok(closed.sub.actual);
  const fc = g.bars.find(b => b.key === 'c01' && b.cycle === 'reissue');
  assert.equal(iso(fc.sub.date), iso(c.subCA)); assert.ok(!fc.sub.actual);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
