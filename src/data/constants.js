// Shared DM constants (moved out of the retired mockData.js)

// ── DM Phase config ───────────────────────────────────────────────────────────
export const DM_PHASES = [
  { key: 'DT1',  label: 'DT1',  bg: 'var(--color-surface-hi)', text: 'var(--color-info)' },
  { key: 'P01',  label: 'P01',  bg: 'var(--color-surface-hi)', text: 'var(--color-text-2)' },
  { key: 'S4',   label: 'S4',   bg: 'color-mix(in srgb, var(--color-accent) 16%, transparent)', text: 'var(--color-accent)' },
  { key: 'DT2',  label: 'DT2',  bg: 'var(--color-surface-hi)', text: 'var(--color-info)' },
  { key: 'P02',  label: 'P02',  bg: 'var(--color-surface-hi)', text: 'var(--color-text-2)' },
  { key: 'S5',   label: 'S5',   bg: 'var(--color-surface-hi)', text: 'var(--color-text-2)' },
  { key: 'DTC',  label: 'DTC',  bg: 'var(--color-surface-hi)', text: 'var(--color-text-2)' },
  { key: 'C01',  label: 'C01',  bg: 'color-mix(in srgb, var(--color-ok) 16%, transparent)', text: 'var(--color-ok)' },
  { key: 'PROD', label: 'PROD', bg: 'color-mix(in srgb, var(--color-ok) 16%, transparent)', text: 'var(--color-ok)' },
];

export const PHASE_ORDER = ['DT1','P01','S4','DT2','P02','S5','DTC','C01','PROD'];

// ── Status config — re-exported from shared colours so all pages stay in sync ──
// (Notion status palette adapted for dark UI — see src/data/colors.js)
export { ITEM_STATUS_COLORS as STATUS_COLORS, ITEM_STATUS_DEFAULT } from './colors.js';
