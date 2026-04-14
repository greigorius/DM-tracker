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

/**
 * Item progress status colours — matches Notion's status select property palette
 * adapted for the app's dark (#0a0f1a) background.
 *
 * Each entry: { bg: solid-hex, text: solid-hex }
 *   bg  = Notion status colour at ~12 % opacity blended onto #0a0f1a
 *   text = Notion's canonical colour for that hue (what you see in Notion UI)
 */
export const ITEM_STATUS_COLORS = {
  // ── Gray (not started / omitted) ──
  'Not Started':     { bg: '#181c22', text: '#979A9B' },
  'Backlog':         { bg: '#181c22', text: '#979A9B' },
  'Omitted':         { bg: '#131619', text: '#6B7280' },

  // ── Blue (in progress) ──
  'In Progress':     { bg: '#0e1e30', text: '#3989CC' },

  // ── Purple (in review) ──
  'In Review':       { bg: '#1b192c', text: '#9979CF' },

  // ── Yellow (review / pending client) ──
  'Review':          { bg: '#221d0c', text: '#C79B34' },

  // ── Orange (on hold) ──
  'On Hold':         { bg: '#231508', text: '#C77B31' },
  'On Hold - RFIs':  { bg: '#231508', text: '#C77B31' },

  // ── Red (blocked) ──
  'Blocked':         { bg: '#280f0f', text: '#CE5353' },

  // ── Green (approved / complete) ──
  'PC Approved':     { bg: '#0c2018', text: '#4D9375' },
  'Design Complete': { bg: '#0c2018', text: '#4D9375' },
  'In Manufacture':  { bg: '#0c2018', text: '#4D9375' },
  'Complete':        { bg: '#0c2018', text: '#4D9375' },
};

/** Fallback for unknown statuses */
export const ITEM_STATUS_DEFAULT = { bg: '#141a22', text: '#94a3b8' };
