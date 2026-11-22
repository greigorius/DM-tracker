// Item Status model for Triage rows: the rule's answer for every item, plus each
// item's linked RFIs, variations and drawings. Derived once per snapshot set.
import { deriveStatuses } from '../../../hub-core/item-status.js';
import { variationHolds, rfiHolds } from '../../../netlify/functions/_statusRules.js';

export const PLAN_KEY = ['item-status-plan'];
export const bare = id => String(id || '').replace(/-/g, '');
export const TONE = { Blocked: 'danger', 'On Hold': 'danger', 'In Production': 'ok', 'Design Complete': 'ok', Complete: 'ok', 'In Progress': 'info' };
const OPEN_RFI = new Set(['Raise', 'Open', 'Close Out']);
const DECIDED_VC = new Set(['Instruction Received', 'Declined', 'Withdrawn']);
export const PAUSE_TYPES = new Set(['Design Change', 'Scope Change']);

// ── Model: derived once per snapshot set, shared by every row ───────────────
const cache = new WeakMap();
export function statusModel(d) {
  const hit = cache.get(d.all);
  if (hit && hit.today === d.today) return hit;
  const res = deriveStatuses(d.all, d.today);
  const items = new Map(res.items.map(i => [i.id, i]));
  const drawingsOf = new Map();
  for (const x of res.drawings) { if (!drawingsOf.has(x.item)) drawingsOf.set(x.item, []); drawingsOf.get(x.item).push(x); }
  // Every drawing on the item (not only the ones the rule had to load)
  const allDrawings = new Map();
  for (const x of d.all.drawings || []) if (!x.archived) for (const i of x.itemIds || []) { const k = bare(i); if (!allDrawings.has(k)) allDrawings.set(k, []); allDrawings.get(k).push(x); }
  const subsOf = new Map();
  for (const s of d.all.submissions || []) if (!s.archived) for (const dw of s.drawingIds || []) { const k = bare(dw); if (!subsOf.has(k)) subsOf.set(k, []); subsOf.get(k).push(s); }
  const m = { today: d.today, items, drawingsOf, allDrawings, subsOf };
  cache.set(d.all, m);
  return m;
}

export function linked(d, m, itemId) {
  const id = bare(itemId);
  const dws = m.allDrawings.get(id) || [];
  const dwIds = new Set(dws.map(x => bare(x.id)));
  const rfis = (d.all.rfis || []).filter(r => !r.archived && ((r.itemIds || []).some(i => bare(i) === id) || (r.drawingIds || []).some(x => dwIds.has(bare(x)))));
  const vcs = (d.all.variations || []).filter(v => !v.archived && (v.itemIds || []).some(i => bare(i) === id));
  const rfiHold = r => rfiHolds({ stopsWork: r.stopsWork, status: r.status, raised: r.raised, created: (r.createdAt || '').slice(0, 10), responded: r.responded, closed: r.closed }, d.today);
  const vcHold = v => variationHolds({ type: v.type, override: v.pauseOverride, status: v.status, requestDate: v.requested, decisionDate: v.decision }, d.today);
  const openRfis = rfis.filter(r => OPEN_RFI.has(r.status) || rfiHold(r));
  const openVcs = vcs.filter(v => !DECIDED_VC.has(v.status) || vcHold(v));
  return { dws, rfis, vcs, openRfis, openVcs, rfiHold, vcHold };
}

