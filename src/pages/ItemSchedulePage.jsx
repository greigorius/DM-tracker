import { useState, useEffect, useRef, useCallback } from 'react';
import AppNav from '../components/AppNav.jsx';
import { assignProjectColors, PROJECT_COLORS, ITEM_STATUS_COLORS, ITEM_STATUS_DEFAULT } from '../data/colors.js';
import { getCached, setCached } from '../hooks/usePageCache.js';
import {
  initColConfig, persistColConfig, mergeVisibleCols,
  exportToCSV, ColumnConfigPanel, SharedTableHead,
} from '../components/TableConfig.jsx';

const C = {
  bg: '#0a0f1a', bgCard: '#0d1525', bgPanel: '#0d1830', bgDeep: '#080e18',
  border: '#1e2d45', text: '#e2e8f0', sec: '#94a3b8',
  muted: '#7b90b0', grid: '#1a2540', input: '#0b1020',
};

const COL_LS_KEY = 'dmtracker:item-schedule-col-config';

const PHASE_SHORT = {
  'Ph1 - Design Intent':      'Ph1',
  'Ph2 - DT Tasking':         'Ph2',
  'Ph3 - Review & Issue':     'Ph3',
  'Ph4 - Comment Resolution': 'Ph4',
  'Ph5 - Client Response':    'Ph5',
  'Ph6 - Manufacturing':      'Ph6',
};

const RFI_STATUS_COLORS = {
  'Open': '#f59e0b', 'Closed': '#34d399', 'Pending': '#60a5fa',
  'On Hold': '#f97316', 'In Review': '#a78bfa', 'TBC': '#94a3b8',
};

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function fmtDate(str) {
  if (!str) return null;
  return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function dateUrgency(str) {
  if (!str) return null;
  const diff = (new Date(str) - Date.now()) / 86400000;
  if (diff < 0)   return 'overdue';
  if (diff <= 7)  return 'urgent';
  if (diff <= 21) return 'soon';
  return 'ok';
}

const URGENCY_COLOR = { overdue: '#f87171', urgent: '#f97316', soon: '#f59e0b', ok: C.sec };

// ── Column definitions ────────────────────────────────────────────────────────
const DEFAULT_COLUMNS = [
  { key: 'name',   label: 'Item',    defaultWidth: 240, minWidth: 120, align: 'left'   },
  { key: 'status', label: 'Status',  defaultWidth: 120, minWidth: 80,  align: 'center' },
  { key: 'phase',  label: 'Phase',   defaultWidth: 90,  minWidth: 60,  align: 'center' },
  { key: 'sub1',   label: 'Sub 1',   defaultWidth: 80,  minWidth: 60,  align: 'center' },
  { key: 's4',     label: 'S4',      defaultWidth: 80,  minWidth: 60,  align: 'center' },
  { key: 'sub2',   label: 'Sub 2',   defaultWidth: 80,  minWidth: 60,  align: 'center' },
  { key: 's5',     label: 'S5',      defaultWidth: 80,  minWidth: 60,  align: 'center' },
  { key: 'subC01', label: 'Sub C01', defaultWidth: 80,  minWidth: 60,  align: 'center' },
  { key: 'tdl',    label: 'TDL',     defaultWidth: 60,  minWidth: 40,  align: 'center' },
  { key: 'drw',    label: 'DRW',     defaultWidth: 60,  minWidth: 40,  align: 'center' },
  { key: 'rfi',    label: 'RFI',     defaultWidth: 60,  minWidth: 40,  align: 'center' },
];

// ── CSV raw value getter ──────────────────────────────────────────────────────
function itemRaw(item, key) {
  const d = item.dates ?? {};
  switch (key) {
    case 'name':   return item.name ?? '';
    case 'status': return item.status ?? '';
    case 'phase':  return item.dmPhase ?? '';
    case 'sub1':   return fmtDate(d.sub1?.adj) ?? '';
    case 's4':     return fmtDate(d.s4Status?.adj) ?? '';
    case 'sub2':   return fmtDate(d.sub2?.adj) ?? '';
    case 's5':     return fmtDate(d.s5Status?.adj) ?? '';
    case 'subC01': return fmtDate(d.subC01?.adj) ?? '';
    case 'tdl':    return item.tdlCount ?? '';
    case 'drw':    return item.drawingCount ?? '';
    case 'rfi':    return item.rfiCount ?? '';
    default:       return '';
  }
}

// ── Subcomponents ─────────────────────────────────────────────────────────────
const selStyle = {
  background: '#0b1020', border: '1px solid #1e2d45', color: '#94a3b8',
  fontSize: 10, borderRadius: 4, padding: '3px 6px', cursor: 'pointer', fontFamily: 'inherit',
};

function StatusPill({ status, compact = false }) {
  if (!status) return <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
  const cfg = ITEM_STATUS_COLORS[status] ?? ITEM_STATUS_DEFAULT;
  return (
    <span style={{ fontSize: compact ? 9 : 10, fontWeight: 700, background: cfg.bg, color: cfg.text,
      borderRadius: 4, padding: compact ? '1px 5px' : '2px 7px', whiteSpace: 'nowrap' }}>{status}</span>
  );
}

function DateUrgencySpan({ dateStr }) {
  if (!dateStr) return <span style={{ color: C.muted, fontSize: 11 }}>—</span>;
  const urgency = dateUrgency(dateStr);
  return (
    <span style={{ fontSize: 11, fontWeight: urgency !== 'ok' ? 700 : 400, color: URGENCY_COLOR[urgency] }}>
      {fmtDate(dateStr)}
    </span>
  );
}

function GlobalStatusBar({ items }) {
  const counts = {};
  for (const i of items) { const s = i.status ?? 'Unknown'; counts[s] = (counts[s] ?? 0) + 1; }
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18, padding: '10px 14px',
      background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8 }}>
      {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
        const cfg = ITEM_STATUS_COLORS[status] ?? ITEM_STATUS_DEFAULT;
        return (
          <span key={status} style={{ fontSize: 10, fontWeight: 700, background: cfg.bg, color: cfg.text, borderRadius: 4, padding: '3px 8px' }}>
            {status} <span style={{ opacity: 0.7 }}>· {count}</span>
          </span>
        );
      })}
      <span style={{ marginLeft: 'auto', fontSize: 10, color: C.muted, alignSelf: 'center' }}>
        {items.length} items total
      </span>
    </div>
  );
}

function GroupStatusBar({ items }) {
  const counts = {};
  for (const i of items) { const s = i.status ?? 'Unknown'; counts[s] = (counts[s] ?? 0) + 1; }
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {Object.entries(counts).map(([s, n]) => {
        const cfg = ITEM_STATUS_COLORS[s] ?? ITEM_STATUS_DEFAULT;
        return (
          <span key={s} style={{ fontSize: 9, fontWeight: 700, background: cfg.bg, color: cfg.text, borderRadius: 3, padding: '1px 5px' }}>
            {s} {n}
          </span>
        );
      })}
    </div>
  );
}

function ItemDetailPanel({ item, detail }) {
  const loading = detail?.loading ?? true;
  const Section = ({ title, children }) => (
    <div style={{ flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase',
        marginBottom: 8, paddingBottom: 5, borderBottom: `1px solid ${C.border}` }}>{title}</div>
      {children}
    </div>
  );
  return (
    <div style={{ padding: '12px 16px', background: C.bgDeep, borderTop: `1px solid ${C.grid}` }}>
      {loading ? (
        <div style={{ fontSize: 11, color: C.muted }}>Loading details…</div>
      ) : (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Section title="Hours / Tasks">
            <div style={{ fontSize: 12, color: C.text, fontWeight: 700, marginBottom: 4 }}>{item.tdlCount ?? 0}</div>
            <div style={{ fontSize: 10, color: C.muted }}>open tasks</div>
            {item.finishCount > 0 && <div style={{ marginTop: 8, fontSize: 10, color: C.sec }}>{item.finishCount} finish spec{item.finishCount !== 1 ? 's' : ''}</div>}
          </Section>
          <Section title={`Drawings (${item.drawingCount ?? 0})`}>
            {(detail?.drawings ?? []).length === 0 ? (
              <div style={{ fontSize: 10, color: C.muted }}>{item.drawingCount > 0 ? `${item.drawingCount} linked` : 'None'}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {detail.drawings.slice(0, 8).map(d => (
                  <div key={d.id} style={{ fontSize: 10 }}>
                    <span style={{ color: '#60a5fa', fontWeight: 700 }}>{d.drawingNumber}</span>
                    {d.designStage && <span style={{ color: C.muted, marginLeft: 5 }}>{d.designStage}</span>}
                    {d.rev && <span style={{ color: C.sec, marginLeft: 4 }}>r{d.rev}</span>}
                  </div>
                ))}
                {detail.drawings.length > 8 && <div style={{ fontSize: 10, color: C.muted }}>+{detail.drawings.length - 8} more</div>}
              </div>
            )}
          </Section>
          <Section title={`RFIs (${item.rfiCount ?? 0})`}>
            {(detail?.rfis ?? []).length === 0 ? (
              <div style={{ fontSize: 10, color: C.muted }}>{item.rfiCount > 0 ? `${item.rfiCount} linked` : 'None'}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {detail.rfis.slice(0, 6).map(r => {
                  const sc = RFI_STATUS_COLORS[r.status] ?? C.sec;
                  return (
                    <div key={r.id} style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: C.muted, fontWeight: 700 }}>RFI-{r.rfiNumber ?? '?'}</span>
                      <span style={{ color: C.sec, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{r.description}</span>
                      {r.status && <span style={{ fontSize: 9, color: sc, background: hexToRgba(sc, 0.12), borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>{r.status}</span>}
                    </div>
                  );
                })}
                {detail.rfis.length > 6 && <div style={{ fontSize: 10, color: C.muted }}>+{detail.rfis.length - 6} more</div>}
              </div>
            )}
          </Section>
          <Section title="Variations">
            <div style={{ fontSize: 10, color: C.muted }}>
              See <a href="/trackers/variations" style={{ color: '#60a5fa', textDecoration: 'none' }}>Variation Schedule</a>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

// ── Item row ──────────────────────────────────────────────────────────────────
function ItemRow({ item, isExpanded, onToggle, odd, visibleCols }) {
  const d = item.dates ?? {};

  const CountChip = ({ n, color }) => (
    <span style={{ fontSize: 9, fontWeight: 700, color: n > 0 ? color : C.muted,
      background: n > 0 ? hexToRgba(color, 0.12) : 'transparent',
      borderRadius: 3, padding: '1px 5px', minWidth: 16, textAlign: 'center', display: 'inline-block' }}>{n ?? 0}</span>
  );

  return (
    <tr
      onClick={onToggle}
      style={{ background: odd ? '#0b1020' : C.bgCard, borderBottom: `1px solid ${C.grid}`, cursor: 'pointer', transition: 'background 0.1s' }}
      onMouseEnter={e => { e.currentTarget.style.background = C.bgPanel; }}
      onMouseLeave={e => { e.currentTarget.style.background = odd ? '#0b1020' : C.bgCard; }}
    >
      {/* Always-present expand toggle (not in colConfig) */}
      <td style={{ padding: '7px 8px', width: 20 }}>
        <span style={{ fontSize: 10, color: C.muted, lineHeight: 1 }}>{isExpanded ? '▾' : '▸'}</span>
      </td>
      {visibleCols.map(col => {
        let content;
        switch (col.key) {
          case 'name':
            content = (
              <>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{item.name}</span>
                {item.noClientApproval && <span style={{ fontSize: 9, color: '#a78bfa', marginLeft: 6 }}>NCA</span>}
              </>
            );
            break;
          case 'status': content = <StatusPill status={item.status} />; break;
          case 'phase':
            content = item.dmPhase
              ? <span style={{ fontSize: 10, color: C.sec, background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 6px' }}>{PHASE_SHORT[item.dmPhase] ?? item.dmPhase}</span>
              : <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
            break;
          case 'sub1':   content = <DateUrgencySpan dateStr={d.sub1?.adj} />;     break;
          case 's4':     content = <DateUrgencySpan dateStr={d.s4Status?.adj} />; break;
          case 'sub2':   content = <DateUrgencySpan dateStr={d.sub2?.adj} />;     break;
          case 's5':     content = <DateUrgencySpan dateStr={d.s5Status?.adj} />; break;
          case 'subC01': content = <DateUrgencySpan dateStr={d.subC01?.adj} />;   break;
          case 'tdl':    content = <CountChip n={item.tdlCount}     color="#60a5fa" />; break;
          case 'drw':    content = <CountChip n={item.drawingCount} color="#a78bfa" />; break;
          case 'rfi':    content = <CountChip n={item.rfiCount}     color="#f59e0b" />; break;
          default:       content = <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
        }
        return (
          <td key={col.key} style={{ padding: '7px 10px', textAlign: col.align,
            verticalAlign: col.align === 'left' ? 'top' : 'middle', overflow: 'hidden' }}>
            {content}
          </td>
        );
      })}
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ItemSchedulePage() {
  const [items,         setItems]         = useState([]);
  const [projects,      setProjects]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshKey,    setRefreshKey]    = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [expanded,      setExpanded]      = useState({});
  const [showColPanel,  setShowColPanel]  = useState(false);
  const [colConfig,     setColConfig]     = useState(() => initColConfig(DEFAULT_COLUMNS, COL_LS_KEY));

  const [filterProject,  setFilterProject]  = useState('all');
  const [filterPhase,    setFilterPhase]    = useState('all');
  const [filterStatus,   setFilterStatus]   = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [groupBy,        setGroupBy]        = useState('project');

  const [expandedItems, setExpandedItems] = useState(new Set());
  const [itemDetails,   setItemDetails]   = useState({});

  const colConfigRef = useRef(colConfig);
  useEffect(() => { colConfigRef.current = colConfig; }, [colConfig]);

  const today = new Date();

  useEffect(() => { const id = setInterval(() => setRefreshKey(k => k + 1), 5 * 60 * 1000); return () => clearInterval(id); }, []);

  useEffect(() => {
    const t = setTimeout(() => persistColConfig(colConfig, COL_LS_KEY), 400);
    return () => clearTimeout(t);
  }, [colConfig]);

  const startResize = useCallback((e, colKey) => {
    const startX = e.clientX;
    const def    = DEFAULT_COLUMNS.find(c => c.key === colKey);
    const minW   = def?.minWidth ?? 40;
    const startW = colConfigRef.current.find(c => c.key === colKey)?.width ?? 100;
    const onMove = me => {
      const newW = Math.max(minW, startW + (me.clientX - startX));
      setColConfig(prev => prev.map(c => c.key === colKey ? { ...c, width: newW } : c));
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  useEffect(() => {
    const cached = getCached('projects');
    if (cached) setProjects(cached);
    else fetch('/api/projects').then(r => r.json())
      .then(d => { const l = Array.isArray(d) ? d : []; setCached('projects', l); setProjects(l); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const cached = getCached('all-items');
    if (cached) { setItems(cached); setLoading(false); return; }
    setLoading(true);
    fetch('/api/all-items').then(r => r.json())
      .then(d => { const l = Array.isArray(d) ? d : []; setCached('all-items', l); setItems(l); setLastRefreshed(new Date()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const allProjectIds = [...new Set([...projects.map(p => p.id), ...items.map(i => i.projectId).filter(Boolean)])];
  const colorMap      = assignProjectColors(allProjectIds.map(id => ({ id })));

  const phaseOptions    = [...new Set(items.map(i => i.dmPhase).filter(Boolean))].sort();
  const statusOptions   = [...new Set(items.map(i => i.status).filter(Boolean))].sort();
  const categoryOptions = [...new Set(items.map(i => i.contractCategory).filter(Boolean))].sort();

  const visible = items.filter(i => {
    if (filterProject  !== 'all' && i.projectId       !== filterProject)  return false;
    if (filterPhase    !== 'all' && i.dmPhase          !== filterPhase)    return false;
    if (filterStatus   !== 'all' && i.status           !== filterStatus)   return false;
    if (filterCategory !== 'all' && i.contractCategory !== filterCategory) return false;
    return true;
  });

  const grouped = (() => {
    if (groupBy === 'none') return [{ key: '__none__', projectId: null, items: visible }];
    const map = new Map();
    for (const item of visible) {
      const key =
        groupBy === 'phase'  ? (item.dmPhase    ?? 'No Phase')   :
        groupBy === 'status' ? (item.status      ?? 'No Status')  :
                               (item.projectName ?? 'No Project');
      const pid = groupBy === 'project' ? item.projectId : null;
      if (!map.has(key)) map.set(key, { key, projectId: pid, items: [] });
      map.get(key).items.push(item);
    }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  })();

  const toggleItem = useCallback(async (item) => {
    const id = item.id;
    setExpandedItems(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
    if (itemDetails[id]) return;
    setItemDetails(prev => ({ ...prev, [id]: { loading: true, drawings: [], rfis: [] } }));
    try {
      const [drawRes, rfiRes] = await Promise.all([
        fetch(`/api/item-drawings?ids=${id}`).then(r => r.json()).catch(() => ({})),
        item.rfiCount > 0 ? fetch(`/api/rfis?ids=${id}`).then(r => r.json()).catch(() => []) : Promise.resolve([]),
      ]);
      setItemDetails(prev => ({ ...prev, [id]: { loading: false, drawings: drawRes[id] ?? [], rfis: Array.isArray(rfiRes) ? rfiRes : [] } }));
    } catch {
      setItemDetails(prev => ({ ...prev, [id]: { loading: false, drawings: [], rfis: [] } }));
    }
  }, [itemDetails]);

  const visibleCols = mergeVisibleCols(colConfig, DEFAULT_COLUMNS);
  // +1 for always-present expand toggle column
  const totalCols   = visibleCols.length + 1;

  const expandAll   = () => { const s = {}; for (const g of grouped) s[g.key] = true; setExpanded(s); };
  const collapseAll = () => setExpanded({});

  const allRows      = visible;
  const handleExport = () => exportToCSV(visibleCols, allRows, itemRaw, `item-schedule-${new Date().toISOString().slice(0,10)}.csv`);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','ui-monospace',monospace", padding: '24px 32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>ITEM SCHEDULE</h1>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            Progress status · drawing submission dates · {groupBy === 'none' ? 'no grouping' : `grouped by ${groupBy}`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 11, color: C.muted }}>{today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          {lastRefreshed && <span style={{ fontSize: 10, color: C.muted }}>updated {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={() => { setCached('all-items', null); setRefreshKey(k => k + 1); }} title="Refresh"
            style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontSize: 11, padding: '3px 8px', cursor: 'pointer', lineHeight: 1, fontFamily: 'inherit' }}>↻</button>
        </div>
      </div>

      <AppNav />

      {!loading && visible.length > 0 && <GlobalStatusBar items={visible} />}

      {/* Filter / toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={filterProject}  onChange={e => setFilterProject(e.target.value)}  style={selStyle}>
          <option value="all">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterPhase}    onChange={e => setFilterPhase(e.target.value)}    style={selStyle}>
          <option value="all">All Phases</option>
          {phaseOptions.map(ph => <option key={ph} value={ph}>{ph}</option>)}
        </select>
        <select value={filterStatus}   onChange={e => setFilterStatus(e.target.value)}   style={selStyle}>
          <option value="all">All Statuses</option>
          <option value="active">Active only</option>
          {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={selStyle}>
          <option value="all">All Categories</option>
          {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
          style={{ ...selStyle, marginLeft: 4, borderColor: '#2d4a6e', color: '#93c5fd' }}>
          <option value="project">Group: Project</option>
          <option value="phase">Group: Phase</option>
          <option value="status">Group: Status</option>
          <option value="none">No Grouping</option>
        </select>

        <button onClick={expandAll}   style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd' }}>Expand All</button>
        <button onClick={collapseAll} style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd' }}>Collapse All</button>
        <button onClick={() => setShowColPanel(true)} style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd' }}>⚙ Columns</button>
        <button onClick={handleExport} style={{ ...selStyle, borderColor: '#166534', color: '#4ade80' }}>↓ Export CSV</button>

        <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>
          {loading ? 'Loading…' : `${visible.length} item${visible.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Content */}
      {loading && items.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 12 }}>Loading items…</div>
      ) : visible.length === 0 && !loading ? (
        <div style={{ color: C.muted, fontSize: 12 }}>No items match filters</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {grouped.map(({ key, projectId, items: groupItems }) => {
            const projColor  = projectId ? (colorMap.get(projectId) ?? PROJECT_COLORS[0]) : PROJECT_COLORS[0];
            const isExpanded = groupBy === 'none' ? true : !!expanded[key];
            const noGrouping = groupBy === 'none';

            const table = (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed',
                  width: visibleCols.reduce((s, c) => s + c.width, 20) }}>
                  {/* Custom head: expand-toggle prefix + SharedTableHead cols */}
                  <thead>
                    <tr>
                      <th style={{ width: 20, padding: '7px 8px', background: '#080d17',
                        borderBottom: `1px solid ${C.border}` }} />
                      {visibleCols.map(col => (
                        <th key={col.key} style={{
                          position: 'relative', padding: '7px 10px',
                          textAlign: col.align ?? 'center',
                          fontSize: 9, fontWeight: 700, color: '#7b90b0',
                          letterSpacing: '0.07em', textTransform: 'uppercase',
                          whiteSpace: 'nowrap', width: col.width, minWidth: col.minWidth ?? 40,
                          borderBottom: `1px solid ${C.border}`, background: '#080d17', userSelect: 'none',
                        }}>
                          {col.label}
                          <div onMouseDown={e => { e.preventDefault(); e.stopPropagation(); startResize(e, col.key); }}
                            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 1 }} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groupItems.map((item, idx) => {
                      const itemExpanded = expandedItems.has(item.id);
                      return (
                        <>
                          <ItemRow
                            key={item.id}
                            item={item}
                            isExpanded={itemExpanded}
                            onToggle={() => toggleItem(item)}
                            odd={idx % 2 !== 0}
                            visibleCols={visibleCols}
                          />
                          {itemExpanded && (
                            <tr key={`${item.id}-detail`}>
                              <td colSpan={totalCols} style={{ padding: 0 }}>
                                <ItemDetailPanel item={item} detail={itemDetails[item.id]} />
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );

            if (noGrouping) {
              return (
                <div key={key} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                  {table}
                </div>
              );
            }

            return (
              <div key={key} style={{
                background: C.bgCard, border: `1px solid ${C.border}`,
                borderLeft: `3px solid ${projColor}`, borderRadius: 10, overflow: 'hidden',
                boxShadow: `0 2px 12px ${hexToRgba(projColor, 0.12)}`,
              }}>
                <div onClick={() => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))}
                  style={{ padding: '10px 16px', background: C.bgPanel,
                    borderBottom: isExpanded ? `1px solid ${C.border}` : 'none',
                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                  <span style={{ fontSize: 11, color: C.muted, width: 12, flexShrink: 0 }}>{isExpanded ? '▾' : '▸'}</span>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: projColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{key}</span>
                  <span style={{ fontSize: 10, color: C.muted }}>{groupItems.length} item{groupItems.length !== 1 ? 's' : ''}</span>
                  <div style={{ marginLeft: 8, flex: 1 }}><GroupStatusBar items={groupItems} /></div>
                </div>
                {isExpanded && table}
              </div>
            );
          })}
        </div>
      )}

      {showColPanel && (
        <ColumnConfigPanel
          colConfig={colConfig}
          defaults={DEFAULT_COLUMNS}
          onClose={() => setShowColPanel(false)}
          onChange={cfg => { setColConfig(cfg); persistColConfig(cfg, COL_LS_KEY); }}
        />
      )}
    </div>
  );
}
