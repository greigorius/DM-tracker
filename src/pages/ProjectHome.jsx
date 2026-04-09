import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { DM_PHASES, PHASE_ORDER, STATUS_COLORS } from '../data/mockData.js';
import { getCached, setCached } from '../hooks/usePageCache.js';
import QuickLogBar from '../components/QuickLogBar.jsx';
import MiniTimeline from '../components/MiniTimeline.jsx';
import { PROJECT_COLORS, assignProjectColors } from '../data/colors.js';

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

// ── Project summary card ──────────────────────────────────────────────────────
function ProjectSummaryCard({ project, projectItems }) {
  const hoursSpent     = Math.ceil(project.hoursSpent    ?? 0);
  const hoursRemaining = Math.ceil(Math.max(0, (project.hoursRequired ?? 0) - (project.hoursSpent ?? 0)));
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

      <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={phaseData.length ? phaseData : [{ value: 1, color: C.border }]} cx="50%" cy="50%" innerRadius={34} outerRadius={50} dataKey="value" strokeWidth={0}>
              {(phaseData.length ? phaseData : [{ color: C.border }]).map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: C.text, lineHeight: 1 }}>{projectItems.length}</span>
          <span style={{ fontSize: 9, color: C.textMut, marginTop: 1 }}>items</span>
        </div>
      </div>

      <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={hoursData} cx="50%" cy="50%" innerRadius={34} outerRadius={50} dataKey="value" strokeWidth={0} startAngle={90} endAngle={-270}>
              {hoursData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: projectColor, lineHeight: 1 }}>{hoursSpent}h</span>
          <span style={{ fontSize: 9, color: C.textMut, marginTop: 2 }}>{hoursRemaining}h left</span>
        </div>
      </div>
    </div>
  );
}

// MiniTimeline imported from src/components/MiniTimeline.jsx

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
const COMPLETED_STATUSES = new Set(['PC Approved', 'In Manufacture', 'Complete', 'Omitted', 'Design Complete']);

function PhaseTable({ items, projectColor }) {
  const [filterPhase,    setFilterPhase]    = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [activeOnly,     setActiveOnly]     = useState(true);

  const phases    = [...new Set(items.map(i => i.dmPhase).filter(Boolean))].sort((a, b) => PHASE_ORDER.indexOf(a) - PHASE_ORDER.indexOf(b));
  const assignees = [...new Set(items.map(i => i.assignee).filter(Boolean))].sort();

  const visible = [...items]
    .filter(i => !activeOnly || !COMPLETED_STATUSES.has(i.status))
    .filter(i => filterPhase    === 'all' || i.dmPhase  === filterPhase)
    .filter(i => filterAssignee === 'all' || i.assignee === filterAssignee)
    .sort((a, b) => PHASE_ORDER.indexOf(a.dmPhase) - PHASE_ORDER.indexOf(b.dmPhase));

  const selStyle = { background: '#0b1020', border: `1px solid #1e2d45`, color: '#94a3b8', fontSize: 10, borderRadius: 4, padding: '3px 6px', cursor: 'pointer' };
  const btnStyle = (active) => ({ background: active ? '#1e3a5f' : '#0b1020', border: `1px solid ${active ? '#60a5fa' : '#1e2d45'}`, color: active ? '#60a5fa' : '#94a3b8', fontSize: 10, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontWeight: active ? 700 : 400 });

  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.bgPanel, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, marginRight: 4 }}>DM Phase Summary</span>
        <select value={filterPhase}    onChange={e => setFilterPhase(e.target.value)}    style={selStyle}>
          <option value="all">All Phases</option>
          {phases.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={selStyle}>
          <option value="all">All Assignees</option>
          {assignees.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button style={btnStyle(activeOnly)} onClick={() => setActiveOnly(v => !v)}>
          {activeOnly ? 'Active only' : 'Show all'}
        </button>
        <span style={{ fontSize: 10, color: C.textMut, marginLeft: 'auto' }}>{visible.length} items</span>
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
            {visible.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '16px 12px', color: C.textMut, fontSize: 11, textAlign: 'center' }}>No items match filters</td></tr>
            ) : visible.map((item, idx) => (
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

  // Fetch project metadata (show cached immediately, refresh in background)
  useEffect(() => {
    const applyList = list => {
      const found = list.find(p => p.id === projectId);
      if (found) {
        const colorMap = assignProjectColors(list);
        setProject({ ...found, color: colorMap.get(found.id) ?? PROJECT_COLORS[0] });
      }
    };
    const cached = getCached('projects');
    if (cached) { applyList(cached); setProjLoading(false); }
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setCached('projects', list);
        applyList(list);
      })
      .catch(() => {})
      .finally(() => setProjLoading(false));
  }, [projectId]);

  // Fetch project items (show cached immediately, refresh in background)
  useEffect(() => {
    let cancelled = false;
    const cached = getCached(`items:${projectId}`);
    if (cached) { setItems(cached.items || []); setItemLoading(false); }
    setItemLoading(true);
    fetch(`/api/projects/${projectId}/items`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled) {
          setCached(`items:${projectId}`, data);
          setItems(data.items || []);
        }
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
          <StatPanel label="Action Required" value={itemsHanging} sub="On Hold status" valueColor="#fbbf24" />
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
