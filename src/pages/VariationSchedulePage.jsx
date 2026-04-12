import { useState, useEffect } from 'react';
import AppNav from '../components/AppNav.jsx';
import { assignProjectColors, PROJECT_COLORS, ITEM_STATUS_COLORS, ITEM_STATUS_DEFAULT } from '../data/colors.js';
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

const VAR_STATUS_COLORS = {
  'Approved':          '#34d399',
  'Pending':           '#60a5fa',
  'Under Review':      '#a78bfa',
  'Rejected':          '#f87171',
  'On Hold':           '#f97316',
  'Draft':             '#f59e0b',
  'Submitted':         '#38bdf8',
  'Partially Approved':'#4ade80',
};

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function fmtDate(str) {
  if (!str) return null;
  return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

function fmtCurrency(val) {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

function StatusPill({ status }) {
  if (!status) return <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
  const color = VAR_STATUS_COLORS[status] ?? C.sec;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      background: hexToRgba(color, 0.12), color,
      border: `1px solid ${hexToRgba(color, 0.3)}`,
      borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap',
    }}>{status}</span>
  );
}

// ── Selects ───────────────────────────────────────────────────────────────────
const selStyle = { background: C.input, border: `1px solid ${C.border}`, color: C.sec, fontSize: 10, borderRadius: 4, padding: '3px 6px', cursor: 'pointer', fontFamily: 'inherit' };

// ── Global status summary bar ─────────────────────────────────────────────────
function GlobalStatusBar({ variations }) {
  const counts = {};
  for (const v of variations) {
    const s = v.status ?? 'Unknown';
    counts[s] = (counts[s] ?? 0) + 1;
  }
  const totalValue = variations.reduce((sum, v) => sum + (v.value ?? 0), 0);

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18, padding: '10px 14px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, alignItems: 'center' }}>
      {Object.entries(counts).sort((a,b) => b[1]-a[1]).map(([s, n]) => {
        const color = VAR_STATUS_COLORS[s] ?? C.sec;
        return (
          <span key={s} style={{ fontSize: 10, fontWeight: 700, background: hexToRgba(color, 0.1), color, border: `1px solid ${hexToRgba(color, 0.25)}`, borderRadius: 4, padding: '3px 8px' }}>
            {s} <span style={{ opacity: 0.7 }}>· {n}</span>
          </span>
        );
      })}
      <span style={{ marginLeft: 'auto', fontSize: 10, color: C.muted }}>
        {variations.length} variations
        {totalValue > 0 && <span style={{ marginLeft: 10, color: C.sec, fontWeight: 700 }}>{fmtCurrency(totalValue)}</span>}
      </span>
    </div>
  );
}

const btnStyle = active => ({ background: active ? '#1e3a5f' : C.input, border: `1px solid ${active ? '#60a5fa' : C.border}`, color: active ? '#60a5fa' : C.sec, fontSize: 10, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontWeight: active ? 700 : 400, fontFamily: 'inherit' });

// ── Column headers ────────────────────────────────────────────────────────────
const COLS = ['Var #', 'Title', 'Status', 'Type', 'Value', 'Date Issued', 'Date Approved'];

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

// ── Variation Row ─────────────────────────────────────────────────────────────
function VariationRow({ variation: v, odd }) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      style={{ background: hovered ? C.bgPanel : (odd ? '#0b1020' : C.bgCard), borderBottom: `1px solid ${C.grid}`, transition: 'background 0.1s' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Var # */}
      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', width: 60 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa' }}>
          {v.varNumber != null ? `VAR-${v.varNumber}` : '—'}
        </span>
      </td>
      {/* Title */}
      <td style={{ padding: '8px 12px', maxWidth: 320 }}>
        <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{v.title ?? '—'}</div>
        {v.description && v.description !== v.title && (
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{v.description}</div>
        )}
      </td>
      {/* Status */}
      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
        <StatusPill status={v.status} />
      </td>
      {/* Type */}
      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
        {v.type
          ? <span style={{ fontSize: 10, color: C.sec, background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 6px' }}>{v.type}</span>
          : <span style={{ color: C.muted, fontSize: 10 }}>—</span>}
      </td>
      {/* Value */}
      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 11, fontWeight: v.value != null ? 700 : 400, color: v.value != null ? C.text : C.muted }}>
          {fmtCurrency(v.value)}
        </span>
      </td>
      {/* Date Issued */}
      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 11, color: C.sec }}>{v.dateIssued ? fmtDate(v.dateIssued) : '—'}</span>
      </td>
      {/* Date Approved */}
      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 11, color: v.dateApproved ? '#34d399' : C.muted }}>
          {v.dateApproved ? fmtDate(v.dateApproved) : '—'}
        </span>
      </td>
    </tr>
  );
}

// ── Not configured notice ─────────────────────────────────────────────────────
function NotConfiguredNotice() {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.sec, marginBottom: 8 }}>Variations database not configured</div>
      <div style={{ fontSize: 11, color: C.muted, maxWidth: 400, margin: '0 auto' }}>
        Add the <code style={{ color: '#60a5fa', background: C.bgDeep, padding: '1px 5px', borderRadius: 3 }}>NOTION_DB_VARIATIONS</code> environment variable to connect your Notion Variations database.
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function VariationSchedulePage() {
  const [variations,    setVariations]    = useState([]);
  const [projects,      setProjects]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [configured,    setConfigured]    = useState(true);
  const [refreshKey,    setRefreshKey]    = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const [filterProject, setFilterProject] = useState('all');
  const [filterStatus,  setFilterStatus]  = useState('all');
  const [groupBy,       setGroupBy]       = useState('item');   // 'item' | 'project'
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
    const cached = getCached('variations');
    if (cached) {
      setVariations(cached.items ?? []);
      setConfigured(cached.configured ?? true);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch('/api/variations')
      .then(r => r.json())
      .then(d => {
        setCached('variations', d);
        setVariations(d.items ?? []);
        setConfigured(d.configured ?? false);
        setLastRefreshed(new Date());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  // Build color map
  const allProjectIds = [...new Set([...projects.map(p => p.id), ...variations.map(v => v.projectId).filter(Boolean)])];
  const colorMap = assignProjectColors(allProjectIds.map(id => ({ id })));

  // Filter options
  const statusOptions = [...new Set(variations.map(v => v.status).filter(Boolean))].sort();

  // Apply filters
  const visible = variations.filter(v => {
    if (filterProject !== 'all' && v.projectId !== filterProject) return false;
    if (filterStatus  !== 'all' && v.status    !== filterStatus)  return false;
    return true;
  });

  // Group by item or project
  const grouped = [];
  const seen = new Map();
  for (const v of visible) {
    const key = groupBy === 'item'
      ? (v.itemName ?? 'No Item')
      : (v.projectName ?? 'No Project');
    if (!seen.has(key)) { seen.set(key, []); grouped.push({ key, projectId: v.projectId, variations: seen.get(key) }); }
    seen.get(key).push(v);
  }
  grouped.sort((a, b) => a.key.localeCompare(b.key));

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','ui-monospace',monospace", padding: '24px 32px' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>VARIATION SCHEDULE</h1>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Contract variations · grouped by {groupBy}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 11, color: C.muted }}>
            {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          {lastRefreshed && <span style={{ fontSize: 10, color: C.muted }}>updated {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={() => { setCached('variations', null); setRefreshKey(k => k + 1); }} title="Refresh" style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontSize: 11, padding: '3px 8px', cursor: 'pointer', lineHeight: 1 }}>↻</button>
        </div>
      </div>

      <AppNav />

      {/* Not configured */}
      {!loading && !configured && <NotConfiguredNotice />}

      {/* Global status bar */}
      {!loading && configured && visible.length > 0 && <GlobalStatusBar variations={visible} />}

      {/* Filter bar */}
      {configured && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={selStyle}>
            <option value="all">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
            <option value="all">All Statuses</option>
            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{ fontSize: 10, color: C.muted, marginLeft: 4 }}>Group by:</span>
          {['item','project'].map(g => (
            <button key={g} style={btnStyle(groupBy === g)} onClick={() => setGroupBy(g)}>
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
          <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>
            {loading ? 'Loading…' : `${visible.length} variations`}
          </span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ color: C.muted, fontSize: 12 }}>Loading variations…</div>
      ) : !configured ? null : visible.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 12 }}>No variations match filters</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {grouped.map(({ key, projectId, variations: groupVars }) => {
            const projColor  = projectId ? (colorMap.get(projectId) ?? PROJECT_COLORS[0]) : PROJECT_COLORS[0];
            const isExpanded = expanded[key] !== false; // open by default
            const groupValue = groupVars.reduce((sum, v) => sum + (v.value ?? 0), 0);

            return (
              <div
                key={key}
                style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `3px solid ${projColor}`, borderRadius: 10, overflow: 'hidden', boxShadow: `0 2px 12px ${hexToRgba(projColor, 0.12)}` }}
              >
                {/* Group header */}
                <div
                  onClick={() => setExpanded(prev => ({ ...prev, [key]: prev[key] !== false ? false : true }))}
                  style={{ padding: '10px 16px', background: C.bgPanel, borderBottom: isExpanded ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                >
                  <span style={{ fontSize: 11, color: C.muted, width: 12, flexShrink: 0 }}>{isExpanded ? '▾' : '▸'}</span>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: projColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{key}</span>
                  <span style={{ fontSize: 10, color: C.muted }}>{groupVars.length} variation{groupVars.length !== 1 ? 's' : ''}</span>
                  {groupValue > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.sec, marginLeft: 4 }}>{fmtCurrency(groupValue)}</span>
                  )}
                </div>

                {/* Variation table */}
                {isExpanded && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <TableHead />
                      <tbody>
                        {groupVars.map((v, idx) => (
                          <VariationRow key={v.id} variation={v} odd={idx % 2 !== 0} />
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
