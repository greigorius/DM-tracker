// Item Ball In Court, derived from the other DBs. Pure functions over snapshot
// rows, shared by the sync (writes), Triage (review/apply) and the browser.
//
// Priority, first match wins:
//   1. Lock Status ticked            → leave alone (manual override)
//   2. Item closed                   → clear
//   3. Open variation that pauses    → the variation's BIC. A variation that
//                                      doesn't pause (Pause Override "Does not pause",
//                                      or a type that doesn't pause) is only logged:
//                                      it doesn't take the item's ball in court
//   4. Open stop-work RFI            → the RFI's BIC / TBC by
//   5. Open action with Blocks Item  → the action's BIC
//   6. Drawings                      → holder of each drawing's latest submission;
//                                      more than one holder = Mixed
//   7. No drawings yet               → DT if a DT is assigned, else DM
//                                      (In Production with no drawings → Production)

import { DONE_ITEM_STATUSES, OPEN_RFI_STATUSES } from './derive.js';

export const MIXED = 'Mixed';
// Only explicit open statuses count: a variation with no status is a data fix, not a blocker.
const OPEN_VC = new Set(['Awaiting Design Info', 'Awaiting Instruction']);
const PAUSE_TYPES = new Set(['Design Change', 'Scope Change']); // same as _statusRules
export const vcPauses = v => v.pauseOverride === 'Pauses' || (!v.pauseOverride && PAUSE_TYPES.has(v.type));
// Submissions that no longer sit with anyone.
const TERMINAL_SUB = new Set(['Complete']);

const push = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
const holders = list => [...new Set(list.filter(Boolean))].sort();
const one = (hs, reason, source) => (hs.length === 0 ? null : hs.length === 1 ? { bic: hs[0], reason, source } : { bic: MIXED, reason: `${reason}: ${hs.join(', ')}`, source });

// Index the other DBs by item once per run.
export function bicContext({ submissions = [], variations = [], rfis = [], actions = [] }) {
  const latest = new Map();
  for (const s of submissions) {
    if (s.archived) continue;
    const key = s.drawingIds?.[0] || s.title;
    const cur = latest.get(key);
    if (!cur || (s.createdAt || '') > (cur.createdAt || '')) latest.set(key, s);
  }
  const subs = new Map(), vcs = new Map(), rfiStop = new Map(), blockers = new Map();
  for (const s of latest.values()) if (!TERMINAL_SUB.has(s.status)) for (const i of s.itemIds || []) push(subs, i, s);
  for (const v of variations) if (!v.archived && OPEN_VC.has(v.status) && vcPauses(v)) for (const i of v.itemIds || []) push(vcs, i, v);
  for (const r of rfis) if (!r.archived && r.stopsWork && OPEN_RFI_STATUSES.has(r.status)) for (const i of r.itemIds || []) push(rfiStop, i, r);
  for (const a of actions) if (!a.archived && !a.done && a.blocks && a.type !== 'Note') for (const i of a.itemIds || []) push(blockers, i, a);
  return { subs, vcs, rfiStop, blockers };
}

/**
 * Derived BIC for one item.
 * Returns { skip: reason } to leave it alone, or { bic, reason, source } (bic null = clear).
 */
export function deriveItemBic(item, ctx) {
  if (item.archived) return { skip: 'archived' };
  if (item.lockStatus) return { skip: 'Lock Status ticked' };
  if (DONE_ITEM_STATUSES.has(item.status)) return { bic: null, reason: `Item ${item.status}`, source: 'status' };

  const vc = one(holders((ctx.vcs.get(item.id) || []).map(v => v.bic)), 'Open variation (pauses)', 'variation');
  if (vc) return vc;
  const rfi = one(holders((ctx.rfiStop.get(item.id) || []).map(r => r.bic || r.tbcBy)), 'Stop-work RFI', 'rfi');
  if (rfi) return rfi;
  const act = one(holders((ctx.blockers.get(item.id) || []).map(a => a.bic)), 'Blocking action', 'action');
  if (act) return act;

  const subs = ctx.subs.get(item.id) || [];
  const dw = one(holders(subs.map(s => s.bic)), `Drawings (${subs.length})`, 'drawings');
  if (dw) return dw;

  if (item.status === 'In Production') return { bic: 'Production', reason: 'In Production, no drawings in Drawing Flow', source: 'status' };
  return item.dtIds?.length
    ? { bic: 'DT', reason: 'No drawings yet, DT assigned', source: 'default' }
    : { bic: 'DM', reason: 'No drawings yet, no DT assigned', source: 'default' };
}

/**
 * Every item whose derived BIC differs from Notion.
 * `allowed` (optional) is the Tasks BIC option list: values outside it are reported, never written.
 */
export function bicPlan(snaps, { allowed } = {}) {
  const ctx = bicContext(snaps);
  const ok = allowed?.length ? new Set([...allowed, MIXED]) : null;
  const changes = [], locked = [], invalid = [];
  for (const item of snaps.tasks || []) {
    const d = deriveItemBic(item, ctx);
    if (d.skip) { if (d.skip !== 'archived' && item.bic) locked.push({ id: item.id, title: item.title, bic: item.bic }); continue; }
    if ((d.bic || null) === (item.bic || null)) continue;
    const row = { id: item.id, title: item.title, projectId: item.projectId, status: item.status, from: item.bic || null, to: d.bic, reason: d.reason, source: d.source, url: item.url };
    if (d.bic && ok && !ok.has(d.bic)) invalid.push(row); else changes.push(row);
  }
  return { changes, locked, invalid };
}
