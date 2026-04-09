export const PROJECT_COLORS = ['#4F9CF9','#F97316','#a78bfa','#34d399','#f472b6','#38bdf8','#facc15','#4ade80'];
export const CLIENT_COLORS  = ['#6366F1','#ec4899','#14b8a6','#f59e0b','#8b5cf6','#06b6d4'];

/**
 * Assign project colors by stable sort on ID so every page uses the same color
 * for the same project regardless of API response order.
 * Returns a Map<id, color>.
 */
export function assignProjectColors(projects) {
  const sorted = [...projects].sort((a, b) => a.id.localeCompare(b.id));
  const map = new Map();
  sorted.forEach((p, i) => map.set(p.id, PROJECT_COLORS[i % PROJECT_COLORS.length]));
  return map;
}
