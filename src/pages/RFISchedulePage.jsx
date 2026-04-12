import { useState, useEffect } from 'react';
import AppNav from '../components/AppNav.jsx';
import { assignProjectColors, PROJECT_COLORS } from '../data/colors.js';
import { getCached, setCached } from '../hooks/usePageCache.js';

// ── Theme ─────────────────────────────────────────────────────────────────────
const C = {
  bg:      '#0a0f1a',
  bgCard:  '#0d1525',
  bgPanel: '#0d1830',
  bgDeep:  '#080e18',
  border:  '#1e2d45',
  text:    '#e2e8f0',
  sec:     '#94a3b8',
  muted:   '#7b90b0',
  grid:    '#1a2540',
  input:   '#0b1020',
};

const RFI_STATUS_COLORS = {
  'Open':         '#f59e0b',
  'Closed':       '#34d399',
  'Pending':      '#60a5fa',
  'On Hold':      '#f97316',
  'In Review':    '#a78bfa',
  'TBC':          '#94a3b8',
};

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function StatusPill({ status }) {
  if (!status) return <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
  const color = RFI_STATUS_COLORS[status] ?? C.sec;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      background: hexToRgba(color, 0.12), color,
      border: `1px solid ${hexToRgba(color, 0.3)}`,
      borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap',
    }}>{status}</span>
  );
}

// ── Selects / Buttons ─────────────────────────────────────────────────────────
const selStyle = { background: C.input, border: `1px solid ${C.border}`, color: C.sec, fontSize: 10, borderRadius: 4, padding: '3px 6px', cursor: 'pointer', fontFamily: 'inherit' };

// ── Global status summary bar ─────────────────────────────────────────────────
function GlobalStatusBar({ rfis }) {
  const counts = {};
  for (const rfi of rfis) {
    const s = rfi.status ?? 'Unknown';
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18, padding: '10px 14px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8 }}>
      {Object.entries(counts).sort((a,b) => b[1]-a[1]).map(([s, n]) => {
        const color = RFI_STATUS_COLORS[s] ?? C.sec;
        return (
          <span key={s} style={{ fontSize: 10, fontWeight: 700, background: hexToRgba(color, 0.1), color, border: `1px solid ${hexToRgba(color, 0.25)}`, borderRadius: 4, padding: '3px 8px' }}>
            {s} <span style={{ opacity: 0.7 }}>· {n}</span>
          </span>
        );
      })}
      <span style={{ marginLeft: 'auto', fontSize: 10, color: C.muted, alignSelf: 'center' }}>
        {rfis.length} RFIs total
      </span>
    </div>
  );
}

// ── Column headers ────────────────────────────────────────────────────────────
const COLS = ['RFI #', 'Description', 'Status', 'TBC By', 'Related Items'];

function TableHead() {
  return (
    <thead>
      <tr style={{ background: '#0b1020', borderBottom: `1px solid ${C.border}` }}>
        {COLS.map(h => (
          <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
        ))}
      </tr>
    </thead>
  );
}

// ── RFI Row ───────────────────────────────────────────────────────────────────
function RFIRow({ rfi, odd }) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      style={{ background: hovered ? C.bgPanel : (odd ? '#0b1020' : C.bgCard), borderBottom: `1px solid ${C.grid}`, transition: 'background 0.1s' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', width: 70 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa' }}>
          RFI-{rfi.rfiNumber ?? '?'}
        </span>
      </td>
      <td style={{ padding: '8px 12px', maxWidth: 340 }}>
        <span style={{ fontSize: 12, color: C.text }}>{rfi.description ?? '—'}</span>
      </td>
      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
        <StatusPill status={rfi.status} />
      </td>
      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 11, color: C.sec }}>{rfi.tbcBy ?? '—'}</span>
      </td>
      <td style={{ padding: '8px 12px' }}>
        {(rfi.relatedItemNames ?? []).length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {rfi.relatedItemNames.map((name, i) => (
              <span key={i} style={{ fontSize: 10, color: C.muted, background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 3, padding: '1px 6px' }}>{name}</span>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: 10, color: C.muted }}>—</span>
        )}
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RFISchedulePage() {
  const [rfis,          setRfis]          = useState([]);
  const [projects,      setProjects]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshKey,    setRefreshKey]    = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const [filterProject, setFilterProject] = useState('all');
  const [filterStatus,  setFilterStatus]  = useState('all');
  const [expanded,      setExpanded]      = useState({});

  const today = new Date();

  useEffect(() => {
    const id = setInterval(() => setRefreshKey(k => k + 1), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const cached = getCached('projects');
    if (cached) setProjects(cached);
    else {
      fetch('/api/projects').then(r => r.json())
        .then(d => { const list = Array.isArray(d) ? d : []; setCached('projects', list); setProjects(list); })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const cached = getCached('rfi-schedule');
    if (cached) { setRfis(cached); setLoading(false); return; }
    setLoading(true);
    fetch('/api/rfi-schedule')
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : [];
        setCached('rfi-schedule', list);
        setRfis(list);
        setLastRefreshed(new Date());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  // Build color map
  const allProjectIds = [...new Set([...projects.map(p => p.id), ...rfis.map(r => r.projectId).filter(Boolean)])];
  const colorMap = assignProjectColors(allProjectIds.map(id => ({ id })));

  // Filter options
  const statusOptions = [...new Set(rfis.map(r => r.status).filter(Boolean))].sort();

  // Apply filters
  const visible = rfis.filter(r => {
    if (filterProject !== 'all' && r.projectId !== filterProject) return false;
    if (filterStatus  !== 'all' && r.status    !== filterStatus)  return false;
    return true;
  });

  // Group by project
  const grouped = [];
  const seen = new Map();
  for (const rfi of visible) {
    const key = rfi.projectName ?? 'No Project';
    if (!seen.has(key)) { seen.set(key, []); grouped.push({ key, projectId: rfi.projectId, rfis: seen.get(key) }); }
    seen.get(key).push(rfi);
  }
  grouped.sort((a, b) => a.key.localeCompare(b.key));

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','ui-monospace',monospace", padding: '24px 32px' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>RFI SCHEDULE</h1>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Requests for information · grouped by project</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 11, color: C.muted }}>
            {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          {lastRefreshed && <span style={{ fontSize: 10, color: C.muted }}>updated {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={() => { setCached('rfi-schedule', null); setRefreshKey(k => k + 1); }} title="Refresh" style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontSize: 11, padding: '3px 8px', cursor: 'pointer', lineHeight: 1 }}>↻</button>
        </div>
      </div>

      <AppNav />

      {/* Global status bar */}
      {!loading && visible.length > 0 && <GlobalStatusBar rfis={visible} />}

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={selStyle}>
          <option value="all">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
          <option value="all">All Statuses</option>
          {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>
          {loading ? 'Loading…' : `${visible.length} RFIs`}
        </span>
      </div>

      {/* Content */}
      {loading && rfis.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 12 }}>Loading RFIs…</div>
      ) : visible.length === 0 && !loading ? (
        <div style={{ color: C.muted, fontSize: 12 }}>No RFIs match filters</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {grouped.map(({ key, projectId, rfis: groupRfis }) => {
            const projColor  = projectId ? (colorMap.get(projectId) ?? PROJECT_COLORS[0]) : PROJECT_COLORS[0];
            const isExpanded = !!expanded[key];

            // Open / closed counts for this group
            const openCount   = groupRfis.filter(r => r.status === 'Open').length;
            const closedCount = groupRfis.filter(r => r.status === 'Closed').length;

            return (
              <div
                key={key}
                style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `3px solid ${projColor}`, borderRadius: 10, overflow: 'hidden', boxShadow: `0 2px 12px ${hexToRgba(projColor, 0.12)}` }}
              >
                {/* Group header */}
                <div
                  onClick={() => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))}
                  style={{ padding: '10px 16px', background: C.bgPanel, borderBottom: isExpanded ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                >
                  <span style={{ fontSize: 11, color: C.muted, width: 12, flexShrink: 0 }}>{isExpanded ? '▾' : '▸'}</span>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: projColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{key}</span>
                  <span style={{ fontSize: 10, color: C.muted }}>{groupRfis.length} RFI{groupRfis.length !== 1 ? 's' : ''}</span>
                  {openCount > 0 && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', background: hexToRgba('#f59e0b', 0.12), borderRadius: 3, padding: '1px 6px' }}>
                      {openCount} open
                    </span>
                  )}
                  {closedCount > 0 && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#34d399', background: hexToRgba('#34d399', 0.12), borderRadius: 3, padding: '1px 6px' }}>
                      {closedCount} closed
                    </span>
                  )}
                </div>

                {/* RFI table */}
                {isExpanded && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <TableHead />
                      <tbody>
                        {groupRfis.map((rfi, idx) => (
                          <RFIRow key={rfi.id} rfi={rfi} odd={idx % 2 !== 0} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
