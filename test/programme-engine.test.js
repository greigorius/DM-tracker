// Run: node lib/schedule.test.js
import assert from 'node:assert/strict';
import { ganttBars } from '../hub-core/programme/ganttExport.js';
import { calcRow, addWD, wdBetween, toISO, mergeHolds, resolvePeriods, resolveStages, mergeStages, emptyStages, snapStages,
  checkOrder, adjPatch, isProtectedProp, resolveMinimums, drawingBreakdown, drawingPosition } from '../hub-core/programme/schedule.js';

const iso = toISO;
const proj = {};                      // all defaults
const today = '2026-10-05';
let pass = 0;
let fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("✓", name); } catch (e) { fail++; console.log("✗", name, "—", e.message.split("\n")[0]); } };

t('defaults resolve D, project override P, item exception I', () => {
  const r = resolvePeriods({ dd1: 12 }, { qaDays: 2 });
  assert.equal(r.values.approvalIssue, 12); assert.equal(r.source.approvalIssue, 'I');
  assert.equal(r.values.qa, 2);             assert.equal(r.source.qa, 'P');
  assert.equal(r.values.clientReview, 10);  assert.equal(r.source.clientReview, 'D');
});

t('forward chain from Date of Instruction', () => {
  const c = calcRow({ dateOfInstruction: '2026-10-05' }, proj, { today });
  assert.equal(iso(c.dtStart1Plan), '2026-10-19');           // +10 coordination
  assert.equal(iso(c.del1P),        '2026-11-02');           // +10 approval issue
  assert.equal(iso(c.sub1P),        '2026-11-05');           // +3 QA
  assert.equal(iso(c.s4ApprovalPlan),'2026-11-19');          // +10 client review
  assert.equal(iso(c.st2P),         '2026-11-24');           // +3 DT mobilisation
  assert.equal(iso(c.del2P),        '2026-12-03');           // +7 revision
  assert.equal(iso(c.sub2P),        '2026-12-08');           // +3 QA
  assert.equal(iso(c.s5ApprovalPlan),'2026-12-22');          // +10 review
  assert.equal(iso(c.stCP),         '2026-12-29');           // +3 DT mobilisation over Christmas
  assert.equal(iso(c.delCP),        '2027-01-04');           // +3 construction
  assert.equal(iso(c.subCP),        '2027-01-07');           // +3 QA
  assert.equal(iso(c.c01SignOffPlan),'2027-01-11');          // +2 sign off
  assert.equal(iso(c.prodDateP),    '2027-02-09');           // +21 production pack
  assert.equal(iso(c.prodDateAdj),  iso(c.prodDateP));       // no actuals / holds
  assert.equal(c.anchorType, 'instruction');
});

t('back-plan from target lands on the same start', () => {
  const c = calcRow({ prodDate: '2027-02-09' }, proj, { today });
  assert.equal(iso(c.instrPlan), '2026-10-05');
  assert.equal(iso(c.dtStart1Plan), '2026-10-19');
  assert.equal(c.floatDays, 0);
});

t('float: start + target, negative when late', () => {
  const c = calcRow({ dateOfInstruction: '2026-10-05', prodDate: '2027-02-02' }, proj, { today });
  assert.equal(c.floatDays, -5);
});

t('1st DT Start (Plan) as start skips coordination', () => {
  const c = calcRow({ dtStart1PlanInput: '2026-10-19' }, proj, { today });
  assert.equal(iso(c.prodDateP), '2027-02-09');
  assert.equal(c.anchorType, 'dtStart');
});

t('§4 hold in a DT period is squeezed out (our side); added days still extend', () => {
  const base = calcRow({ dateOfInstruction: '2026-10-05' }, proj, { today });
  const hs = addWD('2026-10-19', 4), he = addWD(hs, 6);
  const c = calcRow({ dateOfInstruction: '2026-10-05',
    holds: [{ start: iso(hs), end: iso(he), addedDays: 3, label: 'VO1' }] }, proj, { today });
  assert.equal(wdBetween(base.sub1A, c.sub1A), 3);            // 6 hold days absorbed (cap 5 DT + 2 QA)
  assert.equal(wdBetween(base.prodDateAdj, c.prodDateAdj), 3);
  assert.equal(c.holdDays, 6); assert.equal(c.addedDays, 3);
  assert.equal(iso(c.prodDateP), iso(base.prodDateP));       // plan never moves
  assert.deepEqual(c.flags.squeezed.map(x => x.stage), ['s4']);
  assert.ok(!c.flags.slipping);
});

t('§4 hold longer than the squeeze capacity: floor, then slip a day per day lost', () => {
  const base = calcRow({ dateOfInstruction: '2026-10-05' }, proj, { today });
  const hs = addWD('2026-10-19', 4), he = addWD(hs, 15);
  const c = calcRow({ dateOfInstruction: '2026-10-05', holds: [{ start: iso(hs), end: iso(he) }] }, proj, { today });
  // capacity: Approval Issue 10 → floor 5, QA 3 → floor 1 = 7
  assert.equal(wdBetween(base.sub1A, c.sub1A), 15 - 7);
  assert.equal(wdBetween(base.s4A, c.s4A), 8);                // client review keeps its full 10
  assert.equal(wdBetween(base.prodDateAdj, c.prodDateAdj), 8);
  assert.ok(c.flags.slipping); assert.equal(c.flags.slipDays, 8);
  assert.equal(wdBetween(c.del1A, c.sub1A), 1);               // QA at its floor
});

t('added days during client review go to the next Axiom step', () => {
  const base = calcRow({ dateOfInstruction: '2026-10-05' }, proj, { today });
  const hs = addWD(base.sub1A, 2), he = addWD(hs, 4);
  const c = calcRow({ dateOfInstruction: '2026-10-05',
    holds: [{ start: iso(hs), end: iso(he), addedDays: 2 }] }, proj, { today });
  assert.equal(wdBetween(base.s4A, c.s4A), 4);               // review paused, never squeezed
  assert.equal(wdBetween(base.sub2A, c.sub2A), 2);           // S5 DT squeezed back; the +2 added days stand
  assert.equal(c.addedDays, 2);
  assert.ok(c.st2A >= c.s4A);
});

t('open hold runs to today', () => {
  const c = calcRow({ dateOfInstruction: '2026-09-01',
    holds: [{ start: '2026-09-21', end: null }] }, proj, { today: '2026-10-05' });
  assert.equal(c.onHold, true);
  assert.equal(c.holdDays, 10);
  const c2 = calcRow({ dateOfInstruction: '2026-09-01',
    holds: [{ start: '2026-09-21', end: null }] }, proj, { today: '2026-10-12' });
  assert.equal(wdBetween(c.prodDateAdj, c2.prodDateAdj), 5);
});

t('overlapping holds merge', () => {
  const m = mergeHolds([{ start: '2026-10-05', end: '2026-10-12', addedDays: 1 },
                        { start: '2026-10-08', end: '2026-10-15', addedDays: 2 }], today);
  assert.equal(m.length, 1); assert.equal(iso(m[0].end), '2026-10-15'); assert.equal(m[0].addedDays, 3);
});

t('actuals override and roll forward; plan unchanged', () => {
  const c = calcRow({ dateOfInstruction: '2026-10-05', sub1ActDate: '2026-11-10' }, proj, { today });
  assert.equal(iso(c.sub1A), '2026-11-10');
  assert.equal(iso(c.s4A), iso(addWD('2026-11-10', 10)));
  assert.equal(c.dtSlip1, 3);
  assert.equal(c.prodSlip_adj, 3);
});

t('actual date beats a hold in the same step', () => {
  const c = calcRow({ dateOfInstruction: '2026-10-05', del1Act: '2026-11-02',
    holds: [{ start: '2026-10-22', end: '2026-10-29' }] }, proj, { today });
  assert.equal(iso(c.del1A), '2026-11-02');
});

t('No Client Approval: coordination → construction issue', () => {
  const c = calcRow({ dateOfInstruction: '2026-10-05', noClientApproval: true }, proj, { today });
  assert.equal(iso(c.stCP), '2026-10-19');
  assert.equal(iso(c.delCP), '2026-10-22');
  assert.equal(c.sub1P, null);
});

t('hold before the item starts delays the start', () => {
  const c = calcRow({ dateOfInstruction: '2026-10-05',
    holds: [{ start: '2026-10-01', end: '2026-10-08', addedDays: 2 }] }, proj, { today });
  assert.equal(iso(c.dtStart1A), iso(addWD('2026-10-08', 12)));
});

t('actual DT start overrides a 1st DT Start (Plan) anchor', () => {
  const c = calcRow({ dtStart1PlanInput: '2026-09-14', dtStart1Act: '2026-09-16', dd1: 12 }, proj, { today: '2026-09-16' });
  assert.equal(iso(c.dtStart1Plan), '2026-09-14');
  assert.equal(iso(c.dtStart1A), '2026-09-16');
  assert.equal(iso(c.del1A), iso(addWD('2026-09-16', 12)));
});

t('item Coordination Days overrides project/default', () => {
  const c = calcRow({ dateOfInstruction: '2026-10-05', coordDays: 5 }, { coordinationDays: 15 }, { today });
  assert.equal(iso(c.dtStart1Plan), iso(addWD('2026-10-05', 5)));
  assert.equal(resolvePeriods({ coordDays: 5 }, {}).source.coordination, 'I');
});

t('manual Hold Days are a hold: counted, squeezed first, then slip', () => {
  const r = { dateOfInstruction: '2026-10-05' };
  const base = calcRow(r, proj, { today });
  const small = calcRow({ ...r, holdDaysManual: 4 }, proj, { today });
  assert.equal(small.holdDays, 4);
  assert.equal(wdBetween(base.dtStart1A, small.dtStart1A), 4);         // the start is held
  assert.equal(iso(small.sub1A), iso(base.sub1A));                     // absorbed by squeezing
  const big = calcRow({ ...r, holdDaysManual: 12 }, proj, { today });
  assert.equal(wdBetween(base.sub1A, big.sub1A), 12 - 7);              // capacity 7
  assert.equal(iso(big.prodDateP), iso(base.prodDateP));
  // a day later the result is the same (manual days don't creep)
  const big2 = calcRow({ ...r, holdDaysManual: 12 }, proj, { today: '2026-10-06' });
  assert.equal(iso(big2.prodDateAdj), iso(big.prodDateAdj));
});

t('manual Hold Days on an item not yet started delay it', () => {
  const base = calcRow({ dateOfInstruction: '2026-11-02' }, proj, { today });
  const c = calcRow({ dateOfInstruction: '2026-11-02', holdDaysManual: 3 }, proj, { today });
  assert.equal(wdBetween(base.dtStart1A, c.dtStart1A), 3);
});

t('issue coordination days move Adjusted only; Plan stays the baseline', () => {
  const base = calcRow({ dtStart1PlanInput: '2026-10-19' }, proj, { today });
  const c = calcRow({ dtStart1PlanInput: '2026-10-19', coordS4Days: 5, coordS5Days: 3, coordC01Days: 2 }, proj, { today });
  assert.equal(iso(c.prodDateP), iso(base.prodDateP));                 // plan unchanged
  assert.equal(wdBetween(base.del1A, c.del1A), 5);                     // S4 issue +5
  assert.equal(wdBetween(base.del2A, c.del2A), 8);                     // +3 more in S5
  assert.equal(wdBetween(base.prodDateAdj, c.prodDateAdj), 10);        // +2 in C01
  assert.equal(c.coordS4A, 5); assert.equal(c.coordDays, 10);
  // all of it is coordination, none is DT
  assert.equal(c.dtSlip1_adj, 0); assert.equal(c.dtSlip2_adj, 0); assert.equal(c.dtSlipC_adj, 0);
  assert.equal(c.totalSlip1, 5); assert.equal(c.totalSlip2, 8); assert.equal(c.prodSlip_adj, 10);
});

t('late submission: coordination explains part, DT the rest', () => {
  const base = calcRow({ dtStart1PlanInput: '2026-10-19' }, proj, { today });
  const late = iso(addWD(base.sub1P, 8));                                // submitted 8 days late
  const c = calcRow({ dtStart1PlanInput: '2026-10-19', sub1ActDate: late, coordS4Days: 5 }, proj, { today });
  assert.equal(c.dtSlip1_adj, 3);
  assert.equal(c.approvalSlip1_adj, 0);
  assert.equal(c.totalSlip1, 8);
});

t('coordination on a stage already completed only explains real lateness', () => {
  // Suffix 003 shape: first S4 submission came EARLY despite 109 coord days entered
  const c = calcRow({ dtStart1PlanInput: '2026-03-04', dtStart1Act: '2026-03-04', dd1: 40, coordS4Days: 109,
    sub1ActDate: '2026-04-08', s4Date: '2026-04-23' }, { approvalDays: 14 }, { today });
  assert.ok(c.dtSlip1_adj <= 0);
  assert.equal(c.dtSlip1_adj, c.totalSlip1 - c.approvalSlip1_adj);   // nothing credited to coordination
  // and when it was late, coordination absorbs up to the lateness
  const late = calcRow({ dtStart1PlanInput: '2026-03-04', dd1: 40, coordS4Days: 10,
    sub1ActDate: iso(addWD(addWD('2026-03-04', 43), 15)) }, {}, { today });
  assert.equal(late.dtSlip1_adj, 5);
});

t('Suffix 109: coord days credit lateness after DT delivery too', () => {
  const r = { dtStart1PlanInput:'2026-03-24', dtStart1Act:'2026-03-24', del1Act:'2026-04-28', sub1ActDate:'2026-06-08', s4Date:'2026-06-16' };
  const a = calcRow(r, { approvalDays: 14 }, { today });
  const b = calcRow({ ...r, coordS4Days: 30 }, { approvalDays: 14 }, { today });
  assert.equal(b.dtSlip1_adj, a.dtSlip1_adj - 30);
  assert.equal(iso(b.prodDateAdj), iso(a.prodDateAdj));             // timeline locked by actuals
  assert.equal(b.totalSlip1, a.totalSlip1);
});

t('Suffix 111: lateness in the client review is credited after the DT stage', () => {
  const r = { dtStart1PlanInput:'2026-02-09', dtStart1Act:'2026-02-10', del1Act:'2026-02-13', sub1ActDate:'2026-02-13', s4Date:'2026-03-31' };
  const a = calcRow(r, { approvalDays: 14 }, { today });
  const b = calcRow({ ...r, coordS4Days: 30 }, { approvalDays: 14 }, { today });
  assert.ok(a.approvalSlip1_adj > 0);
  assert.equal(b.dtSlip1_adj, a.dtSlip1_adj);                        // DT was early — nothing to credit
  assert.equal(b.approvalSlip1_adj, 0);                              // review lateness explained
});

t('holds are not counted as DT slip', () => {
  const c = calcRow({ dateOfInstruction: '2026-10-05',
    holds: [{ start: '2026-10-23', end: '2026-11-02', addedDays: 3 }] }, proj, { today });
  assert.equal(c.dtSlip1_adj, 0);
  assert.equal(c.totalSlip1, 3);                              // hold squeezed out, +3 added days remain
});

t('NCA uses C01 coordination only', () => {
  const a = calcRow({ dateOfInstruction: '2026-10-05', noClientApproval: true }, proj, { today });
  const b = calcRow({ dateOfInstruction: '2026-10-05', noClientApproval: true, coordS4Days: 9, coordC01Days: 2 }, proj, { today });
  assert.equal(wdBetween(a.prodDateAdj, b.prodDateAdj), 2);
  assert.equal(iso(a.prodDateP), iso(b.prodDateP));
});

t('stage complete only when all assigned drawings reach it', () => {
  const st = emptyStages();
  st.s4Sub = { n: 3, done: 3, first: '2026-04-08', last: '2026-05-20', an: 4, afirst: '2026-04-08', alast: '2026-09-30' };
  st.s4Date = { n: 3, done: 1, first: '2026-04-23', last: '2026-04-23', an: 1, afirst: '2026-04-23', alast: '2026-04-23' };
  st.c01Sub = { n: 0, done: 0, first: null, last: null, an: 1, afirst: '2026-07-28', alast: '2026-07-28' };
  const r = resolveStages(st);
  assert.equal(r.fields.sub1ActDate, '2026-05-20');        // last of the assigned set
  assert.equal(r.fields.s4Date, null);                     // 1 of 3 approved → open
  assert.deepEqual(r.open, ['s4Date', 'sub2ActDate', 's5Date', 'c01SignOffActDate'].filter(k => r.open.includes(k)));
  assert.ok(r.open.includes('s4Date'));
  assert.equal(r.fields.subCActDate, '2026-07-28');        // nothing assigned → fallback
  const m = mergeStages({ s4Sub: { n: 1, done: 1, first: '2026-04-10', last: '2026-04-10', an: 1 } }, { s4Sub: { n: 2, done: 1, first: '2026-04-08', last: '2026-04-08', an: 1 } });
  assert.equal(m.s4Sub.n, 3); assert.equal(m.s4Sub.done, 2); assert.equal(m.s4Sub.first, '2026-04-08');
});

t('an open stage is forecast no earlier than today', () => {
  const r = { dtStart1PlanInput: '2026-03-04', dtStart1Act: '2026-03-04', dd1: 10, sub1ActDate: null, mdsOpen: ['sub1ActDate', 's4Date'] };
  const c = calcRow(r, {}, { today: '2026-10-06' });
  assert.ok(c.sub1A >= new Date('2026-10-06'));             // not before today
  assert.ok(c.del1A >= new Date('2026-10-06') && c.del1A < c.sub1A);
  assert.ok(c.s4A > c.sub1A);
  assert.ok(c.flags.slipping);
  assert.ok(c.dtSlip1_adj > 100);                           // the item really is that far behind
});

t('in-progress stage: coord days = more days needed from today', () => {
  const r = { dtStart1PlanInput: '2026-03-04', dtStart1Act: '2026-03-04', dd1: 40, mdsOpen: ['sub1ActDate', 's4Date'] };
  const a = calcRow(r, {}, { today: '2026-10-06' });
  const b = calcRow({ ...r, coordS4Days: 20 }, {}, { today: '2026-10-06' });
  assert.equal(iso(a.sub1A), iso(addWD('2026-10-06', 1)));         // overdue: DT today, QA at its floor
  assert.equal(iso(b.sub1A), iso(addWD('2026-10-06', 20)));        // coordination is never squeezed
  assert.equal(wdBetween(a.prodDateAdj, b.prodDateAdj), 19);
  assert.equal(iso(b.prodDateP), iso(a.prodDateP));                    // plan unchanged
  assert.ok(b.dtSlip1_adj <= a.dtSlip1_adj);                          // coord is credited, not DT
});

t('in-progress but not overdue: coord days still push from the forecast', () => {
  const r = { dateOfInstruction: '2026-10-05', mdsOpen: ['sub1ActDate', 's4Date'] };
  const a = calcRow(r, {}, { today: '2026-10-06' });
  const b = calcRow({ ...r, coordS4Days: 10 }, {}, { today: '2026-10-06' });
  assert.equal(wdBetween(a.sub1A, b.sub1A), 10);
});

t('in-progress approval (submission complete): coord days add from today', () => {
  const r = { dtStart1PlanInput: '2026-03-04', dtStart1Act: '2026-03-04', sub1ActDate: '2026-04-20', mdsOpen: ['s4Date'] };
  const b = calcRow({ ...r, coordS4Days: 5 }, {}, { today: '2026-10-06' });
  assert.equal(iso(b.sub1A), '2026-04-20');
  assert.equal(iso(b.s4A), iso(addWD('2026-10-06', 5)));
});

t('acceleration: shorter S5 review / revision pulls Adjusted in, Plan unchanged', () => {
  const r = { dateOfInstruction: '2026-10-05' };
  const a = calcRow(r, {}, { today });
  const b = calcRow({ ...r, accRevisionDays: 0, accS5ReviewDays: 2 }, {}, { today });
  assert.equal(iso(b.prodDateP), iso(a.prodDateP));                 // plan is the baseline
  assert.equal(b.accelDays, 15);                                    // 7 + (10-2)
  assert.equal(wdBetween(b.prodDateAdj, a.prodDateAdj), 15);
  assert.equal(iso(b.del2A), iso(addWD(b.s4A, 3)));                 // revision removed (mobilisation stays)
  assert.equal(b.totalSlip2, -15);                                  // variance shows the gain
  assert.equal(b.dtSlip2_adj, 0); assert.equal(b.approvalSlip2_adj, 0);  // not reported as slip
  assert.equal(b.prodSlip_adj, -15);
});

t('acceleration: blank = normal, 0 removes, NCA ignores S4/S5 fields', () => {
  const r = { dateOfInstruction: '2026-10-05' };
  const a = calcRow(r, {}, { today });
  assert.equal(calcRow({ ...r, accQaDays: '' }, {}, { today }).accelDays, 0);
  const b = calcRow({ ...r, accProdPackDays: 0 }, {}, { today });
  assert.equal(iso(b.prodDateAdj), iso(a.c01SignOffAdj));
  const n = calcRow({ ...r, noClientApproval: true, accS5ReviewDays: 0 }, {}, { today });
  assert.equal(n.accelDays, 0);
});

t('acceleration: completed stage on plan is not reported as slip', () => {
  const r = { dtStart1PlanInput: '2026-06-01', dtStart1Act: '2026-06-01', sub1ActDate: '2026-06-18', s4Date: '2026-07-02' };
  const c = calcRow({ ...r, accS4ReviewDays: 0 }, {}, { today });
  assert.equal(c.approvalSlip1_adj, 0);
});

// ── Reissues / programme-driven (24-367 EIT Observation Hall acceptance) ──
const today2 = '2026-10-22';
const s002 = { programmeDriven: true, dtStart1PlanInput: '2025-09-22', dtStart1Act: '2025-09-22', del1Act: '2025-12-19',
  sub1ActDate: '2025-12-03', s4Date: '2025-12-17', del2Act: '2026-01-27', sub2ActDate: '2026-01-28', s5Date: '2026-02-11',
  subAdj1In: '2025-12-03', subAdj2In: '2026-11-06', subAdjCIn: '2026-11-27' };

t('Suffix 002: S5 reissue pending, A4.5 fixed, DT dates back-calculated', () => {
  const c = calcRow(s002, {}, { today: today2 });
  assert.equal(c.stages.s5.state, 'pending');
  assert.equal(iso(c.stages.s5.date), '2026-11-06');
  assert.equal(c.stages.c01.state, 'forecast'); assert.ok(c.stages.c01.locked);
  assert.equal(c.stages.s4.state, 'closed');
  assert.equal(iso(c.sub2A), '2026-11-06');
  assert.equal(iso(c.del2A), '2026-11-03');                     // − QA 3
  assert.equal(iso(c.st2A),  '2026-10-23');                     // − Revision Issue 7
  assert.equal(iso(c.subCA), '2026-11-27');
  // A4.5 DT Start = S5 approval (06/11 + 10 = 20/11) + 3 mobilisation = 25/11. The
  // programme A4.5 (27/11) leaves 2 days for DT + QA → squeezed below the floor:
  // Programme conflict, the programme date doesn't move
  assert.equal(iso(c.s5A),   '2026-11-20');
  assert.equal(iso(c.stCA),  '2026-11-25');
  assert.equal(iso(c.delCA), '2026-11-25');
  assert.deepEqual(c.flags.squeezed, [{ stage: 'c01', used: 2, std: 6 }]);
  assert.ok(c.flags.programmeConflict && c.stages.c01.conflict > 0);
  assert.equal(c.orderViolations.length, 0);
  assert.equal(iso(c.c01SignOffAdj), iso(addWD('2026-11-27', 2)));
  assert.equal(iso(c.prodDateAdj), iso(addWD(addWD('2026-11-27', 2), 21)));
  assert.ok(c.anyPending);
});

t('Suffix 002: holds and hold days never move programme dates', () => {
  const c = calcRow({ ...s002, holdDaysManual: 15, holds: [{ start: '2026-10-26', end: '2026-11-20', addedDays: 5 }] }, {}, { today: today2 });
  assert.equal(iso(c.sub2A), '2026-11-06');
  assert.equal(iso(c.subCA), '2026-11-27');
  assert.ok(c.stages.s5.warnDays > 0 || c.stages.c01.warnDays > 0);  // flagged instead
});

t('Suffix 050: S5 Adj before the actual → Closed; A4.5 programme date kept', () => {
  const c = calcRow({ programmeDriven: true, dtStart1PlanInput: '2025-08-01', dtStart1Act: '2025-08-01',
    sub1ActDate: '2025-10-01', s4Date: '2025-10-20', sub2ActDate: '2025-12-15', s5Date: '2026-01-10',
    subAdj2In: '2025-12-08', subAdjCIn: '2026-11-06' }, {}, { today: today2 });
  assert.equal(c.stages.s5.state, 'closed');
  assert.equal(iso(c.stages.s5.date), '2025-12-15');
  assert.equal(iso(c.subCA), '2026-11-06');
  assert.ok(!c.anyPending);
});

t('Suffix 082: no S5 actual → Forecast at the programme date', () => {
  const c = calcRow({ programmeDriven: true, dtStart1PlanInput: '2026-06-01', dtStart1Act: '2026-06-01',
    sub1ActDate: '2026-07-01', s4Date: '2026-07-20', subAdj2In: '2026-10-30', subAdjCIn: '2026-12-11' }, {}, { today: today2 });
  assert.equal(c.stages.s5.state, 'forecast');
  assert.equal(iso(c.sub2A), '2026-10-30');
  assert.equal(iso(c.subCA), '2026-12-11');
});

t('non-programme pending S5 (reason set): C01 and production chain from the S5 Adj', () => {
  const base = { dtStart1PlanInput: '2025-09-22', dtStart1Act: '2025-09-22', sub1ActDate: '2025-12-03', s4Date: '2025-12-17',
    sub2ActDate: '2026-01-28', s5Date: '2026-02-11', subAdj2In: '2026-11-06' };
  const old = calcRow(base, {}, { today: today2 });                             // no reason → stale forecast
  assert.equal(old.stages.s5.state, 'closed');
  assert.equal(iso(old.sub2A), '2026-01-28');
  const c = calcRow({ ...base, reissueReason: 'Client Comments' }, {}, { today: today2 });
  assert.equal(c.stages.s5.state, 'pending');
  assert.equal(iso(c.sub2A), '2026-11-06');
  assert.equal(iso(c.s5A), iso(addWD('2026-11-06', 10)));                    // review forecast, old S5 status date ignored
  assert.equal(iso(c.stCA), iso(addWD(c.s5A, 3)));                          // DT mobilisation
  assert.equal(iso(c.subCA), iso(addWD(c.s5A, 3 + 3 + 3)));                  // + construction issue + QA
  assert.ok(c.prodDateAdj > c.subCA && c.prodDateAdj > new Date('2026-11-06'));
});

t('programme date earlier than achievable → variance warning', () => {
  const c = calcRow({ ...s002, subAdj2In: '2026-10-26' }, {}, { today: today2 });  // 2 WD away, needs 7 + 3
  assert.ok(c.stages.s5.warnDays >= 2);                                       // needs 3 (floor) + 1 QA from today
  assert.ok(c.flags.programmeConflict);
  assert.equal(iso(c.sub2A), '2026-10-26');                                    // still not moved
});

// ── Reissue cycles: status C, past back-calculation, manual DT dates ──
const s5Base = { dtStart1PlanInput: '2025-09-22', dtStart1Act: '2025-09-22', sub1ActDate: '2025-12-03', s4Date: '2025-12-17',
  dtStart2Act: '2026-01-05', del2Act: '2026-01-23', sub2ActDate: '2026-01-28', s5Date: '2026-02-11' };

t('S5 status C after the latest issue, no reissue date → required, forecast from today, later stages re-anchor', () => {
  const c = calcRow({ ...s5Base, s5Status: ['A', 'C'] }, {}, { today: today2 });
  assert.equal(c.stages.s5.state, 'required');
  assert.ok(c.stages.s5.statusC && c.anyPending);
  assert.equal(iso(c.st2A), today2);                                            // old DT actuals are a closed cycle
  assert.equal(iso(c.sub2A), iso(addWD(today2, 7 + 3)));
  assert.equal(iso(c.s5A), iso(addWD(c.sub2A, 10)));                           // old S5 status date set aside
  assert.ok(c.prodDateAdj > c.sub2A);
});

t('status C makes a later Adj a reissue without a reason; a C from an earlier cycle does not', () => {
  const c = calcRow({ ...s5Base, s5Status: 'C', subAdj2In: '2026-11-13' }, {}, { today: today2 });
  assert.equal(c.stages.s5.state, 'pending');
  assert.equal(iso(c.sub2A), '2026-11-13');
  const old = calcRow({ ...s5Base, s5Date: '2026-01-20', s5Status: 'C', subAdj2In: '2026-11-13' }, {}, { today: today2 });
  assert.equal(old.stages.s5.state, 'closed');                                  // C given before the latest issue
  assert.equal(iso(old.sub2A), '2026-01-28');
  const s4locked = calcRow({ ...s5Base, s4Status: 'C', s5Status: 'C', subAdj2In: '2026-11-13' }, {}, { today: today2 });
  assert.equal(s4locked.stages.s4.state, 'closed');                             // S5 issued since → S4 C is answered
});

t('DT actual dated after the latest issue belongs to the current cycle and locks', () => {
  const c = calcRow({ ...s5Base, reissueReason: 'Client Comments', subAdj2In: '2026-11-13', dtStart2Act: '2026-10-19' }, {}, { today: today2 });
  assert.equal(iso(c.st2A), '2026-10-19');
  assert.ok(c.stages.s5.dt.startLocked);
  assert.equal(iso(c.del2A), iso(addWD('2026-11-13', -3)));
});

t('automated DT Start = previous approval + 3 WD mobilisation, programme-driven items too', () => {
  // 090-style: S5 approved 24/03, A4.5 on the programme at 20/01/27
  const r = { programmeDriven: true, dtStart1PlanInput: '2026-01-07', dtStart1Act: '2026-01-07', sub1ActDate: '2026-01-23',
    s4Date: '2026-02-13', sub2ActDate: '2026-03-03', s5Date: '2026-03-24', subAdj2In: '2026-03-03', subAdjCIn: '2027-01-20' };
  const c = calcRow(r, {}, { today: '2026-11-13' });
  assert.equal(iso(c.stCA), iso(addWD('2026-03-24', 3)));                     // not back-calculated from the programme date
  assert.equal(iso(c.delCA), '2027-01-15');                                   // delivery still = programme − QA
  assert.equal(iso(c.st2A), iso(addWD('2026-02-13', 3)));
  // project override
  const p = calcRow(r, { mobilisationDays: 5 }, { today: '2026-11-13' });
  assert.equal(iso(p.stCA), iso(addWD('2026-03-24', 5)));
  // a reissue keeps its back-calculated start (the trigger isn't the approval)
  const q = calcRow(s002, {}, { today: today2 });
  assert.equal(iso(q.st2A), '2026-10-23');
});

t('DT Start set by hand: any date (past included), kept by the sync, treated as recorded', () => {
  const r = { ...s002, subAdj2In: '2026-10-28' };
  const c = calcRow(r, {}, { today: today2 });
  assert.ok(c.stages.s5.dt.canStart && !c.stages.s5.dt.startManual);
  const m = { ...r, st2AdjIn: '2026-09-01', manualDtStart: ['S5'] };          // logged here only, in the past
  const cm = calcRow(m, {}, { today: today2 });
  assert.equal(iso(cm.st2A), '2026-09-01');
  assert.ok(cm.stages.s5.dt.startManual && cm.isAct.st2);
  assert.equal(iso(cm.sub2A), '2026-10-28');                                   // the client date never moves
  assert.ok(!('2nd DT Start (Adj)' in adjPatch(m, cm).fields));                // sync leaves it alone
  // before the S4 approval it's a data note, not a block
  const early = calcRow({ ...m, st2AdjIn: '2025-12-10' }, {}, { today: today2 });
  assert.equal(early.orderViolations.length, 0);
  // non-programme items too
  const np = calcRow({ ...s5Base, stCAdjIn: '2026-03-02', manualDtStart: ['A4.5/PRD'] }, {}, { today: today2 });
  assert.equal(iso(np.stCA), '2026-03-02');
  // a real DT Start actual wins
  const act = calcRow({ ...m, dtStart2Act: '2026-10-01' }, {}, { today: today2 });
  assert.equal(iso(act.st2A), '2026-10-01');
  assert.ok(!act.stages.s5.dt.canStart);
});

t('a stored DT Start without the manual marker is tool output', () => {
  const c = calcRow({ ...s002, st2AdjIn: '2026-10-30' }, {}, { today: today2 });
  assert.equal(iso(c.st2A), '2026-10-23');
  assert.ok(!c.stages.s5.dt.startManual);
});

// ── §5 snap Adj to Actual ──
t('snap: first sync records the Actuals as the baseline and snaps nothing', () => {
  const row = { pageId: 'p031', programmeDriven: true, sub1ActDate: '2026-01-15', subAdj1In: '2026-01-22', subPlan1In: '2026-01-22',
    sub2ActDate: '2026-02-10', subAdj2In: '2026-11-06' };
  const { rows: [r], patches, cache } = snapStages([row], {});
  assert.equal(patches.length, 0);
  assert.equal(r, row);
  assert.deepEqual(cache.p031, { s4: '2026-01-15', s5: '2026-02-10', c01: null });
});

t('Suffix 031: S4 Actual lands (changed since last sync) before the Adj → Adj = Actual, S4 Closed', () => {
  const row = { pageId: 'p031', programmeDriven: true, sub1ActDate: '2026-01-15', subAdj1In: '2026-01-22',
    sub2ActDate: null, subAdj2In: '2026-11-06' };
  const { rows: [r], patches, cache } = snapStages([row], { p031: { s4: null, s5: null, c01: null } });
  assert.equal(r.subAdj1In, '2026-01-15');
  assert.deepEqual(patches[0].fields, { '1st Submission Date (Adj)': '2026-01-15' });
  assert.equal(cache.p031.s4, '2026-01-15');
  const c = calcRow(r, {}, { today: today2 });
  assert.equal(c.stages.s4.state, 'closed');
});

t('snap: programme-driven later Adj is never snapped while the Actual is unchanged', () => {
  const row = { pageId: 'p1', programmeDriven: true, sub2ActDate: '2026-01-28', subAdj2In: '2026-11-06' };
  const keep = snapStages([row], { p1: { s4: null, s5: '2026-01-28', c01: null } });
  assert.equal(keep.patches.length, 0); assert.equal(keep.rows[0].subAdj2In, '2026-11-06');
});

t('snap: a reissue issued early (Actual changed) closes and clears the reason', () => {
  const row = { pageId: 'p1', programmeDriven: true, sub2ActDate: '2026-11-03', subAdj2In: '2026-11-06', reissueReason: 'Client Comments' };
  const s = snapStages([row], { p1: { s4: null, s5: '2026-01-28', c01: null } });
  assert.equal(s.rows[0].subAdj2In, '2026-11-03');
  assert.equal(s.rows[0].reissueReason, null);
  assert.deepEqual(s.patches[0].selects, { 'Reissue Reason': null });
});

// ── Gantt export bars ──
const bar = (g, label) => g.bars.find(b => b.label === label);
t('gantt: client review bars from actuals, else Adj; production milestone', () => {
  const row = { dtStart1PlanInput: '2026-06-01', dtStart1Act: '2026-06-01', sub1ActDate: '2026-06-18', s4Date: '2026-07-02' };
  const c = calcRow(row, {}, { today });
  const g = ganttBars(row, c);
  assert.deepEqual(g.bars.map(b => b.label), ['S4', 'S5', 'A4.5']);
  const s4 = bar(g, 'S4');
  assert.equal(iso(s4.sub.date), '2026-06-18'); assert.ok(s4.sub.actual);
  assert.equal(iso(s4.appr.date), '2026-07-02'); assert.ok(s4.appr.actual);
  const s5 = bar(g, 'S5');
  assert.equal(iso(s5.sub.date), iso(c.sub2A)); assert.ok(!s5.sub.actual);
  assert.equal(iso(s5.appr.date), iso(c.s5A));
  assert.equal(iso(bar(g, 'A4.5').appr.date), iso(c.c01SignOffAdj));
  assert.equal(iso(g.prod), iso(c.prodDateAdj));
});

t('gantt: No Client Approval → PRD submission only, no S4/S5', () => {
  const row = { noClientApproval: true, dateOfInstruction: '2026-10-05' };
  const g = ganttBars(row, calcRow(row, {}, { today }));
  assert.deepEqual(g.bars.map(b => b.label), ['PRD']);
  assert.equal(g.bars[0].appr, null);
  assert.equal(g.cols.c01.appr, null);
});

t('gantt: reissue pending shows the closed actual cycle and the forecast reissue', () => {
  const g = ganttBars(s002, calcRow(s002, {}, { today: today2 }));
  const old = g.bars.find(b => b.key === 's5' && b.cycle === 'closed');
  assert.equal(iso(old.sub.date), '2026-01-28'); assert.equal(iso(old.appr.date), '2026-02-11');
  assert.ok(old.sub.actual && old.appr.actual);
  const re = bar(g, 'S5 reissue');
  assert.equal(iso(re.sub.date), '2026-11-06'); assert.ok(!re.sub.actual && !re.appr.actual);
  assert.equal(iso(g.cols.s5.sub.date), '2026-11-06');
});

t('gantt: a stage with no date is skipped', () => {
  const g = ganttBars({}, calcRow({}, {}, { today }));
  assert.equal(g.bars.length, 0); assert.equal(g.prod, null);
});

t('no anchor and no actual → nothing calculated', () => {
  const c = calcRow({}, proj, { today });
  assert.equal(c.prodDateP, null); assert.equal(c.prodDateAdj, null);
});


// ── Nov 2026 brief: cycles, order, squeeze/slip, validation ──
t('§2 a later stage actual dated before the previous stage submission is a closed cycle', () => {
  // S5 DT Start recorded 05/03, but the S4 issue it follows went out on 11/03
  const r = { dtStart1PlanInput: '2026-01-27', dtStart1Act: '2026-01-30', del1Act: '2026-02-23', dtStart2Act: '2026-03-05',
    sub1ActDate: '2026-03-11', s4Date: '2026-03-24' };
  const c = calcRow(r, {}, { today: '2026-03-25' });
  assert.ok(c.st2A > c.sub1A && c.st2A >= c.s4A);
  assert.equal(c.orderViolations.length, 0);
});

t('§2 a stored Adj later than a later stage actual identifies a reissue; the later actual is superseded', () => {
  const r = { dtStart1PlanInput: '2026-02-09', dtStart1Act: '2026-02-10', sub1ActDate: '2026-02-13', s4Date: '2026-03-31',
    subCActDate: '2026-06-01', subAdj2In: '2026-11-20' };
  const c = calcRow(r, {}, { today: '2026-11-02' });
  assert.equal(iso(c.sub2A), '2026-11-20');
  assert.equal(c.stages.c01.state, 'superseded');
  assert.ok(c.subCA > c.sub2A);
  // without the later Adj, the A4.5 actual stands (S5 was simply skipped)
  const s = calcRow({ ...r, subAdj2In: null }, {}, { today: '2026-11-02' });
  assert.equal(iso(s.subCA), '2026-06-01');
});

t('§4 Accel … Days is the floor; a period never collapses to zero', () => {
  const r = { dateOfInstruction: '2026-10-05' };
  const hs = addWD('2026-10-19', 2), he = addWD(hs, 20);
  const c = calcRow({ ...r, accApprovalIssueDays: 8, holds: [{ start: iso(hs), end: iso(he) }] }, {}, { today });
  const sq = c.flags.squeezed.find(x => x.stage === 's4');
  assert.ok(sq.used >= 8 + 1, `used ${sq.used}`);           // DT at its Accel floor, QA ≥ 1
  assert.ok(wdBetween(c.del1A, c.sub1A) >= 1);
  assert.equal(resolveMinimums({ minQaDays: 2 }).qa, 2);
});

t('§4 programme-driven: dates never slip; a hit floor is a Programme conflict', () => {
  const r = { programmeDriven: true, dtStart1PlanInput: '2025-09-22', dtStart1Act: '2025-09-22', sub1ActDate: '2025-12-03',
    s4Date: '2025-12-17', subAdj2In: '2026-11-06', subAdjCIn: '2026-11-10' };
  const c = calcRow(r, {}, { today: '2026-10-22' });
  assert.equal(iso(c.subCA), '2026-11-10');                  // 2 WD after the S5 approval window opens — can't fit
  assert.ok(c.flags.programmeConflict && c.stages.c01.conflict > 0);
  assert.ok(!c.flags.slipping);
});

t('§3/§6 order check: violations block, inverted actuals are data issues', () => {
  const d = s => new Date(`${s}T12:00:00`);
  const bad = checkOrder({ sub1: d('2026-03-11'), st2: d('2026-03-05'), del2: d('2026-03-20'), sub2: d('2026-03-24') }, { sub1: true });
  assert.equal(bad.violations.length, 1);
  assert.match(bad.violations[0].text, /S4 submission .* must be before S5 DT Start/);
  const data = checkOrder({ sub1: d('2026-03-11'), st2: d('2026-03-05') }, { sub1: true, st2: true });
  assert.equal(data.violations.length, 0); assert.equal(data.dataIssues.length, 1);
});

t('§6 adjPatch: only differing Adj fields; blocked items write nothing', () => {
  const r = { dateOfInstruction: '2026-10-05' };
  const c = calcRow(r, {}, { today });
  const p = adjPatch(r, c);
  assert.equal(p.fields['1st Submission Date (Adj)'], iso(c.sub1A));
  const same = adjPatch({ ...r, subAdj1In: iso(c.sub1A) }, c);
  assert.ok(!('1st Submission Date (Adj)' in same.fields));
  const blocked = adjPatch(r, { ...c, orderViolations: [{ text: 'x' }] });
  assert.ok(blocked.blocked); assert.deepEqual(blocked.fields, {});
  assert.ok(Object.keys(p.fields).every(k => !isProtectedProp(k)));
});

t('§1 omitted items: no forecast dates, stored Adj cleared', () => {
  const r = { dateOfInstruction: '2026-10-05', status: 'Omitted', subAdj1In: '2026-11-05' };
  const c = calcRow(r, {}, { today });
  assert.ok(c.omitted); assert.equal(c.sub1A, null); assert.equal(c.prodDateAdj, null);
  assert.ok(c.prodDateP);                                    // Plan is untouched
  assert.equal(adjPatch(r, c).fields['1st Submission Date (Adj)'], null);
});

t('§5 snap also pulls DT Delivery (Adj) back before the snapped submission', () => {
  const row = { pageId: 'p9', sub2ActDate: '2026-03-24', subAdj2In: '2026-04-02', del2AdjIn: '2026-03-30' };
  const { patches } = snapStages([row], { p9: { s4: null, s5: null, c01: null } });
  assert.equal(patches[0].fields['2nd Submission Date (Adj)'], '2026-03-24');
  assert.equal(patches[0].fields['2nd DT Delivery (Adj)'], '2026-03-23');
});

t('drawing view: each drawing\'s position; split items flag the drawings behind', () => {
  const D = (no, o) => ({ id: no, no, assigned: 'Drawing', ...o });
  const row = { drawings: [
    D('EIT-010-02', { s4Sub: '2026-01-23', s4St: 'A', s4Date: '2026-01-27', s5Sub: '2026-10-07', s5St: 'B', s5Date: '2026-10-19' }),
    D('EIT-010-10', {}),
    D('EIT-010-03', { s4Sub: '2026-01-23', s4St: 'A', s4Date: '2026-01-27', s5Sub: '2026-10-07', s5St: 'NA', s5Date: '2026-10-29' }),
    { id: 'm', no: 'EIT-010-M1', assigned: 'Model' },
  ] };
  const bd = drawingBreakdown(row);
  assert.ok(bd.split); assert.equal(bd.counted, 3);
  assert.deepEqual(bd.dwgs.map(d => d.no), ['EIT-010-02', 'EIT-010-03', 'EIT-010-10', 'EIT-010-M1']);   // numeric order, uncounted last
  assert.equal(bd.dwgs[0].pos.label, 'S5 status'); assert.equal(bd.dwgs[0].pos.status, 'B');
  assert.equal(bd.dwgs[1].pos.label, 'S5 status'); assert.equal(bd.dwgs[1].pos.status, 'NA');
  assert.equal(bd.dwgs[2].pos.label, 'Not issued'); assert.ok(bd.dwgs[2].behind);
  assert.ok(!bd.dwgs[3].counted && !bd.dwgs[3].behind);
  assert.equal(drawingPosition({ cSub: '2026-06-01' }, true).label, 'PRD issued');
  assert.ok(!drawingBreakdown({ drawings: [D('a', { s4Sub: '2026-01-01' }), D('b', { s4Sub: '2026-01-02' })] }).split);
});

console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
