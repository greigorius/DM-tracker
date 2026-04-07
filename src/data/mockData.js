// ── Projects ──────────────────────────────────────────────────────────────────
export const PROJECTS = [
  {
    id: 'oxford',
    name: 'EIT Oxford House',
    color: '#4F9CF9',
    colorLight: '#a8d0fc',
    items: 24,
    hoursSpent: 180,
    hoursTotal: 320,
  },
  {
    id: 'projectb',
    name: 'Project B',
    color: '#F97316',
    colorLight: '#fdba74',
    items: 12,
    hoursSpent: 60,
    hoursTotal: 150,
  },
];

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

// ── Status config ─────────────────────────────────────────────────────────────
export const STATUS_COLORS = {
  'Backlog':              { bg: '#37352f', text: '#c9c8c2' },
  'In Progress':         { bg: '#3b2714', text: '#f0a030' },
  'In Review':           { bg: '#2e2459', text: '#c5bcf0' },
  'On Hold - RFIs':      { bg: '#3b1a1a', text: '#f09090' },
  'Design Complete':     { bg: '#14532d', text: '#6ee7a0' },
  'PC Approved':         { bg: '#14532d', text: '#6ee7a0' },
  'In Manufacture':      { bg: '#14532d', text: '#6ee7a0' },
  'Complete':            { bg: '#14532d', text: '#6ee7a0' },
  'Omitted':             { bg: '#252525', text: '#909090' },
};

// ── Mock timeline items ───────────────────────────────────────────────────────
// dates are relative to 2026-04-07 (today)
const T = (offsetDays) => {
  const d = new Date('2026-04-07');
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

export const MOCK_ITEMS = [
  {
    id: 'OX-01',
    projectId: 'oxford',
    name: 'Curtain Wall Type CW-01',
    status: 'In Progress',
    dmPhase: 'DT1',
    assignee: 'JD',
    rfis: ['RFI-001', 'RFI-003'],
    milestones: {
      dt1Start:    T(-5),
      dt1Delivery: T(3),
      sub1:        T(14),
      s4Status:    T(28),
    },
  },
  {
    id: 'OX-02',
    projectId: 'oxford',
    name: 'Entrance Canopy Steel',
    status: 'In Review',
    dmPhase: 'P01',
    assignee: 'SR',
    rfis: ['RFI-007'],
    milestones: {
      dt1Delivery: T(-10),
      sub1:        T(-3),
      s4Status:    T(18),
    },
  },
  {
    id: 'OX-03',
    projectId: 'oxford',
    name: 'Atrium Roof Glazing',
    status: 'On Hold - RFIs',
    dmPhase: 'DT1',
    assignee: 'MK',
    rfis: ['RFI-012', 'RFI-015'],
    milestones: {
      dt1Start:    T(2),
      dt1Delivery: T(9),
      sub1:        T(21),
    },
  },
  {
    id: 'OX-04',
    projectId: 'oxford',
    name: 'Ground Floor Facade Panels',
    status: 'Design Complete',
    dmPhase: 'S4',
    assignee: 'JD',
    rfis: [],
    milestones: {
      dt1Delivery: T(-21),
      sub1:        T(-14),
      s4Status:    T(-5),
      s5Status:    T(25),
    },
  },
  {
    id: 'OX-05',
    projectId: 'oxford',
    name: 'Rooftop Plant Enclosure',
    status: 'Backlog',
    dmPhase: 'DT2',
    assignee: 'SR',
    rfis: [],
    milestones: {
      dt2Start:    T(5),
      dt2Delivery: T(12),
    },
  },
  {
    id: 'OX-06',
    projectId: 'oxford',
    name: 'Main Lobby Balustrade',
    status: 'In Manufacture',
    dmPhase: 'PROD',
    assignee: 'MK',
    rfis: [],
    milestones: {
      sub1:        T(-60),
      s4Status:    T(-45),
      sub2:        T(-30),
      s5Status:    T(-15),
      production:  T(-7),
    },
  },
  {
    id: 'PB-01',
    projectId: 'projectb',
    name: 'External Cladding System A',
    status: 'In Progress',
    dmPhase: 'DT1',
    assignee: 'TW',
    rfis: ['RFI-B01'],
    milestones: {
      dt1Start:    T(-3),
      dt1Delivery: T(6),
      sub1:        T(20),
    },
  },
  {
    id: 'PB-02',
    projectId: 'projectb',
    name: 'Structural Steel Connections',
    status: 'In Review',
    dmPhase: 'P01',
    assignee: 'TW',
    rfis: [],
    milestones: {
      dt1Delivery: T(-8),
      sub1:        T(1),
      s4Status:    T(22),
    },
  },
  {
    id: 'PB-03',
    projectId: 'projectb',
    name: 'Roof Drainage System',
    status: 'Design Complete',
    dmPhase: 'S5',
    assignee: 'AL',
    rfis: ['RFI-B04'],
    milestones: {
      sub2:        T(-10),
      s5Status:    T(4),
    },
  },
];

// ── Computed stats ────────────────────────────────────────────────────────────
export const STATS = {
  rfisOpen: MOCK_ITEMS.reduce((n, i) => n + i.rfis.length, 0),
  itemsIssued: 14,
  drawingsAssigned: 24,
  drawingsApproved: { s4: 8, s5: 4 },
  itemsHanging: 5,
  inProduction: MOCK_ITEMS.filter(i => i.dmPhase === 'PROD').length,
};
