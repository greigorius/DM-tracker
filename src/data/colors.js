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
