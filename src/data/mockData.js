// ── Client → Project hierarchy ────────────────────────────────────────────────
export const CLIENTS = [
  {
    id: 'axiom',
    name: 'Axiom',
    color: '#6366F1',
    projects: [
      { id: 'proj-1', name: 'EIT Oxford House', color: '#4F9CF9', items: 24, hoursSpent: 180, hoursTotal: 320 },
      { id: 'proj-2', name: 'Project B',         color: '#F97316', items: 12, hoursSpent:  60, hoursTotal: 150 },
    ],
  },
];

// Flat project list (derived) — keeps ProjectHome / PhaseTable working unchanged
export const PROJECTS = CLIENTS.flatMap(c =>
  c.projects.map(p => ({ ...p, clientId: c.id }))
);

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

// ── Mock timeline items ───────────────────────────────────────────────────────
const T = (offsetDays) => {
  const d = new Date('2026-04-07');
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

export const MOCK_ITEMS = [
  {
    id: 'OX-01', projectId: 'proj-1',
    name: 'Curtain Wall Type CW-01',
    status: 'In Progress', dmPhase: 'DT1', assignee: 'JD',
    rfis: ['RFI-001', 'RFI-003'], tdlCount: 3, drawingCount: 8,
    milestones: { dt1Start: T(-5), dt1Delivery: T(3), sub1: T(14), s4Status: T(28) },
  },
  {
    id: 'OX-02', projectId: 'proj-1',
    name: 'Entrance Canopy Steel',
    status: 'In Review', dmPhase: 'P01', assignee: 'SR',
    rfis: ['RFI-007'], tdlCount: 2, drawingCount: 5,
    milestones: { dt1Delivery: T(-10), sub1: T(-3), s4Status: T(18) },
  },
  {
    id: 'OX-03', projectId: 'proj-1',
    name: 'Atrium Roof Glazing',
    status: 'On Hold - RFIs', dmPhase: 'DT1', assignee: 'MK',
    rfis: ['RFI-012', 'RFI-015'], tdlCount: 4, drawingCount: 6,
    milestones: { dt1Start: T(2), dt1Delivery: T(9), sub1: T(21) },
  },
  {
    id: 'OX-04', projectId: 'proj-1',
    name: 'Ground Floor Facade Panels',
    status: 'Design Complete', dmPhase: 'S4', assignee: 'JD',
    rfis: [], tdlCount: 0, drawingCount: 4,
    milestones: { dt1Delivery: T(-21), sub1: T(-14), s4Status: T(-5), s5Status: T(25) },
  },
  {
    id: 'OX-05', projectId: 'proj-1',
    name: 'Rooftop Plant Enclosure',
    status: 'Backlog', dmPhase: 'DT2', assignee: 'SR',
    rfis: [], tdlCount: 1, drawingCount: 3,
    milestones: { dt2Start: T(5), dt2Delivery: T(12) },
  },
  {
    id: 'OX-06', projectId: 'proj-1',
    name: 'Main Lobby Balustrade',
    status: 'In Manufacture', dmPhase: 'PROD', assignee: 'MK',
    rfis: [], tdlCount: 0, drawingCount: 7,
    milestones: { sub1: T(-60), s4Status: T(-45), sub2: T(-30), s5Status: T(-15), production: T(-7) },
  },
  {
    id: 'PB-01', projectId: 'proj-2',
    name: 'External Cladding System A',
    status: 'In Progress', dmPhase: 'DT1', assignee: 'TW',
    rfis: ['RFI-B01'], tdlCount: 2, drawingCount: 5,
    milestones: { dt1Start: T(-3), dt1Delivery: T(6), sub1: T(20) },
  },
  {
    id: 'PB-02', projectId: 'proj-2',
    name: 'Structural Steel Connections',
    status: 'In Review', dmPhase: 'P01', assignee: 'TW',
    rfis: [], tdlCount: 1, drawingCount: 4,
    milestones: { dt1Delivery: T(-8), sub1: T(1), s4Status: T(22) },
  },
  {
    id: 'PB-03', projectId: 'proj-2',
    name: 'Roof Drainage System',
    status: 'Design Complete', dmPhase: 'S5', assignee: 'AL',
    rfis: ['RFI-B04'], tdlCount: 0, drawingCount: 3,
    milestones: { sub2: T(-10), s5Status: T(4) },
  },
];

// ── RFI mock data ─────────────────────────────────────────────────────────────
export const RFIS = [
  { id: 'rfi-001', rfiNumber: '1',   projectId: 'proj-1', projectName: 'EIT Oxford House', status: 'Open',      description: 'Curtain wall thermal performance specification — U-value targets', tbcBy: '28 Apr' },
  { id: 'rfi-003', rfiNumber: '3',   projectId: 'proj-1', projectName: 'EIT Oxford House', status: 'Open',      description: 'Structural bracket connection details for CW-01 bracket grid', tbcBy: '2 May' },
  { id: 'rfi-007', rfiNumber: '7',   projectId: 'proj-1', projectName: 'EIT Oxford House', status: 'Open',      description: 'Canopy steel grade confirmation from structural engineer', tbcBy: '30 Apr' },
  { id: 'rfi-012', rfiNumber: '12',  projectId: 'proj-1', projectName: 'EIT Oxford House', status: 'Open',      description: 'Atrium roof glazing U-value targets and solar gain limits', tbcBy: '5 May' },
  { id: 'rfi-015', rfiNumber: '15',  projectId: 'proj-1', projectName: 'EIT Oxford House', status: 'Pending',   description: 'Fixing bolt schedule and supplier approval for atrium node', tbcBy: 'TBC' },
  { id: 'rfi-b01', rfiNumber: 'B01', projectId: 'proj-2', projectName: 'Project B',         status: 'Open',      description: 'External cladding fire rating certification — Class A1 required', tbcBy: '8 May' },
  { id: 'rfi-b04', rfiNumber: 'B04', projectId: 'proj-2', projectName: 'Project B',         status: 'In Review', description: 'Roof drainage outlet sizes and flow rates per BS EN 12056', tbcBy: '25 Apr' },
];

// ── Enriched items (mock data + derived fields for page components) ────────────
export const ITEMS = MOCK_ITEMS.map(item => {
  const project = PROJECTS.find(p => p.id === item.projectId);
  return {
    ...item,
    rfiCount:     item.rfis.length,
    projectName:  project?.name  ?? '',
    projectColor: project?.color ?? '#60a5fa',
    dates: Object.fromEntries(
      Object.entries(item.milestones || {}).map(([k, v]) => [k, { plan: v }])
    ),
  };
});

// ── Computed stats (all projects) ────────────────────────────────────────────
export const STATS = {
  rfisOpen:        MOCK_ITEMS.reduce((n, i) => n + i.rfis.length, 0),
  itemsIssued:     14,
  drawingsAssigned: 24,
  drawingsApproved: { s4: 8, s5: 4 },
  itemsHanging:    5,
  inProduction:    MOCK_ITEMS.filter(i => i.dmPhase === 'PROD').length,
};
