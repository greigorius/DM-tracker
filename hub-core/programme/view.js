// What the Programme page shows for one item: per-stage dates and their kind
// (recorded actual, client programme date, forecast), flags, and where the item
// sits on the Review tab. Pure: built from the engine's row + calcRow result.

import { toISO, drawingBreakdown, ISSUE_STAGES, stageLabel, wdBetween, MANUAL_DT_START_OPTS } from './schedule.js';

const iso = d => (d ? toISO(d) : null);

// calcRow keys per stage: DT start, DT delivery, submission, approval (+ isAct step keys)
export const STAGE_KEYS = {
  s4: { start: 'dtStart1A', del: 'del1A', sub: 'sub1A', appr: 's4A', steps: ['dtStart1', 'del1', 'sub1', 's4'], status: 's4Status', name: 'Approval issue' },
  s5: { start: 'st2A', del: 'del2A', sub: 'sub2A', appr: 's5A', steps: ['st2', 'del2', 'sub2', 's5'], status: 's5Status', name: 'Revision issue' },
  c01: { start: 'stCA', del: 'delCA', sub: 'subCA', appr: 'c01SignOffAdj', steps: ['stC', 'delC', 'subC', 'c01'], status: null, name: 'Construction issue' },
};

export const GROUPS = [
  { key: 'fix', title: 'Fix now', hint: 'Not written to Notion until resolved', tone: 'danger' },
  { key: 'challenge', title: 'Challenge the programme', hint: 'Client dates that can’t be met', tone: 'danger' },
  { key: 'check', title: 'Check dates', hint: 'Squeezed, slipping or a date that needs setting', tone: 'accent' },
  { key: 'ok', title: 'On track', hint: '', tone: 'ok' },
  { key: 'idle', title: 'Not programmed', hint: 'Complete, omitted, or no anchor date yet', tone: 'muted' },
];

const CLOSED_STATUS = /^(complete|omitted|design complete|close out|pc approved)$/i;
const worst = gs => {
  const rank = { C: 4, Rejected: 4, B: 3, A: 2, Approved: 2, NA: 1 };
  return (gs || []).reduce((w, g) => (!w || (rank[g] || 0) > (rank[w] || 0) ? g : w), null);
};

function stageView(sd, row, c, today) {
  const k = STAGE_KEYS[sd.key];
  const st = c.stages?.[sd.key] || { state: 'na' };
  const label = stageLabel(sd, c.nca);
  if (st.state === 'na') return { key: sd.key, label, name: k.name, na: true, state: 'na' };
  const act = step => !!c.isAct?.[step];
  const kindOf = (step, isSub) => (act(step) ? 'act' : isSub && st.locked ? 'prog' : 'fc');
  const prog = row.mdsProgress?.[sd.subAct];
  const issued = prog && !prog.unassigned && prog.done > 0 && prog.done < prog.n ? { done: prog.done, n: prog.n } : null;
  const grade = worst(k.status ? row[k.status] : null);
  const sub = { date: iso(c[k.sub]), kind: kindOf(k.steps[2], true) };
  const appr = { date: iso(c[k.appr]), kind: kindOf(k.steps[3]) };
  const start = { date: iso(c[k.start]), kind: st.dt?.startManual ? 'manual' : kindOf(k.steps[0]) };
  const del = { date: iso(c[k.del]), kind: st.dt?.delManual ? 'manual' : kindOf(k.steps[1]) };

  let tag = 'Forecast', tone = 'muted';
  if (st.state === 'closed') {
    tag = appr.kind === 'act' ? `Issued · ${grade === 'Approved' ? 'approved' : grade || 'returned'}` : 'Issued · awaiting';
    tone = 'ok';
  } else if (st.state === 'required') { tag = 'Reissue needed'; tone = 'danger'; }
  else if (st.state === 'pending') { tag = 'Reissue'; tone = 'accent'; }
  else if (st.state === 'superseded') { tag = 'Superseded'; tone = 'accent'; }
  else if (st.locked) { tag = 'Programme'; tone = 'accent'; }
  if (st.state !== 'closed') {
    if (st.conflict > 0) { tag = 'Conflict'; tone = 'danger'; }
    else if (st.slip > 0) { tag = `Slipping +${st.slip}d`; tone = 'danger'; }
    else if (st.squeezed) { tag = `Squeezed ${st.squeezed.used}/${st.squeezed.std}d`; tone = 'accent'; }
  }

  const passed = st.state !== 'closed' && sub.kind !== 'act' && sub.date && sub.date < today;
  return {
    key: sd.key, label, name: k.name, na: false, state: st.state, tag, tone, grade, issued,
    start, del, sub, appr, passed,
    squeezed: st.squeezed, slip: st.slip, conflict: st.conflict, achievable: iso(st.achievable),
    closedSub: iso(st.closedSub), statusC: !!st.statusC,
    canStart: !!st.dt?.canStart && !!MANUAL_DT_START_OPTS[sd.key], startManual: !!st.dt?.startManual,
    past: st.dt?.past ? { key: st.dt.past.key, date: iso(st.dt.past.date), days: st.dt.past.days } : null,
  };
}

const short = s => s.label.replace(' / ', '/');

export function itemView({ row, c }, today) {
  const stages = ISSUE_STAGES.map(sd => stageView(sd, row, c, today));
  const live = stages.filter(s => !s.na);
  const bd = drawingBreakdown(row);
  const prod = { date: iso(c.prodDateAdj), target: iso(c.target), float: c.floatDays };
  const closed = CLOSED_STATUS.test(row.status || '') || c.omitted;
  const hasDates = live.some(s => s.sub.date) || !!prod.date;

  // Flags (chips)
  const flags = [];
  if (c.orderViolations?.length) flags.push({ text: 'Order check · not written', tone: 'danger' });
  if (c.orderDataIssues?.length) flags.push({ text: 'Recorded dates out of order', tone: 'danger' });
  if (c.flags?.programmeConflict) flags.push({ text: 'Programme conflict', tone: 'danger' });
  if (c.flags?.slipping) flags.push({ text: `Slipping +${c.flags.slipDays}d`, tone: 'danger' });
  for (const q of c.flags?.squeezed || []) flags.push({ text: `${short(stages.find(s => s.key === q.stage))} squeezed ${q.used}/${q.std}d`, tone: 'accent' });
  for (const s of live) {
    if (s.state === 'required') flags.push({ text: `${short(s)} reissue needed`, tone: 'danger' });
    else if (s.passed) flags.push({ text: `${short(s)} date passed`, tone: 'danger' });
    if (s.past) flags.push({ text: `${short(s)} DT ${s.past.key === 'start' ? 'start' : 'delivery'} in the past`, tone: 'accent' });
  }
  if (c.onHold) flags.push({ text: `On hold ${c.openHoldDays}d`, tone: 'info' });
  if (bd.split) flags.push({ text: 'Split', tone: 'info' });

  // Review group, reason and what to do
  let group = 'ok', reason = 'On track', todo = 'Nothing to do. Dates are calculated and written to Notion on sync.';
  const passedProg = live.find(s => s.passed && s.sub.kind === 'prog');
  const conflictStage = live.find(s => s.conflict > 0);
  const required = live.find(s => s.state === 'required');
  const passed = live.find(s => s.passed);
  const pastDt = live.find(s => s.past);
  if (closed || !hasDates) {
    group = 'idle';
    reason = c.omitted ? 'Omitted · Adj dates cleared' : closed ? row.status : 'No Date of Instruction, 1st DT Start or Production target';
    todo = closed ? 'Nothing to programme.' : 'Set a Date of Instruction (or a 1st DT Start / Production target) in Notion so the item can be programmed.';
  } else if (c.orderViolations?.length) {
    group = 'fix';
    reason = 'Order check — Adj dates not written';
    const v = c.orderViolations[0];
    todo = `Dates aren’t written to Notion until this is resolved: ${v.text}.${bd.split ? ` Drawings are at different stages (${splitSummary(bd)}) — check they all belong to this item.` : ''}`;
  } else if (c.orderDataIssues?.length) {
    group = 'fix';
    reason = 'Recorded dates out of order';
    todo = `Two recorded dates disagree: ${c.orderDataIssues[0].text}. Correct the date in Notion (Master Drawing Schedule or the item's DT actuals).`;
  } else if (conflictStage || passedProg) {
    group = 'challenge';
    const s = conflictStage || passedProg;
    reason = conflictStage ? `${short(s)} programme date can’t be met` : `${short(s)} programme date passed`;
    todo = conflictStage
      ? `The client date for ${s.label} (${fmt(s.sub.date)}) leaves less than the minimum DT + QA time${s.achievable ? `; the earliest it can go is ${fmt(s.achievable)}` : ''}. Ask for a new programme date.`
      : `${s.label} was due ${fmt(s.sub.date)} and hasn’t been recorded. If it has gone, record it on the drawing schedule; if not, ask for a new programme date.`;
  } else if (required || passed || pastDt || c.flags?.slipping || c.flags?.squeezed?.length) {
    group = 'check';
    if (required) { reason = `${short(required)} status C — reissue needed`; todo = `${required.label} came back status C. Set a Reissue Reason or a reissue date; until then it is forecast from today.`; }
    else if (passed) { reason = `${short(passed)} forecast date passed`; todo = `${passed.label} was forecast for ${fmt(passed.sub.date)}. Record the issue if it has gone; the next sync moves the forecast on from today.`; }
    else if (pastDt) { reason = `${short(pastDt)} DT ${pastDt.past.key === 'start' ? 'start' : 'delivery'} is in the past`; todo = `The back-calculated DT ${pastDt.past.key === 'start' ? 'start' : 'delivery'} for ${pastDt.label} (${fmt(pastDt.past.date)}) has passed. If the DT started on another date, set it.`; }
    else if (c.flags.slipping) { reason = `Slipping +${c.flags.slipDays}d`; todo = `Squeezing our side wasn’t enough: the item is moving out by ${c.flags.slipDays} working day${c.flags.slipDays === 1 ? '' : 's'}. Production is now ${fmt(prod.date)}.`; }
    else { const q = c.flags.squeezed[0]; reason = `${short(stages.find(s => s.key === q.stage))} squeezed to ${q.used} of ${q.std} days`; todo = 'DT and QA time has been shortened to protect the submission date. Check the DT can deliver in the time left.'; }
  }

  // Next milestone still to happen
  const upcoming = [];
  for (const s of live) {
    if (s.sub.kind !== 'act' && s.sub.date) upcoming.push({ label: `${short(s)}`, date: s.sub.date });
    if (s.appr.kind !== 'act' && s.appr.date) upcoming.push({ label: `${short(s)} ${s.key === 'c01' ? 'sign-off' : 'approval'}`, date: s.appr.date });
  }
  if (prod.date) upcoming.push({ label: 'Production', date: prod.date });
  const next = upcoming.filter(u => u.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] || null;

  return {
    id: row.id, name: row.name, url: row.url, projectId: row.projectId, status: row.status,
    prog: !!row.programmeDriven, nca: !!c.nca, reissueReason: row.reissueReason || null,
    dwgFirst: row.mdsDwgFirst || null, dwgCount: row.mdsDwgCount || 0,
    stages, prod, flags, group, reason, todo, next, closed,
    drawings: bd, holds: c.holdLabels || [],
    violations: c.orderViolations || [], dataIssues: c.orderDataIssues || [],
  };
}

export function splitSummary(bd) {
  const counts = new Map();
  for (const d of bd.dwgs.filter(x => x.counted)) counts.set(d.pos.label, (counts.get(d.pos.label) || 0) + 1);
  return [...counts].map(([k, n]) => `${n} ${k.toLowerCase()}`).join(' · ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmt(isoDate, withYear = false) {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-');
  return `${d} ${MONTHS[Number(m) - 1]}${withYear ? ` ${y.slice(2)}` : ''}`;
}

export const workdaysFrom = (a, b) => wdBetween(a, b);
