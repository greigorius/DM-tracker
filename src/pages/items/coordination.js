// Each project's Design Coordination item (spec claude/item-tracker-spec.md §5.1).
// Usually named 000-{Project Number}-Design Coordination. Found per project by:
//   1. a name starting 000- that contains "Design Coordination", else
//   2. the only item in the project whose name contains "Design Coordination".
// Missing or ambiguous → { item: null, count } so the UI can warn.
const isCoord = t => /design\s*co-?ordination/i.test(t.title || '');

export function coordIndex(tasks) {
  const by = new Map();
  for (const t of tasks || []) {
    if (t.archived || !t.projectId || !isCoord(t)) continue;
    if (!by.has(t.projectId)) by.set(t.projectId, []);
    by.get(t.projectId).push(t);
  }
  const out = new Map();
  for (const [pid, list] of by) {
    const exact = list.filter(t => /^000-/.test((t.title || '').trim()));
    const item = exact.length === 1 ? exact[0] : list.length === 1 ? list[0] : null;
    out.set(pid, { item, count: list.length });
  }
  return out;
}

export const coordFor = (index, projectId) => index.get(projectId) || { item: null, count: 0 };
