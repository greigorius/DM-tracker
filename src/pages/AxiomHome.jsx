import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { DM_PHASES, PHASE_ORDER, STATUS_COLORS } from '../data/mockData.js';
import QuickLogBar from '../components/QuickLogBar.jsx';
import MiniTimeline from '../components/MiniTimeline.jsx';
import { PROJECT_COLORS, CLIENT_COLORS, assignProjectColors } from '../data/colors.js';
import { getCached, setCached } from '../hooks/usePageCache.js';

// ── Colours ───────────────────────────────────────────────────────────────────
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

// ── A: Client Cards ───────────────────────────────────────────────────────────
function DonutCenter({ children }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      {children}
    </div>
  );
}

function ClientCard({ client }) {
  const navigate    = useNavigate();
  const { projects } = client;
  const totalItems = projects.reduce((s, p) => s + (p.itemCount ?? 0), 0);
  const itemsData  = projects.map(p => ({ name: p.name, value: p.itemCount ?? 1, color: p.color }));

  const hoursData = projects.flatMap(p => {
    const spent     = p.hoursSpent    ?? 0;
    const remaining = Math.max(0, (p.hoursRequired ?? 0) - spent);
    return [
      { value: spent,     color: p.color },
      { value: remaining, color: hexToRgba(p.color, 0.2) },
    ];
  });
  const totalSpent     = projects.reduce((s, p) => s + (p.hoursSpent    ?? 0), 0);
  const totalRemaining = projects.reduce((s, p) => s + Math.max(0, (p.hoursRequired ?? 0) - (p.hoursSpent ?? 0)), 0);

  return (
    <div
      style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 24, cursor: 'pointer', transition: 'border-color 0.15s', minWidth: 500 }}
      onClick={() => navigate(`/client/${encodeURIComponent(client.name)}`)}
      onMouseEnter={e => e.currentTarget.style.borderColor = client.color}
      onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
    >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>{client.name}</span>
            <span style={{ fontSize: 10, color: C.textMut, marginLeft: 2 }}>{projects.length} projects</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {projects.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                <Link
                  to={`/project/${p.id}`}
                  onClick={e => e.stopPropagation()}
                  style={{ fontSize: 12, color: C.textSec, textDecoration: 'none', fontWeight: 500, flexShrink: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.color = p.color; }}
                  onMouseLeave={e => { e.currentTarget.style.color = C.textSec; }}
                >
                  {p.name}
                </Link>
                <span style={{ fontSize: 10, color: C.textMut }}>
                  {p.itemCount ?? '—'} items · {p.hoursSpent ?? 0}h/{p.hoursRequired ?? 0}h
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={itemsData} cx="50%" cy="50%" innerRadius={38} outerRadius={55} dataKey="value" strokeWidth={0}>
                {itemsData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <DonutCenter>
            <span style={{ fontSize: 24, fontWeight: 800, color: C.text, lineHeight: 1 }}>{totalItems || '—'}</span>
            <span style={{ fontSize: 9, color: C.textMut, marginTop: 1 }}>items</span>
          </DonutCenter>
        </div>

        <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={hoursData} cx="50%" cy="50%" innerRadius={38} outerRadius={55} dataKey="value" strokeWidth={0} startAngle={90} endAngle={-270}>
                {hoursData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <DonutCenter>
            <span style={{ fontSize: 21, fontWeight: 800, color: client.color, lineHeight: 1 }}>{totalSpent}h</span>
            <span style={{ fontSize: 9, color: C.textMut, marginTop: 2 }}>{totalRemaining}h left</span>
          </DonutCenter>
        </div>
    </div>
  );
}

// MiniTimeline imported from src/components/MiniTimeline.jsx

// ── C: Stat panels ────────────────────────────────────────────────────────────
function StatPanel({ label, value, sub, valueColor = C.text }) {
  return (
    <div style={{ flex: 1, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 18px', minWidth: 120 }}>
      <div style={{ fontSize: 32, fontWeight: 800, color: valueColor, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: C.textMut, marginTop: 4, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: C.textSec, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── D: DM Phase summary table ─────────────────────────────────────────────────
const COMPLETED_STATUSES = new Set(['PC Approved', 'In Manufacture', 'Complete', 'Omitted', 'Design Complete']);

function PhaseTable({ items }) {
  const [filterProject,  setFilterProject]  = useState('all');
  const [filterPhase,    setFilterPhase]    = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [activeOnly,     setActiveOnly]     = useState(true);

  const projects  = [...new Set(items.map(i => i.projectName).filter(Boolean))].sort();
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
          {projects.map(p => <option key={p} value={p}>{p}</option>)}
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
                <td style={{ padding: '8px 12px', width: 18 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.projectColor ?? C.textMut }} />
                </td>
                <td style={{ padding: '8px 12px', color: C.text, fontWeight: 500, whiteSpace: 'nowrap' }}>{item.name}</td>
                <td style={{ padding: '8px 12px' }}><StatusBadge status={item.status} /></td>
                <td style={{ padding: '8px 12px' }}><PhaseBadge phase={item.dmPhase} /></td>
                <td style={{ padding: '8px 12px', color: (item.rfiCount ?? 0) > 0 ? '#f87171' : C.textMut, fontSize: 11 }}>
                  {(item.rfiCount ?? 0) > 0 ? item.rfiCount : '—'}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  {item.assignee && <AssigneeChip assignee={item.assignee} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AxiomHome() {
  const [projects,     setProjects]     = useState([]);
  const [allItems,     setAllItems]     = useState([]);
  const [projLoading,  setProjLoading]  = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const abortRef = useRef(null);

  // Fetch projects (show cached immediately, refresh in background)
  useEffect(() => {
    const applyList = list => {
      const colorMap = assignProjectColors(list);
      setProjects(list.map(p => ({ ...p, color: colorMap.get(p.id) ?? PROJECT_COLORS[0], itemCount: null })));
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
  }, []);

  // Fetch items for all projects once project list is ready
  useEffect(() => {
    if (!projects.length) return;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const active = projects.filter(p => p.status !== 'Complete' && p.status !== 'Done');
    if (!active.length) return;

    setItemsLoading(true);
    let remaining = active.length;

    active.forEach(proj => {
      const applyData = data => {
        const items = (data.items || []).map(item => ({
          ...item,
          projectId:    proj.id,
          projectColor: proj.color,
          projectName:  proj.name,
        }));
        setAllItems(prev => [...prev.filter(i => i.projectId !== proj.id), ...items]);
        setProjects(prev => prev.map(p => p.id === proj.id ? { ...p, itemCount: data.summary?.total ?? items.length } : p));
      };
      const cached = getCached(`items:${proj.id}`);
      if (cached) applyData(cached);
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
  }, [projects.length]);

  // Build client hierarchy from projects
  const clients = (() => {
    const map = {};
    projects.forEach(p => {
      const name = p.client || 'Unknown';
      if (!map[name]) {
        const idx = Object.keys(map).length;
        map[name] = { id: name, name, color: CLIENT_COLORS[idx % CLIENT_COLORS.length], projects: [] };
      }
      map[name].projects.push(p);
    });
    return Object.values(map);
  })();

  // Stats derived from items
  const rfisOpen     = allItems.reduce((n, i) => n + (i.rfiCount ?? 0), 0);
  const tdlOpen      = allItems.reduce((n, i) => n + (i.tdlCount ?? 0), 0);
  const inProduction = allItems.filter(i => i.inProduction || i.status === 'Pre-Production').length;
  const itemsHanging = allItems.filter(i => (i.status ?? '').startsWith('On Hold')).length;
  const drawingCount = allItems.reduce((n, i) => n + (i.drawingCount ?? 0), 0);

  const today = new Date();

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','ui-monospace', Consolas, monospace", padding: '24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>DM Tracker</h1>
          <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>All clients overview</div>
        </div>
        <div style={{ fontSize: 11, color: C.textMut }}>
          {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      <QuickLogBar />

      {/* A: Clients */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Clients</div>
        {projLoading ? (
          <div style={{ color: C.textMut, fontSize: 12 }}>Loading projects…</div>
        ) : clients.length === 0 ? (
          <div style={{ color: C.textMut, fontSize: 12 }}>No projects found</div>
        ) : (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {clients.map(c => <ClientCard key={c.id} client={c} />)}
          </div>
        )}
      </section>

      {/* B: Three-week lookahead */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Lookahead</div>
        {itemsLoading && allItems.length === 0 ? (
          <div style={{ color: C.textMut, fontSize: 12 }}>Loading items…</div>
        ) : (
          <MiniTimeline items={allItems} />
        )}
      </section>

      {/* C: Stats */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Activity</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatPanel label="RFIs Open"       value={rfisOpen}     valueColor="#f87171" />
          <StatPanel label="Open TDL Items"  value={tdlOpen}      sub="To-Do List items across all projects" />
          <StatPanel label="Drawings"        value={drawingCount} sub="Total drawings assigned" valueColor="#60a5fa" />
          <StatPanel label="Action Required"  value={itemsHanging} sub="On Hold status" valueColor="#fbbf24" />
          <StatPanel label="In Production"   value={inProduction} sub="Pre-Production or In Manufacture" valueColor="#34d399" />
        </div>
      </section>

      {/* D: Phase table */}
      <section>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>DM Phase Summary</div>
        {itemsLoading && allItems.length === 0 ? (
          <div style={{ color: C.textMut, fontSize: 12 }}>Loading items…</div>
        ) : (
          <PhaseTable items={allItems} />
        )}
      </section>
    </div>
  );
}
