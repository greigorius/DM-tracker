// First baseline for the Programme Dates DB (spec: claude/programme-baseline-spec.md §8 step 1).
// Pure: snapshots in, planned rows + review lists out. No I/O.
//
// One row per item × stage: S4 · S5 · A4.5 (PRD on No Client Approval items) · Production · Install.
// Baseline submission per issue stage:
//   Programme-driven item with a stored Adj date → Adj ('Client programme', on the review list)
//   else the locked Plan date → 'Calculated'
//   else the engine's calculated Plan → 'Calculated' (noted)
// DT Days: S4 (PRD on NCA) = Accel Approval Issue Days ?? Draw Days - DD1, blank = provisional 10 (unverified);
//          S5 = Accel Revision Issue Days, blank = project default; A4.5 = Accel Construction Issue Days ?? DD-C.

import { calcRow, resolveProjectPeriods, addWD, toDate, toISO } from './schedule.js';
import { engineRow, drawingsByItem, holdsByItem, engineProject } from './adapter.js';

export const PROVISIONAL_DT_DAYS = 10;
export const INSTALL_LEAD_WD = 30;          // 6 weeks
const LIVE_PROJECT = /^in progress$/i;
// Item statuses past drawing: no DT Days needed for the first issue
const PAST_DRAWING = /^(design complete|in production|on site|complete|pc approved|close out)$/i;

const iso = d => (d ? toISO(d) : null);
const wd = (date, n) => (date ? iso(addWD(toDate(date), n)) : null);
const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const first = (...xs) => xs.find(x => x !== null && x !== undefined) ?? null;
const dmy = s => `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(2, 4)}`;

function grade(statuses, stage) {
  if (stage === 'A4.5' || stage === 'PRD') return 'Signed off';
  const L = (statuses || []).map(x => String(x).trim().toUpperCase()[0]);
  return L.includes('C') ? 'C' : L.includes('B') ? 'B' : L.includes('A') ? 'A' : null;
}

export function buildSeed(snaps, { today }) {
  const ref = `Seed ${dmy(today)}`;
  const live = new Set((snaps.projects || []).filter(p => LIVE_PROJECT.test(p.status || '')).map(p => p.id));
  const projects = new Map((snaps.projects || []).map(p => [p.id, p]));
  const dwgMap = drawingsByItem(snaps.drawings);
  const holds = holdsByItem(snaps.variations, snaps.rfis);
  const rows = [], clientReview = [], dtVerify = [], notes = [], skipped = { notLive: 0, omitted: 0, archived: 0 };

  for (const t of snaps.tasks || []) {
    if (t.archived) { skipped.archived++; continue; }
    if (!live.has(t.projectId)) { skipped.notLive++; continue; }
    if (/^omitted$/i.test(t.status || '')) { skipped.omitted++; continue; }
    const project = projects.get(t.projectId);
    const proj = engineProject(project);
    const row = engineRow(t, dwgMap.get(t.id) || [], holds[t.id] || []);
    const c = calcRow(row, proj, { today });
    const P = resolveProjectPeriods(proj).values;
    const s = t.sched || {};
    const nca = !!s.noClientApproval;
    const prog = !!t.programmeDriven;
    // S5 bypassed (no aesthetic review): every counted drawing has S5 Status NA
    const counted = (dwgMap.get(t.id) || []).filter(d => d.type === 'Drawing');
    const s5Bypassed = counted.length > 0 && counted.every(d => d.s5?.status === 'NA');
    const base = { itemId: t.id, item: t.title, project: project?.title || null, projectId: t.projectId };

    const issue = (stage, cfg) => {
      const planSub = cfg.plan, adjSub = cfg.adj, calcSub = iso(c[cfg.calc]);
      let sub = null, source = null, note = null;
      // An Adj equal to the actual issue was overwritten by the old sync: not a client date (DM decision 19 Nov)
      const adjIsActual = adjSub && cfg.actSub && adjSub === cfg.actSub && planSub;
      if (prog && adjSub && !adjIsActual) { sub = adjSub; source = 'Client programme'; }
      else if (prog && adjIsActual) { sub = planSub; source = 'Calculated'; note = 'Adj equalled the actual issue: old Plan used'; }
      else if (planSub) { sub = planSub; source = 'Calculated'; }
      else if (calcSub) { sub = calcSub; source = 'Calculated'; note = 'No Plan stored: engine plan used'; }
      const dtDays = cfg.dtDays;
      const unverified = cfg.required && dtDays === null && !PAST_DRAWING.test(t.status || '');
      const blDt = first(dtDays, cfg.required ? PROVISIONAL_DT_DAYS : cfg.defaultDt);
      const del = sub ? wd(sub, -P.qa) : null;
      let actSub = cfg.actSub || null, actAppr = cfg.actAppr || null;
      if (actSub && actAppr && actAppr < actSub) { notes.push({ ...base, stage, issue: `Approval ${actAppr} before submission ${actSub}: approval dropped` }); actAppr = null; }
      const r = {
        ...base, stage, ref, source, current: true, issued: today,
        blSub: sub, blAppr: sub ? wd(sub, cfg.review) : null, blDtDays: blDt,
        blDtDel: del, blDtStart: del ? wd(del, -blDt) : null,
        dtDays, unverified,
        actDtStart: first(cfg.actStart, cfg.manualStart), actDtDel: cfg.actDel || null,
        manualStart: !!cfg.manualStart && !cfg.actStart,
        actSub, actAppr, grade: actAppr ? grade(cfg.statuses, stage) : null,
        coord: num(cfg.coord), accReview: num(cfg.accReview), accQa: num(s.accQaDays), notRequired: !!cfg.notRequired,
        reissue: cfg.reissue || null, note,
      };
      rows.push(r);
      if (source === 'Client programme' || (prog && note)) clientReview.push({ ...base, stage, proposed: sub, plan: planSub, actual: actSub,
        flag: actSub && sub < actSub ? 'Proposed baseline is before the actual issue' : sub < today && !actSub ? 'In the past, not issued' : '' });
      if (unverified && !actSub) dtVerify.push({ ...base, stage, dd1: s.dd1 ?? null, projDefault: P.approvalIssue });
      return r;
    };

    const pending = Object.entries(c.stages || {}).find(([, v]) => ['pending', 'required'].includes(v.state))?.[0];
    const reissueOn = k => (pending === k ? t.reissueReason : null);
    // Production Pack length: DT Days on the Production row (blank = project default)
    const prodDays = num(s.accProdPackDays);

    if (!nca) {
      issue('S4', { plan: t.prog?.s4Plan, adj: t.prog?.s4Adj, calc: 'sub1P', required: true,
        dtDays: num(first(s.accApprovalIssueDays, s.dd1)), review: P.clientReview,
        actStart: s.dtStart1Act, actDel: s.del1Act, actSub: row.sub1ActDate, actAppr: row.s4Date, statuses: row.s4Status,
        coord: s.coordS4Days, accReview: s.accS4ReviewDays, reissue: reissueOn('s4') });
      issue('S5', { plan: t.prog?.s5Plan, adj: t.prog?.s5Adj, calc: 'sub2P', required: false, defaultDt: P.revisionIssue, notRequired: s5Bypassed,
        dtDays: num(s.accRevisionDays), review: P.clientReview,
        actStart: s.dtStart2Act, actDel: s.del2Act, manualStart: (s.manualDtStart || []).includes('S5') ? s.st2AdjIn : null,
        actSub: row.sub2ActDate, actAppr: row.s5Date, statuses: row.s5Status,
        coord: s.coordS5Days, accReview: s.accS5ReviewDays, reissue: reissueOn('s5') });
    }
    const cStage = nca ? 'PRD' : 'A4.5';
    issue(cStage, { plan: t.prog?.conPlan, adj: t.prog?.conAdj, calc: 'subCP', required: nca, defaultDt: P.constrIssue,
      dtDays: num(first(s.accConstrIssueDays, s.constrDrawDays)), review: P.c01SignOff,
      actStart: s.stCActDate, actDel: s.delCAct, manualStart: (s.manualDtStart || []).includes('A4.5/PRD') ? s.stCAdjIn : null,
      actSub: row.subCActDate, actAppr: row.c01SignOffActDate, statuses: null,
      coord: s.coordC01Days, accReview: s.accC01SignOffDays, reissue: reissueOn('c01') });

    // Production / Install: one date each (Submission column)
    const prodBl = first(s.prodDate, iso(c.prodDateP));
    rows.push({ ...base, stage: 'Production', ref, current: true, issued: today,
      source: s.prodDate ? (prog ? 'Client programme' : 'Calculated') : prodBl ? 'Calculated' : null,
      blSub: prodBl, actSub: t.dt?.productionAct || null, dtDays: prodDays, blDtDays: first(prodDays, P.productionPack),
      note: s.prodDate ? 'Production Date (Plan) as entered' : prodBl ? 'Engine plan' : null });
    const instBl = first(s.installDate, prodBl ? wd(prodBl, INSTALL_LEAD_WD) : null);
    rows.push({ ...base, stage: 'Install', ref, current: true, issued: today,
      source: s.installDate ? (prog ? 'Client programme' : 'Calculated') : instBl ? 'Calculated' : null,
      blSub: instBl, actSub: t.dt?.installAct || null,
      note: s.installDate ? 'Install Date (Plan) as entered' : instBl ? 'Production + 6 weeks' : null });
  }

  // Drawing-schedule stage dates from a closed cycle (spec §8 step 2)
  const staleMds = [];
  const liveItems = new Set(rows.map(r => r.itemId));
  for (const d of snaps.drawings || []) {
    if (d.archived || !(d.itemIds || []).some(id => liveItems.has(id))) continue;
    const out = [];
    const s4 = d.s4 || {}, s5 = d.s5 || {}, cc = d.c01 || {};
    if (s5.submitted && s4.submitted && s5.submitted < s4.submitted) out.push(`S5 issued ${s5.submitted} before S4 issued ${s4.submitted}`);
    if (cc.submitted && s5.submitted && cc.submitted < s5.submitted && s5.status !== 'NA') out.push(`A4.5 issued ${cc.submitted} before S5 issued ${s5.submitted}`);
    if (s4.statusDate && s4.submitted && s4.statusDate < s4.submitted) out.push(`S4 status ${s4.statusDate} before S4 issue ${s4.submitted}`);
    if (s5.statusDate && s5.submitted && s5.statusDate < s5.submitted) out.push(`S5 status ${s5.statusDate} before S5 issue ${s5.submitted}`);
    if (out.length) staleMds.push({ drawing: d.title, drawingId: d.id, url: d.url, issue: out.join('; '),
      s4: `${s4.submitted || ''} → ${s4.statusDate || ''} ${s4.status || ''}`.trim(), s5: `${s5.submitted || ''} → ${s5.statusDate || ''} ${s5.status || ''}`.trim() });
  }
  return { ref, rows, clientReview, dtVerify, staleMds, notes, skipped };
}

// Notion properties for one planned row (Programme Dates DB)
export function seedProps(r) {
  const date = v => ({ date: v ? { start: v } : null });
  const n = v => ({ number: v ?? null });
  const sel = v => ({ select: v ? { name: v } : null });
  const txt = v => ({ rich_text: v ? [{ text: { content: String(v) } }] : [] });
  return {
    Name: { title: [{ text: { content: `${r.item} · ${r.stage} · ${r.ref}` } }] },
    Item: { relation: [{ id: r.itemId }] },
    Stage: sel(r.stage), 'Baseline Ref': txt(r.ref), 'Baseline Source': sel(r.source),
    'Baseline Issued': date(r.issued), Current: { checkbox: true },
    'Baseline Submission': date(r.blSub), 'Baseline Approval': date(r.blAppr),
    'Baseline DT Days': n(r.blDtDays), 'Baseline DT Start': date(r.blDtStart), 'Baseline DT Delivery': date(r.blDtDel),
    'DT Days': n(r.dtDays), 'DT Days Unverified': { checkbox: !!r.unverified },
    'Actual DT Start': date(r.actDtStart), 'Actual DT Delivery': date(r.actDtDel), 'Manual DT Start': { checkbox: !!r.manualStart },
    'Actual Submission': date(r.actSub), 'Actual Approval': date(r.actAppr), 'Actual Grade': sel(r.grade),
    'Coord Days': n(r.coord), 'Accel Review Days': n(r.accReview), 'Accel QA Days': n(r.accQa),
    'Reissue Reason': sel(r.reissue), Note: txt(r.note), 'Not Required': { checkbox: !!r.notRequired },
  };
}
