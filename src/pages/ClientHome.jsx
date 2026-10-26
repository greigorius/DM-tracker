import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { DM_PHASES, PHASE_ORDER, STATUS_COLORS } from '../data/mockData.js';
import { getCached, setCached } from '../hooks/usePageCache.js';
import QuickLogBar from '../components/QuickLogBar.jsx';
import MiniTimeline from '../components/MiniTimeline.jsx';
import { PROJECT_COLORS, CLIENT_COLORS, assignProjectColors } from '../data/colors.js';

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

// ── A: Project cards ──────────────────────────────────────────────────────────
function DonutCenter({ children }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      {children}
    </div>
  );
}

function ProjectCard({ project, allClientProjects }) {
  const totalItems = allClientProjects.reduce((s, p) => s + (p.itemCount ?? 0), 0);
  const itemsData  = allClientProjects.map(p => ({ name: p.name, value: p.itemCount ?? 1, color: p.color }));
  const hoursSpent = Math.ceil(project.hoursSpent ?? 0);
  const remaining  = Math.ceil(Math.max(0, (project.hoursRequired ?? 0) - (project.hoursSpent ?? 0)));
  const hoursData  = [
    { value: hoursSpent, color: project.color },
    { value: remaining,  color: hexToRgba(project.color, 0.2) },
  ];

  return (
    <Link to={`/project/${project.id}`} style={{ textDecoration: 'none' }}>
      <div
        style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 20, cursor: 'pointer', transition: 'border-color 0.15s', minWidth: 340 }}
        onMouseEnter={e => e.currentTarget.style.borderColor = project.color}
        onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: project.color, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{project.name}</span>
          </div>
          <div style={{ fontSize: 11, color: C.textSec }}>{project.itemCount ?? '—'} items</div>
          <div style={{ fontSize: 11, color: C.textMut }}>{project.hoursSpent ?? 0}h / {project.hoursRequired ?? 0}h</div>
        </div>

        <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={itemsData} cx="50%" cy="50%" innerRadius={34} outerRadius={50} dataKey="value" strokeWidth={0}>
                {itemsData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <DonutCenter>
            <span style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1 }}>{totalItems || '—'}</span>
            <span style={{ fontSize: 9, color: C.textMut, marginTop: 1 }}>items</span>
          </DonutCenter>
        </div>

        <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={hoursData} cx="50%" cy="50%" innerRadius={34} outerRadius={50} dataKey="value" strokeWidth={0} startAngle={90} endAngle={-270}>
                {hoursData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <DonutCenter>
            <span style={{ fontSize: 19, fontWeight: 800, color: project.color, lineHeight: 1 }}>{hoursSpent}h</span>
            <span style={{ fontSize: 9, color: C.textMut, marginTop: 2 }}>{remaining}h left</span>
          </DonutCenter>
        </div>
      </div>
    </Link>
  );
}

// MiniTimeline imported from src/components/MiniTimeline.jsx

// ── C: Stats ──────────────────────────────────────────────────────────────────
function StatPanel({ label, value, sub, valueColor = C.text }) {
  return (
    <div style={{ flex: 1, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 18px', minWidth: 120 }}>
      <div style={{ fontSize: 32, fontWeight: 800, color: valueColor, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: C.textMut, marginTop: 4, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: C.textSec, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── D: Phase table ────────────────────────────────────────────────────────────
const COMPLETED_STATUSES = new Set(['PC Approved', 'In Manufacture', 'Complete', 'Omitted', 'Design Complete', 'Close Out', 'On Site', 'Design Complete', 'Close Out', 'On Site']);

function PhaseTable({ items, projects }) {
  const [filterProject,  setFilterProject]  = useState('all');
  const [filterPhase,    setFilterPhase]    = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [activeOnly,     setActiveOnly]     = useState(true);

  const projNames = [...new Set(items.map(i => i.projectName).filter(Boolean))].sort();
  const phases    = [...new Set(items.map(i => i.dmPhase).filter(Boolean))].sort((a, b) => PHASE_ORDER.indexOf(a) - PHASE_ORDER.indexOf(b));
  const assignees = [...new Set(items.map(i => i.assignee).filter(Boolean))].sort();

  const visible = [...items]
    .filter(i => !activeOnly || !COMPLETED_STATUSES.has(i.status))
    .filter(i => filterProject  === 'all' || i.projectName === filterProject)
    .filter(i => filterPhase    === 'all' || i.dmPhase     === filterPhase)
    .filter(i => filterAssignee === 'all' || i.assignee    === filterAssignee)
    .sort((a, b) => PHASE_ORDER.indexOf(a.dmPhase) - PHASE_ORDER.indexOf(b.dmPhase));

  const selStyle = { background: '#0b1020', border: `1px solid #1e2d45`, color: '#94a3b8', fontSize: 10, borderRadius: 4, padding: '3px 6px', cursor: 'pointer' };
  const btnStyle = (active) => ({ background: active ? '#1e3a5f' : '#0b1020', border: `1px solid ${active ? '#60a5fa' : '#1e2d45'}`, color: active ? '#60a5fa' : '#94a3b8', fontSize: 10, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontWeight: active ? 700 : 400 });

  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.bgPanel, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, marginRight: 4 }}>DM Phase Summary</span>
        <select value={filterProject}  onChange={e => setFilterProject(e.target.value)}  style={selStyle}>
          <option value="all">All Projects</option>
          {projNames.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
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
              {['', 'Project', 'Item', 'Status', 'DM Phase', 'RFIs', 'Assignee'].map((h, i) => (
                <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: C.textMut, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '16px 12px', color: C.textMut, fontSize: 11, textAlign: 'center' }}>No items match filters</td></tr>
            ) : visible.map((item, idx) => (
              <tr key={item.id} style={{ background: idx % 2 === 0 ? C.bgCard : '#0b1020', borderBottom: `1px solid ${C.grid}` }}>
                <td style={{ padding: '8px 12px', width: 18 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: item.projectColor ?? C.textMut }} /></td>
                <td style={{ padding: '8px 12px', fontSize: 10, color: C.textMut, whiteSpace: 'nowrap' }}>{item.projectName ?? '—'}</td>
                <td style={{ padding: '8px 12px', color: C.text, fontWeight: 500, whiteSpace: 'nowrap' }}>{item.name}</td>
                <td style={{ padding: '8px 12px' }}><StatusBadge status={item.status} /></td>
                <td style={{ padding: '8px 12px' }}><PhaseBadge phase={item.dmPhase} /></td>
                <td style={{ padding: '8px 12px', color: (item.rfiCount ?? 0) > 0 ? '#f87171' : C.textMut, fontSize: 11 }}>{(item.rfiCount ?? 0) > 0 ? item.rfiCount : '—'}</td>
                <td style={{ padding: '8px 12px' }}>{item.assignee && <AssigneeChip assignee={item.assignee} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ClientHome() {
  const { clientId } = useParams();
  const clientName   = decodeURIComponent(clientId);

  const [allProjects,  setAllProjects]  = useState([]);
  const [items,        setItems]        = useState([]);
  const [projLoading,  setProjLoading]  = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    const applyList = list => {
      const colorMap = assignProjectColors(list);
      setAllProjects(list.map(p => ({ ...p, color: colorMap.get(p.id) ?? PROJECT_COLORS[0], itemCount: null })));
    };
    const cached = getCached('projects');
    if (cached) { applyList(cached); setProjLoading(false); return; }
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setCached('projects', list);
        applyList(list);
      })
      .catch(() => {})
      .finally(() => setProjLoading(false));
  }, []);

  const clientProjects = allProjects.filter(p => p.client === clientName);

  // Derive client color from index among all unique clients
  const clientColor = (() => {
    const allClients = [...new Set(allProjects.map(p => p.client || 'Unknown'))];
    const idx = allClients.indexOf(clientName);
    return CLIENT_COLORS[Math.max(0, idx) % CLIENT_COLORS.length];
  })();

  useEffect(() => {
    if (!clientProjects.length) return;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setItemsLoading(true);
    let remaining = clientProjects.length;

    clientProjects.forEach(proj => {
      const applyData = data => {
        const newItems = (data.items || []).map(item => ({
          ...item,
          projectId:    proj.id,
          projectColor: proj.color,
          projectName:  proj.name,
        }));
        setItems(prev => [...prev.filter(i => i.projectId !== proj.id), ...newItems]);
        setAllProjects(prev => prev.map(p => p.id === proj.id ? { ...p, itemCount: data.summary?.total ?? newItems.length } : p));
      };
      const cached = getCached(`items:${proj.id}`);
      if (cached) {
        applyData(cached);
        remaining--;
        if (remaining === 0) setItemsLoading(false);
        return;
      }
      fetch(`/api/projects/${proj.id}/items`, { signal: ctrl.signal })
        .then(r => r.json())
        .then(data => {
          if (ctrl.signal.aborted) return;
          setCached(`items:${proj.id}`, data);
          applyData(data);
        })
        .catch(e => { if (e.name !== 'AbortError') console.warn('[items]', proj.name, e.message); })
        .finally(() => {
          if (ctrl.signal.aborted) return;
          remaining--;
          if (remaining === 0) setItemsLoading(false);
        });
    });

    return () => ctrl.abort();
  }, [clientProjects.length, clientProjects.map(p => p.id).join(',')]);

  const rfisOpen     = items.reduce((n, i) => n + (i.rfiCount ?? 0), 0);
  const inProduction = items.filter(i => i.inProduction || i.status === 'Pre-Production' || i.status === 'In Production').length;
  const itemsHanging = items.filter(i => (i.status ?? '').startsWith('On Hold')).length;
  const drawingCount = items.reduce((n, i) => n + (i.drawingCount ?? 0), 0);
  const totalSpent   = clientProjects.reduce((s, p) => s + (p.hoursSpent ?? 0), 0);
  const totalRemaining = clientProjects.reduce((s, p) => s + Math.max(0, (p.hoursRequired ?? 0) - (p.hoursSpent ?? 0)), 0);

  const today = new Date();

  if (!projLoading && clientProjects.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: C.textSec, fontSize: 14 }}>
          Client "{clientName}" not found. <Link to="/" style={{ color: '#60a5fa' }}>← Back</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','ui-monospace', Consolas, monospace", padding: '24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <Link to="/" style={{ fontSize: 11, color: '#60a5fa', textDecoration: 'none', display: 'block', marginBottom: 6 }}>← All Clients</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {clientColor && <div style={{ width: 12, height: 12, borderRadius: '50%', background: clientColor }} />}
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>{clientName}</h1>
          </div>
          <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>
            {clientProjects.length} projects · {items.length} items
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.textMut }}>
          {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      <QuickLogBar />

      {/* A: Project cards */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Projects</div>
        {projLoading ? (
          <div style={{ color: C.textMut, fontSize: 12 }}>Loading projects…</div>
        ) : (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {clientProjects.map(p => <ProjectCard key={p.id} project={p} allClientProjects={clientProjects} />)}
          </div>
        )}
      </section>

      {/* B: Three-week lookahead */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Lookahead</div>
        {itemsLoading && items.length === 0 ? (
          <div style={{ color: C.textMut, fontSize: 12 }}>Loading items…</div>
        ) : (
          <MiniTimeline items={items} />
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
          <StatPanel label="Hours Spent"    value={`${totalSpent}h`} sub={`${totalRemaining}h remaining`} />
        </div>
      </section>

      {/* D: Phase table */}
      <section>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>DM Phase Summary</div>
        {itemsLoading && items.length === 0 ? (
          <div style={{ color: C.textMut, fontSize: 12 }}>Loading items…</div>
        ) : (
          <PhaseTable items={items} projects={clientProjects} />
        )}
      </section>
    </div>
  );
}
