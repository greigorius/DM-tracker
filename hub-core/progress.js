// Item / project progress from drawing stages (workspace spec §5.1).
// Per counted drawing (Dwg No. Assigned = Drawing; items with none fall back
// to their untyped drawings):
//   not started 0 · S4 issued 20 · S4 A/B 35 · S5 issued 50 · S5 A/B 65
//   A4.5/PRD issued 80 · signed off 90 · production scheduled 100
// S5 NA skips S5 (S4 A/B → 65). NCA items (PRD path) go 0 → 80 → 90 → 100.
// Item % = mean of its drawings; closed items 100; no drawings 0.
// Project % = mean of its live (not omitted) items.

const OK = new Set(['A', 'B']);
export const DONE_STATUSES = new Set(['Complete', 'PC Approved', 'Close Out']);

export function drawingPct(d, nca = false) {
  if (d.prd?.scheduled || d.productionStage) return 100;
  if (d.c01?.signOff) return 90;
  if (d.c01?.submitted) return 80;
  if (nca || d.noClientApproval) {
    if (d.prd?.status && /sign|approved|A|B/i.test(d.prd.status)) return 90;
    return d.prd?.statusDate ? 80 : 0;
  }
  const s5na = d.s5?.status === 'NA';
  if (!s5na) {
    if (OK.has(d.s5?.status)) return 65;
    if (d.s5?.submitted) return 50;
  }
  if (OK.has(d.s4?.status)) return s5na ? 65 : 35;
  if (d.s4?.submitted) return 20;
  return 0;
}

/** Map itemId → { pct, n } over the drawings snapshot. */
export function itemProgress(tasks = [], drawings = []) {
  const byItem = new Map();
  for (const d of drawings) {
    if (d.archived) continue;
    for (const id of d.itemIds || []) { if (!byItem.has(id)) byItem.set(id, []); byItem.get(id).push(d); }
  }
  const out = new Map();
  for (const t of tasks) {
    if (t.archived) continue;
    if (DONE_STATUSES.has(t.status)) { out.set(t.id, { pct: 100, n: 0 }); continue; }
    const all = byItem.get(t.id) || [];
    let counted = all.filter(d => d.type === 'Drawing');
    if (!counted.length) counted = all.filter(d => !d.type);
    if (!counted.length) { out.set(t.id, { pct: t.status === 'In Production' ? 100 : 0, n: 0 }); continue; }
    const sum = counted.reduce((n, d) => n + drawingPct(d, t.noClientApproval), 0);
    out.set(t.id, { pct: Math.round(sum / counted.length), n: counted.length });
  }
  return out;
}

export function projectProgress(projectId, tasks, prog) {
  const its = tasks.filter(t => !t.archived && t.projectId === projectId && t.status !== 'Omitted');
  if (!its.length) return null;
  return Math.round(its.reduce((n, t) => n + (prog.get(t.id)?.pct || 0), 0) / its.length);
}
