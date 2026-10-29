// Shared DM constants (moved out of the retired mockData.js)

// ── DM Phase config ───────────────────────────────────────────────────────────
export const DM_PHASES = [
  { key: 'DT1',  label: 'DT1',  bg: '#1e3a5f', text: '#60a5fa' },
  { key: 'P01',  label: 'P01',  bg: '#2e1f5e', text: '#818cf8' },
  { key: 'S4',   label: 'S4',   bg: '#78350f', text: '#fbbf24' },
  { key: 'DT2',  label: 'DT2',  bg: '#1e3a5f', text: '#60a5fa' },
  { key: 'P02',  label: 'P02',  bg: '#2e1f5e', text: '#818cf8' },
  { key: 'S5',   label: 'S5',   bg: '#2e1065', text: '#a78bfa' },
  { key: 'DTC',  label: 'DTC',  bg: '#3b1a3b', text: '#e879f9' },
  { key: 'C01',  label: 'C01',  bg: '#1a3a2a', text: '#34d399' },
  { key: 'PROD', label: 'PROD', bg: '#1a3a2a', text: '#34d399' },
];

export const PHASE_ORDER = ['DT1','P01','S4','DT2','P02','S5','DTC','C01','PROD'];

// ── Status config — re-exported from shared colours so all pages stay in sync ──
// (Notion status palette adapted for dark UI — see src/data/colors.js)
export { ITEM_STATUS_COLORS as STATUS_COLORS, ITEM_STATUS_DEFAULT } from './colors.js';
