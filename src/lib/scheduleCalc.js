/**
 * scheduleCalc.js — Item Date Matrix schedule engine.
 *
 * Ported from the Axiom scheduling tool. Pure module with no external deps.
 * All arithmetic is in UK working days (weekends + England & Wales public
 * holidays 2024–2028 excluded). All input dates are snapped forward to the
 * next workday via snapFwd(). Time is pinned to noon UTC to avoid BST/UTC
 * edge cases around midnight.
 *
 * Key export: calcRow(row, project) — returns an object of plan/adj Dates
 * plus signed workday slippage values (positive = late, negative = early).
 */

export const UK_HOLIDAYS = new Set([
  '2024-01-01','2024-03-29','2024-04-01','2024-05-06','2024-05-27','2024-08-26','2024-12-25','2024-12-26',
  '2025-01-01','2025-04-18','2025-04-21','2025-05-05','2025-05-26','2025-08-25','2025-12-25','2025-12-26',
  '2026-01-01','2026-04-03','2026-04-06','2026-05-04','2026-05-25','2026-08-31','2026-12-25','2026-12-28',
  '2027-01-01','2027-03-26','2027-03-29','2027-05-03','2027-05-31','2027-08-30','2027-12-27','2027-12-28',
  '2028-01-03','2028-04-14','2028-04-17','2028-05-07','2028-05-28','2028-08-27','2028-12-25','2028-12-26',
]);

export function isWorkday(d) {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  return !UK_HOLIDAYS.has(d.toISOString().slice(0, 10));
}

export function snapFwd(date) {
  const d = new Date(date); d.setHours(12, 0, 0, 0);
  while (!isWorkday(d)) d.setDate(d.getDate() + 1);
  return d;
}

export function addWD(start, n) {
  if (!start || n == null) return null;
  const d = new Date(start); d.setHours(12, 0, 0, 0);
  let rem = Math.abs(n); const dir = n >= 0 ? 1 : -1;
  while (rem > 0) { d.setDate(d.getDate() + dir); if (isWorkday(d)) rem--; }
  return d;
}

export function wdBetween(a, b) {
  if (!a || !b) return 0;
  const da = new Date(a); da.setHours(12, 0, 0, 0);
  const db = new Date(b); db.setHours(12, 0, 0, 0);
  const [lo, hi] = [Math.min(da, db), Math.max(da, db)];
  const sign = db > da ? 1 : -1;
  let c = 0; const cur = new Date(lo);
  while (cur < hi) { cur.setDate(cur.getDate() + 1); if (isWorkday(cur)) c++; }
  return c * sign;
}

export function toISO(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return null;
  return dt.toISOString().slice(0, 10);
}

export function fmtShort(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return null;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

// ─────────────────────────────────────────────────────────────────────────────
// calcRow(row, project) — full schedule computation. Row is the per-item input,
// project is the per-project config. Returns a keyed object of plan/adj Dates
// plus signed workday slippage values.
// ─────────────────────────────────────────────────────────────────────────────
export function calcRow(r, project) {
  const nca = !!r?.noClientApproval;
  const approvalDays   = nca ? 0 : (project?.approvalDays ?? 0);
  const revisionDays   = nca ? 0 : (project?.revisionDays ?? 0);
  const effDD1         = nca ? 0 : (r?.dd1 ?? 0);
  const effQA1         = nca ? 0 : (r?.qa1 ?? project?.qaDefault ?? 0);
  const effQA2         = nca ? 0 : (r?.qa2 ?? project?.qaDefault ?? 0);
  const effQaC         = r?.qaC ?? project?.qaDefault ?? 0;
  const constrDrawDays = r?.constrDrawDays ?? 15;

  if (!r?.dtStart1Plan) return {};

  const start1 = snapFwd(new Date(r.dtStart1Plan));

  if (nca) {
    const stCP  = snapFwd(new Date(r.dtStart1Plan));
    const stCA  = snapFwd(new Date(r.dtStart1Plan));
    const delCP = addWD(stCP, constrDrawDays);
    const subCP = addWD(delCP, effQaC);
    const delCA = addWD(stCA, constrDrawDays);
    const delCActSnap = r.delCActDate ? snapFwd(new Date(r.delCActDate)) : null;
    const subCActSnap = r.subCActDate ? snapFwd(new Date(r.subCActDate)) : null;
    const subCA       = subCActSnap ?? addWD(delCActSnap ?? delCA, effQaC);
    const c01SignOffPlan    = addWD(subCP, 2);
    const c01SignOffAdj     = addWD(subCA, 2);
    const dtSlipC           = (subCP && subCActSnap) ? wdBetween(subCP, subCActSnap) : null;
    const c01SignOffActSnap = r.c01SignOffActDate ? snapFwd(new Date(r.c01SignOffActDate)) : null;
    const approvalSlipC     = (c01SignOffPlan && c01SignOffActSnap)
      ? wdBetween(c01SignOffPlan, c01SignOffActSnap) : null;
    const prodDateP   = addWD(c01SignOffPlan,                     project?.productionPrepPeriod ?? 0);
    const prodDateAdj = addWD(c01SignOffActSnap ?? c01SignOffAdj, project?.productionPrepPeriod ?? 0);
    const instDate    = r.productionTime ? addWD(prodDateAdj, r.productionTime) : null;
    return {
      nca: true,
      del1P: null, sub1P: null, del1A: null, del1ActSnap: null, sub1A: null, sub1Act: null,
      s4ApprovalPlan: null, dtSlip1: null, approvalSlip1: null,
      st2P: null, st2A: null, del2P: null, del2A: null, del2ActSnap: null,
      sub2P: null, sub2A: null, sub2Act: null, s5ApprovalPlan: null, dtSlip2: null, approvalSlip2: null,
      stCP, stCA, delCP, delCA, delCActSnap, subCP, subCA, subCActSnap,
      c01SignOffPlan, c01SignOffAdj, dtSlipC, approvalSlipC,
      prodDateP, prodDateAdj, instDate,
    };
  }

  // ── 1st Issue (Plan) ─────────────────────────────────────────────────────────
  const del1P   = addWD(start1, effDD1);
  const sub1P   = addWD(del1P,  effQA1);
  const sub1Act = r.sub1ActDate ? snapFwd(new Date(r.sub1ActDate)) : null;

  // ── 1st Issue (Adj) — actuals supersede adjusted values ──────────────────────
  const start1A     = r.dtStart1Act ? snapFwd(new Date(r.dtStart1Act)) : start1;
  const del1A       = addWD(start1A, effDD1);
  const del1ActSnap = r.del1ActDate ? snapFwd(new Date(r.del1ActDate)) : null;
  const sub1A       = sub1Act ?? addWD(del1ActSnap ?? del1A, effQA1);

  const s4ApprovalPlan = addWD(sub1Act ?? sub1P, approvalDays);
  const dtSlip1        = (sub1P && sub1Act) ? wdBetween(sub1P, sub1Act) : null;
  const approvalSlip1  = (s4ApprovalPlan && r.s4Date)
    ? wdBetween(s4ApprovalPlan, snapFwd(new Date(r.s4Date))) : null;

  // ── 2nd Issue (Plan) — always anchored on S4 Approval (Plan) ─────────────────
  const st2P    = s4ApprovalPlan;
  const del2P   = addWD(st2P, revisionDays);
  const sub2P   = addWD(del2P, effQA2);
  const sub2Act = r.sub2ActDate ? snapFwd(new Date(r.sub2ActDate)) : null;

  const s5ApprovalPlan = addWD(sub2Act ?? sub2P, approvalDays);
  const approvalSlip2  = (s5ApprovalPlan && r.s5Date)
    ? wdBetween(s5ApprovalPlan, snapFwd(new Date(r.s5Date))) : null;

  // ── 2nd Issue (Adj) ──────────────────────────────────────────────────────────
  const st2A        = r.dtStart2Act ? snapFwd(new Date(r.dtStart2Act)) : st2P;
  const del2A       = addWD(st2A, revisionDays);
  const del2ActSnap = r.del2ActDate ? snapFwd(new Date(r.del2ActDate)) : null;
  const sub2A       = sub2Act ?? addWD(del2ActSnap ?? del2A, effQA2);
  const dtSlip2     = (sub2P && sub2Act) ? wdBetween(sub2P, sub2Act) : null;

  // ── Construction (Plan) — always anchored on S5 Approval (Plan) ──────────────
  const stCP           = s5ApprovalPlan;
  const delCP          = addWD(stCP, constrDrawDays);
  const subCP          = addWD(delCP, effQaC);
  const subCActSnap    = r.subCActDate ? snapFwd(new Date(r.subCActDate)) : null;
  const c01SignOffPlan = addWD(subCP, 2);
  const dtSlipC        = (subCP && subCActSnap) ? wdBetween(subCP, subCActSnap) : null;
  const approvalSlipC  = (c01SignOffPlan && r.c01SignOffActDate)
    ? wdBetween(c01SignOffPlan, snapFwd(new Date(r.c01SignOffActDate))) : null;

  // ── Construction (Adj) ───────────────────────────────────────────────────────
  const stCA          = r.stCActDate ? snapFwd(new Date(r.stCActDate)) : stCP;
  const delCA         = addWD(stCA, constrDrawDays);
  const delCActSnap   = r.delCActDate ? snapFwd(new Date(r.delCActDate)) : null;
  const subCA         = subCActSnap ?? addWD(delCActSnap ?? delCA, effQaC);
  const c01SignOffAdj = addWD(subCA, 2);

  // ── Production & Install ─────────────────────────────────────────────────────
  const c01SignOffActSnap = r.c01SignOffActDate ? snapFwd(new Date(r.c01SignOffActDate)) : null;
  const prodDateP   = addWD(c01SignOffPlan,                     project?.productionPrepPeriod ?? 0);
  const prodDateAdj = addWD(c01SignOffActSnap ?? c01SignOffAdj, project?.productionPrepPeriod ?? 0);
  const instDate    = r.productionTime ? addWD(prodDateAdj, r.productionTime) : null;

  return {
    nca: false,
    del1P, sub1P, del1A, del1ActSnap, sub1A, sub1Act,
    s4ApprovalPlan, dtSlip1, approvalSlip1,
    st2P, st2A, del2P, del2A, del2ActSnap, sub2P, sub2A, sub2Act,
    s5ApprovalPlan, dtSlip2, approvalSlip2,
    stCP, stCA, delCP, delCA, delCActSnap, subCP, subCA, subCActSnap,
    c01SignOffPlan, c01SignOffAdj, dtSlipC, approvalSlipC,
    prodDateP, prodDateAdj, instDate,
  };
}
