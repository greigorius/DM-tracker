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

// Item status colours, from the Hub tokens (src/styles/tokens.css).
const tint = n => `color-mix(in srgb, var(--color-${n}) 16%, transparent)`;
const tone = n => ({ bg: tint(n), text: `var(--color-${n})` });
const neutral = { bg: 'var(--color-surface-hi)', text: 'var(--color-muted)' };

export const ITEM_STATUS_COLORS = {
  'Backlog': neutral, 'Not Started': neutral, 'To Do': neutral, 'Set Up': neutral, 'Omitted': neutral, 'By Others': neutral,
  'In Progress': tone('info'), 'In Design': tone('info'), 'Ongoing': tone('info'), 'Pre-Production': tone('info'),
  'Awaiting Approval': tone('accent'), 'In Review': tone('accent'), 'Review': tone('accent'), 'Pending': tone('accent'),
  'On Hold': tone('accent'), 'On Hold - RFIs': tone('accent'),
  'Blocked': tone('danger'),
  'In Production': tone('ok'), 'In Manufacture': tone('ok'), 'On Site': tone('ok'), 'Close Out': tone('ok'),
  'PC Approved': tone('ok'), 'Design Complete': tone('ok'), 'Complete': tone('ok'),
};

/** Fallback for unknown statuses */
export const ITEM_STATUS_DEFAULT = neutral;
