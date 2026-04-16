/**
 * scheduleCalc.js
 * Workday helpers and date formatting for the Item Date Matrix.
 * Ported from SchedulingTool/App.jsx.
 */

// ── UK Public Holidays — England & Wales 2024–2028 ────────────────────────────
export const UK_HOLIDAYS = new Set([
  '2024-01-01','2024-03-29','2024-04-01','2024-05-06','2024-05-27',
  '2024-08-26','2024-12-25','2024-12-26',
  '2025-01-01','2025-04-18','2025-04-21','2025-05-05','2025-05-26',
  '2025-08-25','2025-12-25','2025-12-26',
  '2026-01-01','2026-04-03','2026-04-06','2026-05-04','2026-05-25',
  '2026-08-31','2026-12-25','2026-12-28',
  '2027-01-01','2027-03-26','2027-03-29','2027-05-03','2027-05-31',
  '2027-08-30','2027-12-27','2027-12-28',
  '2028-01-03','2028-04-14','2028-04-17','2028-05-07','2028-05-28',
  '2028-08-27','2028-12-25','2028-12-26',
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
  if (!a || !b) return null;
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
  return isNaN(dt) ? null : dt.toISOString().slice(0, 10);
}

export function fmtShort(d) {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return '—';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = MONTHS[dt.getMonth()];
  const yy = String(dt.getFullYear()).slice(2);
  return `${dd}${mm}${yy}`; // e.g. "27Mar26"
}

/**
 * Enrich an item with computed fields:
 *   - dtSlip1, dtSlip2, dtSlipC  (workday slippage: plan submission vs actual)
 *   - s4ApprovalPlan              (alias for st2P — same Notion field)
 *   - s5ApprovalPlan              (alias for stCP — same Notion field)
 *   - c01SignOffPlan               (subCP + 2 workdays)
 */
export function enrichItem(item) {
  return {
    ...item,
    s4ApprovalPlan: item.st2P,
    s5ApprovalPlan: item.stCP,
    c01SignOffPlan: item.subCP ? toISO(addWD(new Date(item.subCP), 2)) : null,
    dtSlip1: (item.sub1P && item.sub1ActDate) ? wdBetween(new Date(item.sub1P), new Date(item.sub1ActDate)) : null,
    dtSlip2: (item.sub2P && item.sub2ActDate) ? wdBetween(new Date(item.sub2P), new Date(item.sub2ActDate)) : null,
    dtSlipC: (item.subCP && item.subCActDate) ? wdBetween(new Date(item.subCP), new Date(item.subCActDate)) : null,
  };
}
