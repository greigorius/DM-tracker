import { useState, useEffect, useCallback, useRef } from 'react';
import AppNav from '../components/AppNav.jsx';
import { assignProjectColors, PROJECT_COLORS } from '../data/colors.js';
import { getCached, setCached } from '../hooks/usePageCache.js';
import {
  initColConfig, persistColConfig, mergeVisibleCols, exportToCSV,
  ColumnConfigPanel, SharedTableHead,
} from '../components/TableConfig.jsx';

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
  'Approved':           '#34d399',
  'Pending':            '#60a5fa',
  'Under Review':       '#a78bfa',
  'Rejected':           '#f87171',
  'On Hold':            '#f97316',
  'Draft':              '#f59e0b',
  'Submitted':          '#38bdf8',
  'Partially Approved': '#4ade80',
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

// ── Column config ─────────────────────────────────────────────────────────────
const DEFAULT_COLUMNS = [
  { key: 'varNumber',    label: 'Var #',        defaultWidth: 80,  minWidth: 60,  align: 'left'   },
  { key: 'title',        label: 'Title',        defaultWidth: 280, minWidth: 120, align: 'left'   },
  { key: 'status',       label: 'Status',       defaultWidth: 130, minWidth: 70,  align: 'center' },
  { key: 'type',         label: 'Type',         defaultWidth: 110, minWidth: 60,  align: 'center' },
  { key: 'value',        label: 'Value',        defaultWidth: 110, minWidth: 70,  align: 'center' },
  { key: 'dateIssued',   label: 'Date Issued',  defaultWidth: 100, minWidth: 70,  align: 'center' },
  { key: 'dateApproved', label: 'Date Approved',defaultWidth: 110, minWidth: 70,  align: 'center' },
];
const COL_CONFIG_KEY = 'dmtracker:variations-col-config';

// ── Styles ────────────────────────────────────────────────────────────────────
const selStyle = { background: C.input, border: `1px solid ${C.border}`, color: C.sec, fontSize: 10, borderRadius: 4, padding: '3px 6px', cursor: 'pointer', fontFamily: 'inherit' };
const btnStyle = active => ({ background: active ? '#1e3a5f' : C.input, border: `1px solid ${active ? '#60a5fa' : C.border}`, color: active ? '#60a5fa' : C.sec, fontSize: 10, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontWeight: active ? 700 : 400, fontFamily: 'inherit' });

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

// ── Variation cell renderer ───────────────────────────────────────────────────
function VarCell({ v, colKey }) {
  switch (colKey) {
    case 'varNumber':
      return <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa' }}>{v.varNumber != null ? `VAR-${v.varNumber}` : '—'}</span>;
    case 'title':
      return (
        <div>
          <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{v.title ?? '—'}</div>
          {v.description && v.description !== v.title && (
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{v.description}</div>
          )}
        </div>
      );
    case 'status':
      return <StatusPill status={v.status} />;
    case 'type':
      return v.type
        ? <span style={{ fontSize: 10, color: C.sec, background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 6px' }}>{v.type}</span>
        : <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
    case 'value':
      return <span style={{ fontSize: 11, fontWeight: v.value != null ? 700 : 400, color: v.value != null ? C.text : C.muted }}>{fmtCurrency(v.value)}</span>;
    case 'dateIssued':
      return <span style={{ fontSize: 11, color: C.sec }}>{v.dateIssued ? fmtDate(v.dateIssued) : '—'}</span>;
    case 'dateApproved':
      return <span style={{ fontSize: 11, color: v.dateApproved ? '#34d399' : C.muted }}>{v.dateApproved ? fmtDate(v.dateApproved) : '—'}</span>;
    default:
      return <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
  }
}

// ── Variation Row ─────────────────────────────────────────────────────────────
function VariationRow({ variation: v, odd, visibleCols }) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      style={{ background: hovered ? C.bgPanel : (odd ? '#0b1020' : C.bgCard), borderBottom: `1px solid ${C.grid}`, transition: 'background 0.1s' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {visibleCols.map(col => (
        <td key={col.key} style={{
          padding: '8px 10px',
          textAlign: col.align ?? 'center',
          width: col.width,
          maxWidth: col.width,
          overflow: 'hidden',
          whiteSpace: col.key === 'title' ? 'normal' : 'nowrap',
        }}>
          <VarCell v={v} colKey={col.key} />
        </td>
      ))}
    </tr>
  );
}

// ── CSV raw getter ────────────────────────────────────────────────────────────
function varRaw(v, key) {
  switch (key) {
    case 'varNumber':    return v.varNumber != null ? `VAR-${v.varNumber}` : '';
    case 'title':        return v.title ?? '';
    case 'status':       return v.status ?? '';
    case 'type':         return v.type ?? '';
    case 'value':        return v.value != null ? String(v.value) : '';
    case 'dateIssued':   return v.dateIssued ?? '';
    case 'dateApproved': return v.dateApproved ?? '';
    default:             return '';
  }
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
  const [groupBy,       setGroupBy]       = useState('item');   // 'item' | 'project' | 'type' | 'status' | 'none'
  const [expanded,      setExpanded]      = useState({});
  const [showColPanel,  setShowColPanel]  = useState(false);
  const [sortBy,        setSortBy]        = useState('varNumber'); // 'varNumber' | 'dateIssued'
  const [sortDir,       setSortDir]       = useState('asc');       // 'asc' | 'desc'

  const [colConfig, setColConfig] = useState(() => initColConfig(DEFAULT_COLUMNS, COL_CONFIG_KEY));
  const colConfigRef = useRef(colConfig);

  const today = new Date();

  // Persist col config
  useEffect(() => { colConfigRef.current = colConfig; persistColConfig(colConfig, COL_CONFIG_KEY); }, [colConfig]);

  // Auto-refresh timer
  useEffect(() => {
    const id = setInterval(() => setRefreshKey(k => k + 1), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Projects
  useEffect(() => {
    const cached = getCached('projects');
    if (cached) setProjects(cached);
    else {
      fetch('/api/projects').then(r => r.json())
        .then(d => { const list = Array.isArray(d) ? d : []; setCached('projects', list); setProjects(list); })
        .catch(() => {});
    }
  }, []);

  // Variations
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

  // Column resize
  const startResize = useCallback((e, colKey) => {
    const startX = e.clientX;
    const startW = colConfigRef.current.find(c => c.key === colKey)?.width ?? 100;
    const minW   = DEFAULT_COLUMNS.find(c => c.key === colKey)?.minWidth ?? 40;
    const onMove = me => {
      const newW = Math.max(minW, startW + (me.clientX - startX));
      setColConfig(prev => prev.map(c => c.key === colKey ? { ...c, width: newW } : c));
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const visibleCols = mergeVisibleCols(colConfig, DEFAULT_COLUMNS);

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

  // Sort
  const sortedVisible = [...visible].sort((a, b) => {
    let va, vb;
    if (sortBy === 'dateIssued') {
      va = a.dateIssued ?? '';
      vb = b.dateIssued ?? '';
    } else {
      va = a.varNumber ?? 0;
      vb = b.varNumber ?? 0;
      const cmp = va - vb;
      return sortDir === 'desc' ? -cmp : cmp;
    }
    const cmp = String(va).localeCompare(String(vb));
    return sortDir === 'desc' ? -cmp : cmp;
  });

  // Group
  const grouped = (() => {
    if (groupBy === 'none') return [{ key: '__none__', projectId: null, variations: sortedVisible }];
    const map = new Map();
    const list = [];
    for (const v of sortedVisible) {
      const key =
        groupBy === 'item'    ? (v.itemName    ?? 'No Item')    :
        groupBy === 'type'    ? (v.type        ?? 'No Type')    :
        groupBy === 'status'  ? (v.status      ?? 'No Status')  :
                                (v.projectName ?? 'No Project');
      if (!map.has(key)) { map.set(key, []); list.push({ key, projectId: v.projectId, variations: map.get(key) }); }
      map.get(key).push(v);
    }
    list.sort((a, b) => a.key.localeCompare(b.key));
    return list;
  })();

  const allKeys = grouped.map(g => g.key);
  const expandAll   = () => setExpanded(Object.fromEntries(allKeys.map(k => [k, true])));
  const collapseAll = () => setExpanded(Object.fromEntries(allKeys.map(k => [k, false])));
  const isExpanded  = key => expanded[key] !== false;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','ui-monospace',monospace", padding: '24px 32px' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>VARIATION SCHEDULE</h1>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Contract variations</div>
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

      {/* Filter + toolbar */}
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

          <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
            style={{ ...selStyle, marginLeft: 4, borderColor: '#2d4a6e', color: '#93c5fd' }}>
            <option value="item">Group: Item</option>
            <option value="project">Group: Project</option>
            <option value="type">Group: Type</option>
            <option value="status">Group: Status</option>
            <option value="none">No Grouping</option>
          </select>

          {/* Sort */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd' }}>
            <option value="varNumber">Sort: Var #</option>
            <option value="dateIssued">Sort: Date Issued</option>
          </select>
          <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd', minWidth: 32 }}
            title={sortDir === 'asc' ? 'Ascending' : 'Descending'}>
            {sortDir === 'asc' ? '↑' : '↓'}
          </button>

          {groupBy !== 'none' && <>
            <button onClick={expandAll}   style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd' }}>Expand All</button>
            <button onClick={collapseAll} style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd' }}>Collapse All</button>
          </>}

          <button onClick={() => setShowColPanel(true)} style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd' }}>⚙ Columns</button>

          <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>
            {loading ? 'Loading…' : `${visible.length} variations`}
          </span>
          <button
            onClick={() => exportToCSV(visibleCols, sortedVisible, varRaw, `variation-schedule-${new Date().toISOString().slice(0,10)}.csv`)}
            title="Export current view to CSV"
            style={{ ...selStyle, borderColor: '#166534', color: '#4ade80' }}
          >↓ Export CSV (current view)</button>
        </div>
      )}

      {/* Column config panel */}
      {showColPanel && (
        <ColumnConfigPanel
          colConfig={colConfig}
          defaults={DEFAULT_COLUMNS}
          onClose={() => setShowColPanel(false)}
          onChange={cfg => { setColConfig(cfg); persistColConfig(cfg, COL_CONFIG_KEY); }}
        />
      )}

      {/* Content */}
      {loading ? (
        <div style={{ color: C.muted, fontSize: 12 }}>Loading variations…</div>
      ) : !configured ? null : visible.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 12 }}>No variations match filters</div>
      ) : groupBy === 'none' ? (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <SharedTableHead visibleCols={visibleCols} onResizeStart={startResize} />
              <tbody>
                {visible.map((v, idx) => (
                  <VariationRow key={v.id} variation={v} odd={idx % 2 !== 0} visibleCols={visibleCols} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {grouped.map(({ key, projectId, variations: groupVars }) => {
            const projColor  = projectId ? (colorMap.get(projectId) ?? PROJECT_COLORS[0]) : PROJECT_COLORS[0];
            const open       = isExpanded(key);
            const groupValue = groupVars.reduce((sum, v) => sum + (v.value ?? 0), 0);

            return (
              <div
                key={key}
                style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `3px solid ${projColor}`, borderRadius: 10, overflow: 'hidden', boxShadow: `0 2px 12px ${hexToRgba(projColor, 0.12)}` }}
              >
                {/* Group header */}
                <div
                  onClick={() => setExpanded(prev => ({ ...prev, [key]: !open }))}
                  style={{ padding: '10px 16px', background: C.bgPanel, borderBottom: open ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                >
                  <span style={{ fontSize: 11, color: C.muted, width: 12, flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: projColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{key}</span>
                  <span style={{ fontSize: 10, color: C.muted }}>{groupVars.length} variation{groupVars.length !== 1 ? 's' : ''}</span>
                  {groupValue > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.sec, marginLeft: 4 }}>{fmtCurrency(groupValue)}</span>
                  )}
                </div>

                {/* Variation table */}
                {open && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                      <SharedTableHead visibleCols={visibleCols} onResizeStart={startResize} />
                      <tbody>
                        {groupVars.map((v, idx) => (
                          <VariationRow key={v.id} variation={v} odd={idx % 2 !== 0} visibleCols={visibleCols} />
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
