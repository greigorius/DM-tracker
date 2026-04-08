import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { DM_PHASES, PHASE_ORDER, STATUS_COLORS } from '../data/mockData.js';
import QuickLogBar from '../components/QuickLogBar.jsx';

const C = {
  bg:       '#0a0f1a',
  bgCard:   '#0d1525',
  bgPanel:  '#0d1830',
  border:   '#1e2d45',
  text:     '#e2e8f0',
  textSec:  '#94a3b8',
  textMut:  '#7b90b0',
  today:    'rgba(74,222,128,0.75)',
  grid:     '#1a2540',
};

const PROJECT_COLORS = ['#4F9CF9','#F97316','#a78bfa','#34d399','#f472b6','#38bdf8','#facc15','#4ade80'];

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function phaseCfg(key)  { return DM_PHASES.find(p => p.key === key) || { bg: '#1e293b', text: '#94a3b8' }; }
function statusCfg(key) { return STATUS_COLORS[key] || { bg: '#1e293b', text: '#94a3b8' }; }
function PhaseBadge({ phase }) {
  const cfg = phaseCfg(phase);
  return <span style={{ background: cfg.bg, color: cfg.text, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>{phase}</span>;
}
function StatusBadge({ status }) {
  const cfg = statusCfg(status);
  return <span style={{ background: cfg.bg, color: cfg.text, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4 }}>{status}</span>;
}
function AssigneeChip({ assignee }) {
  return <span style={{ background: '#1e2d45', color: '#60a5fa', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, border: '1px solid #2d3f5a' }}>{assignee}</span>;
}

const bestDate = d => d ? (d.actual || d.adj || d.plan || null) : null;

// ── Project summary card ──────────────────────────────────────────────────────
function ProjectSummaryCard({ project, projectItems }) {
  const hoursSpent     = project.hoursSpent    ?? 0;
  const hoursRemaining = Math.max(0, (project.hoursRequired ?? 0) - hoursSpent);
  const projectColor   = project.color ?? '#4F9CF9';

  const hoursData = [
    { name: 'Spent',     value: hoursSpent,     color: projectColor },
    { name: 'Remaining', value: hoursRemaining,  color: hexToRgba(projectColor, 0.25) },
  ];

  const phaseBreakdown = PHASE_ORDER.map(ph => ({
    ph, count: projectItems.filter(i => i.dmPhase === ph).length,
  })).filter(x => x.count > 0);

  const phaseData = phaseBreakdown.map(x => ({ name: x.ph, value: x.count, color: phaseCfg(x.ph).text }));

  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 28, borderLeftWidth: 4, borderLeftColor: projectColor }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: projectColor }} />
          <span style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{project.name}</span>
        </div>
        <div style={{ fontSize: 12, color: C.textSec, marginBottom: 10 }}>{projectItems.length} active items · {hoursSpent}h / {project.hoursRequired ?? 0}h</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {phaseBreakdown.map(x => (
            <span key={x.ph} style={{ background: phaseCfg(x.ph).bg, color: phaseCfg(x.ph).text, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>
              {x.ph} ×{x.count}
            </span>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative', width: 90, height: 90, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={phaseData.length ? phaseData : [{ value: 1, color: C.border }]} cx="50%" cy="50%" innerRadius={28} outerRadius={42} dataKey="value" strokeWidth={0}>
              {(phaseData.length ? phaseData : [{ color: C.border }]).map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1 }}>{projectItems.length}</span>
          <span style={{ fontSize: 9, color: C.textMut, marginTop: 1 }}>items</span>
        </div>
      </div>

      <div style={{ position: 'relative', width: 90, height: 90, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={hoursData} cx="50%" cy="50%" innerRadius={28} outerRadius={42} dataKey="value" strokeWidth={0} startAngle={90} endAngle={-270}>
              {hoursData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: projectColor, lineHeight: 1 }}>{hoursSpent}h</span>
          <span style={{ fontSize: 9, color: C.textMut, marginTop: 2 }}>{hoursRemaining}h left</span>
        </div>
      </div>
    </div>
  );
}

// ── Mini timeline ─────────────────────────────────────────────────────────────
const DAY_W   = 44;
const LABEL_W = 220;
const ROW_H   = 44;
const DAYS    = 21;

const MILESTONE_KEYS = [
  { key: 'dt1Start',    label: 'DT1↑', ck: 'dt1'  },
  { key: 'dt1Delivery', label: 'DT1↓', ck: 'dt1'  },
  { key: 'sub1',        label: 'P01',  ck: 'p01'  },
  { key: 's4Status',    label: 'S4',   ck: 's4'   },
  { key: 'dt2Start',    label: 'DT2↑', ck: 'dt2'  },
  { key: 'dt2Delivery', label: 'DT2↓', ck: 'dt2'  },
  { key: 'sub2',        label: 'P02',  ck: 'p02'  },
  { key: 's5Status',    label: 'S5',   ck: 's5'   },
  { key: 'production',  label: 'PROD', ck: 'prod' },
];

const MILESTONE_COLORS = {
  dt1:  { bg: '#1e3a5f', text: '#60a5fa' },
  p01:  { bg: '#2e1f5e', text: '#818cf8' },
  s4:   { bg: '#78350f', text: '#fbbf24' },
  dt2:  { bg: '#1e3a5f', text: '#60a5fa' },
  p02:  { bg: '#2e1f5e', text: '#818cf8' },
  s5:   { bg: '#2e1065', text: '#a78bfa' },
  dtc:  { bg: '#3b1a3b', text: '#e879f9' },
  c01:  { bg: '#1a3a2a', text: '#34d399' },
  prod: { bg: '#1a3a2a', text: '#34d399' },
};

function MiniTimeline({ items, projectColor }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const windowStart = new Date(today); windowStart.setDate(today.getDate() - 7);
  const windowEnd   = new Date(windowStart); windowEnd.setDate(windowStart.getDate() + DAYS);

  const dateX = (s) => { if (!s) return null; const d = new Date(s); d.setHours(0,0,0,0); return Math.round((d - windowStart) / 86_400_000) * DAY_W; };
  const todayX = dateX(today.toISOString().slice(0,10));

  const dayHeaders = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(windowStart); d.setDate(d.getDate() + i);
    return { label: d.getDate(), isToday: d.toDateString() === today.toDateString(), isWeekStart: d.getDay() === 1, x: i * DAY_W };
  });

  const weekLabels = [];
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(windowStart); d.setDate(d.getDate() + i);
    if (d.getDay() === 1 || i === 0) {
      const fmt = dt => dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      weekLabels.push({ label: `w/c ${fmt(d)}`, x: i * DAY_W, width: Math.min(7, DAYS - i) * DAY_W });
    }
  }

  const windowItems = items.filter(item => {
    const dates = MILESTONE_KEYS.map(m => bestDate(item.dates?.[m.key])).filter(Boolean).map(d => new Date(d));
    if (!dates.length) return false;
    return new Date(Math.min(...dates)) <= windowEnd && new Date(Math.max(...dates)) >= windowStart;
  });

  const totalW = DAYS * DAY_W;

  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', fontFamily: "'ui-monospace', Consolas, monospace" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${C.border}`, background: C.bgPanel }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Three-Week Lookahead</span>
        <Link to="/timeline" style={{ fontSize: 11, color: '#60a5fa', textDecoration: 'none', fontWeight: 600 }}>View Full Timeline →</Link>
      </div>
      {windowItems.length === 0 ? (
        <div style={{ padding: '24px', color: C.textMut, fontSize: 11, textAlign: 'center' }}>No milestone activity in this window</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', height: 20, marginLeft: LABEL_W, position: 'relative', minWidth: totalW }}>
            {weekLabels.map((w, i) => (
              <div key={i} style={{ position: 'absolute', left: w.x, width: w.width, fontSize: 9, color: C.textMut, display: 'flex', alignItems: 'center', paddingLeft: 4, borderLeft: i > 0 ? `1px solid ${C.border}` : 'none' }}>{w.label}</div>
            ))}
          </div>
          <div style={{ display: 'flex', height: 24, borderBottom: `1px solid ${C.border}`, background: C.bgPanel }}>
            <div style={{ width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, background: C.bgPanel, borderRight: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', paddingLeft: 16, fontSize: 10, color: C.textMut }}>Item / Assignee</div>
            {dayHeaders.map((d, i) => (
              <div key={i} style={{ width: DAY_W, flexShrink: 0, fontSize: 9, fontWeight: d.isToday ? 800 : 400, color: d.isToday ? '#4ade80' : d.isWeekStart ? C.textSec : C.textMut, borderLeft: d.isWeekStart && i > 0 ? `1px solid ${C.border}` : `1px solid ${C.grid}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: d.isToday ? 'rgba(74,222,128,0.06)' : 'transparent' }}>{d.label}</div>
            ))}
          </div>
          {windowItems.map((item, idx) => {
            const rowBg = idx % 2 === 0 ? C.bgCard : '#0b1020';
            return (
              <div key={item.id} style={{ display: 'flex', height: ROW_H, borderBottom: `1px solid ${C.grid}`, background: rowBg }}>
                <div style={{ width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 10, background: rowBg, borderRight: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', overflow: 'hidden' }}>
                  <div style={{ width: 3, height: '60%', borderRadius: 2, background: projectColor, flexShrink: 0 }} />
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>{item.name}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                      {item.assignee && <AssigneeChip assignee={item.assignee} />}
                      {item.dmPhase && <PhaseBadge phase={item.dmPhase} />}
                    </div>
                  </div>
                </div>
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: totalW }}>
                  {dayHeaders.map((d, i) => (<div key={i} style={{ position: 'absolute', left: d.x, top: 0, width: 1, height: '100%', background: d.isWeekStart && i > 0 ? C.border : C.grid, zIndex: 0, pointerEvents: 'none' }} />))}
                  <div style={{ position: 'absolute', left: todayX, top: 0, width: DAY_W, height: '100%', background: 'rgba(74,222,128,0.04)', zIndex: 0, pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', left: todayX, top: 0, width: 2, height: '100%', background: C.today, zIndex: 2, pointerEvents: 'none' }} />
                  {MILESTONE_KEYS.map(m => {
                    const ds = bestDate(item.dates?.[m.key]); if (!ds) return null;
                    const x = dateX(ds); if (x === null || x < 0 || x > totalW) return null;
                    const mc = MILESTONE_COLORS[m.ck] || { bg: '#1e293b', text: '#94a3b8' };
                    return <div key={m.key} title={`${m.label}: ${ds}`} style={{ position: 'absolute', left: x + DAY_W / 2 - 14, top: '50%', transform: 'translateY(-50%)', background: mc.bg, color: mc.text, fontSize: 8, fontWeight: 800, padding: '2px 4px', borderRadius: 3, zIndex: 3, border: `1px solid ${mc.text}40`, whiteSpace: 'nowrap' }}>{m.label}</div>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function StatPanel({ label, value, sub, valueColor = C.text }) {
  return (
    <div style={{ flex: 1, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 18px', minWidth: 120 }}>
      <div style={{ fontSize: 32, fontWeight: 800, color: valueColor, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: C.textMut, marginTop: 4, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: C.textSec, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── Phase table ───────────────────────────────────────────────────────────────
function PhaseTable({ items, projectColor }) {
  const sorted = [...items].sort((a, b) => PHASE_ORDER.indexOf(a.dmPhase) - PHASE_ORDER.indexOf(b.dmPhase));
  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, background: C.bgPanel }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>DM Phase Summary</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#0b1020', borderBottom: `1px solid ${C.border}` }}>
              {['','Item','Status','DM Phase','RFIs','Assignee'].map((h, i) => (
                <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: C.textMut, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, idx) => (
              <tr key={item.id} style={{ background: idx % 2 === 0 ? C.bgCard : '#0b1020', borderBottom: `1px solid ${C.grid}` }}>
                <td style={{ padding: '8px 12px', width: 18 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: projectColor }} /></td>
                <td style={{ padding: '8px 12px', color: C.text, fontWeight: 500, whiteSpace: 'nowrap' }}>{item.name}</td>
                <td style={{ padding: '8px 12px' }}><StatusBadge status={item.status} /></td>
                <td style={{ padding: '8px 12px' }}><PhaseBadge phase={item.dmPhase} /></td>
                <td style={{ padding: '8px 12px', color: (item.rfiCount ?? 0) > 0 ? '#f87171' : C.textMut, fontSize: 11 }}>
                  {(item.rfiCount ?? 0) > 0 ? item.rfiCount : '—'}
                </td>
                <td style={{ padding: '8px 12px' }}>{item.assignee && <AssigneeChip assignee={item.assignee} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProjectHome() {
  const { projectId } = useParams();

  const [project,     setProject]     = useState(null);
  const [items,       setItems]       = useState([]);
  const [projLoading, setProjLoading] = useState(true);
  const [itemLoading, setItemLoading] = useState(true);

  // Fetch project metadata
  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        const found = list.find(p => p.id === projectId);
        if (found) {
          const idx = list.indexOf(found);
          setProject({ ...found, color: PROJECT_COLORS[idx % PROJECT_COLORS.length] });
        }
      })
      .catch(() => {})
      .finally(() => setProjLoading(false));
  }, [projectId]);

  // Fetch project items
  useEffect(() => {
    let cancelled = false;
    setItemLoading(true);
    fetch(`/api/projects/${projectId}/items`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled) setItems(data.items || []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setItemLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  if (projLoading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: C.textSec, fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: C.textSec, fontSize: 14 }}>
          Project not found. <Link to="/" style={{ color: '#60a5fa' }}>← Back</Link>
        </div>
      </div>
    );
  }

  const projectColor = project.color ?? '#4F9CF9';
  const rfisOpen     = items.reduce((n, i) => n + (i.rfiCount ?? 0), 0);
  const inProduction = items.filter(i => i.inProduction || i.status === 'Pre-Production').length;
  const itemsHanging = items.filter(i => (i.status ?? '').startsWith('On Hold')).length;
  const drawingCount = items.reduce((n, i) => n + (i.drawingCount ?? 0), 0);
  const today        = new Date();

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','ui-monospace', Consolas, monospace", padding: '24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <Link to="/" style={{ fontSize: 11, color: '#60a5fa', textDecoration: 'none', display: 'block', marginBottom: 6 }}>← All Projects</Link>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>{project.name}</h1>
          <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>Project detail view · {project.client ?? ''}</div>
        </div>
        <div style={{ fontSize: 11, color: C.textMut }}>
          {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      <QuickLogBar defaultProjectId={projectId} />

      {/* A: Project summary */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Project</div>
        <ProjectSummaryCard project={project} projectItems={items} />
      </section>

      {/* B: Three-week lookahead */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Lookahead</div>
        {itemLoading ? (
          <div style={{ color: C.textMut, fontSize: 12 }}>Loading items…</div>
        ) : (
          <MiniTimeline items={items} projectColor={projectColor} />
        )}
      </section>

      {/* C: Stats */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Activity</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatPanel label="RFIs Open"      value={rfisOpen}     valueColor="#f87171" />
          <StatPanel label="Drawings"       value={drawingCount} sub="Total drawings assigned" valueColor="#60a5fa" />
          <StatPanel label="Items Hanging"  value={itemsHanging} sub="On Hold status" valueColor="#fbbf24" />
          <StatPanel label="In Production"  value={inProduction} sub="Pre-Production or In Manufacture" valueColor="#34d399" />
          <StatPanel label="Total Items"    value={items.length} sub="Active items in this project" />
        </div>
      </section>

      {/* D: Phase table */}
      <section>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>DM Phase Summary</div>
        {itemLoading ? (
          <div style={{ color: C.textMut, fontSize: 12 }}>Loading items…</div>
        ) : (
          <PhaseTable items={items} projectColor={projectColor} />
        )}
      </section>
    </div>
  );
}
