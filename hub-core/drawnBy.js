// Drawn by: everyone who has submitted drawings for an item through Drawing
// Flow (the DT on each Submission). Read-only and worked out in the Hub, so
// the item's Person in Notion stays the lead DT and nothing that reads it
// (Ball in Court, Drawing Flow's fallback, the MDS "Assigned To") changes.

/**
 * @param {object[]} submissions  Submissions snapshot rows ({ itemIds, dtIds, submitted, createdAt })
 * @returns {Map<string, { id: string, count: number, last: string }[]>}
 *          item id → people, most recent submitter first
 */
export function drawnByFor(submissions = []) {
  const byItem = new Map();
  for (const s of submissions) {
    if (s.archived) continue;
    const dt = s.dtIds?.[0];
    if (!dt) continue;
    const when = s.submitted || s.createdAt || '';
    for (const itemId of s.itemIds || []) {
      if (!byItem.has(itemId)) byItem.set(itemId, new Map());
      const people = byItem.get(itemId);
      const cur = people.get(dt) || { id: dt, count: 0, last: '' };
      cur.count += 1;
      if (when > cur.last) cur.last = when;
      people.set(dt, cur);
    }
  }
  return new Map([...byItem].map(([id, m]) => [id, [...m.values()].sort((a, b) => b.last.localeCompare(a.last) || b.count - a.count)]));
}

// Ids only, most recent first.
export const drawnByIds = (map, itemId) => (map.get(itemId) || []).map(p => p.id);
