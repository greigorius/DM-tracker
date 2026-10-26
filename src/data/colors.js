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
 * Each entry: { bg: hex, text: hex }
 *   bg  = background (Notion hue at ~15–18% opacity on #0a0f1a)
 *   text = Notion's canonical foreground colour for that hue
 */
export const ITEM_STATUS_COLORS = {
  // ── Gray (not started / backlog / omitted) ──
  'Not Started':        { bg: '#1e2128', text: '#9b9ea4' },
  'Backlog':            { bg: '#1e2128', text: '#9b9ea4' },
  'To Do':              { bg: '#1e2128', text: '#9b9ea4' },
  'Ongoing':            { bg: '#1e2128', text: '#9b9ea4' },
  'Omitted':            { bg: '#181b1f', text: '#6b7280' },

  // ── Blue (in progress / pre-production) ──
  'In Progress':        { bg: '#0f2340', text: '#5ba5e8' },
  'Pre-Production':     { bg: '#0f2340', text: '#5ba5e8' },
  'Set Up':             { bg: '#0f2340', text: '#5ba5e8' },
  'In Design':          { bg: '#0f2340', text: '#5ba5e8' },

  // ── Purple (in review) ──
  'In Review':          { bg: '#221b3a', text: '#a582d8' },

  // ── Yellow (review / pending client) ──
  'Review':             { bg: '#2b2208', text: '#d4a229' },
  'Pending':            { bg: '#2b2208', text: '#d4a229' },
  'Awaiting Approval':  { bg: '#2b2208', text: '#d4a229' },
  'By Others':          { bg: '#2b2208', text: '#d4a229' },

  // ── Orange (on hold) ──
  'On Hold':            { bg: '#2e1a08', text: '#e07c30' },
  'On Hold - RFIs':     { bg: '#2e1a08', text: '#e07c30' },

  // ── Red (blocked) ──
  'Blocked':            { bg: '#321010', text: '#e05555' },

  // ── Green (approved / complete / manufacture) ──
  'PC Approved':        { bg: '#0b2418', text: '#4daa7a' },
  'Design Complete':    { bg: '#0b2418', text: '#4daa7a' },
  'In Manufacture':     { bg: '#0b2418', text: '#4daa7a' },
  'In Production':      { bg: '#0b2418', text: '#4daa7a' },
  'On Site':            { bg: '#0b2418', text: '#4daa7a' },
  'Close Out':          { bg: '#0b2418', text: '#4daa7a' },
  'Complete':           { bg: '#0b2418', text: '#4daa7a' },
};

/** Fallback for unknown statuses */
export const ITEM_STATUS_DEFAULT = { bg: '#181c24', text: '#94a3b8' };
