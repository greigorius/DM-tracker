import { useState, useEffect, useCallback } from 'react';
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

const STATUS_COLORS = {
  'In Progress':    '#60a5fa',
  'Review':         '#f59e0b',
  'On Hold':        '#f97316',
  'PC Approved':    '#a78bfa',
  'In Manufacture': '#34d399',
  'Complete':       '#4ade80',
  'Omitted':        '#94a3b8',
  'Not Started':    '#7b90b0',
};

const PHASE_SHORT = {
  'Ph1 - Design Intent':      'Ph1',
  'Ph2 - DT Tasking':         'Ph2',
  'Ph3 - Review & Issue':     'Ph3',
  'Ph4 - Comment Resolution': 'Ph4',
  'Ph5 - Client Response':    'Ph5',
  'Ph6 - Manufacturing':      'Ph6',
};

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function fmtDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
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

// ── Selects / Buttons ─────────────────────────────────────────────────────────
const selStyle = { background: C.input, border: `1px solid ${C.border}`, color: C.sec, fontSize: 10, borderRadius: 4, padding: '3px 6px', cursor: 'pointer', fontFamily: 'inherit' };
const btnStyle = active => ({ background: active ? '#1e3a5f' : C.input, border: `1px solid ${active ? '#60a5fa' : C.border}`, color: active ? '#60a5fa' : C.sec, fontSize: 10, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontWeight: active ? 700 : 400, fontFamily: 'inherit' });

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ status, compact = false }) {
  if (!status) return <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
  const color = STATUS_COLORS[status] ?? C.sec;
  return (
    <span style={{
      fontSize: compact ? 9 : 10, fontWeight: 700,
      background: hexToRgba(color, 0.12),
      color, border: `1px solid ${hexToRgba(color, 0.3)}`,
      borderRadius: 4, padding: compact ? '1px 5px' : '2px 7px',
      whiteSpace: 'nowrap',
    }}>{status}</span>
  );
}

// ── Date cell ─────────────────────────────────────────────────────────────────
function DateCell({ dateStr, style = {} }) {
  if (!dateStr) return <span style={{ color: C.muted, fontSize: 11, ...style }}>—</span>;
  const urgency = dateUrgency(dateStr);
  return (
    <span style={{ fontSize: 11, fontWeight: urgency !== 'ok' ? 700 : 400, color: URGENCY_COLOR[urgency], ...style }}>
      {fmtDate(dateStr)}
    </span>
  );
}

// ── Global status summary bar ─────────────────────────────────────────────────
function GlobalStatusBar({ items }) {
  const counts = {};
  for (const item of items) {
    const s = item.status ?? 'Unknown';
    counts[s] = (counts[s] ?? 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18, padding: '10px 14px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8 }}>
      {sorted.map(([status, count]) => {
        const color = STATUS_COLORS[status] ?? C.sec;
        return (
          <span key={status} style={{
            fontSize: 10, fontWeight: 700,
            background: hexToRgba(color, 0.1), color,
            border: `1px solid ${hexToRgba(color, 0.25)}`,
            borderRadius: 4, padding: '3px 8px',
          }}>
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

// ── Group header status summary ───────────────────────────────────────────────
function GroupStatusBar({ items }) {
  const counts = {};
  for (const i of items) { const s = i.status ?? 'Unknown'; counts[s] = (counts[s] ?? 0) + 1; }
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {Object.entries(counts).map(([s, n]) => {
        const color = STATUS_COLORS[s] ?? C.sec;
        return (
          <span key={s} style={{ fontSize: 9, fontWeight: 700, background: hexToRgba(color, 0.15), color, borderRadius: 3, padding: '1px 5px' }}>
            {s} {n}
          </span>
        );
      })}
    </div>
  );
}

// ── Item expand detail panel ──────────────────────────────────────────────────
function ItemDetailPanel({ item, detail }) {
  const loading = detail?.loading ?? true;

  const Section = ({ title, children }) => (
    <div style={{ flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8, paddingBottom: 5, borderBottom: `1px solid ${C.border}` }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{ padding: '12px 16px', background: C.bgDeep, borderTop: `1px solid ${C.grid}` }}>
      {loading ? (
        <div style={{ fontSize: 11, color: C.muted }}>Loading details…</div>
      ) : (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>

          {/* Hours */}
          <Section title="Hours / Tasks">
            <div style={{ fontSize: 12, color: C.text, fontWeight: 700, marginBottom: 4 }}>{item.tdlCount ?? 0}</div>
            <div style={{ fontSize: 10, color: C.muted }}>open tasks</div>
            {item.finishCount > 0 && (
              <div style={{ marginTop: 8, fontSize: 10, color: C.sec }}>{item.finishCount} finish spec{item.finishCount !== 1 ? 's' : ''}</div>
            )}
          </Section>

          {/* Drawings */}
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
                {detail.drawings.length > 8 && (
                  <div style={{ fontSize: 10, color: C.muted }}>+{detail.drawings.length - 8} more</div>
                )}
              </div>
            )}
          </Section>

          {/* RFIs */}
          <Section title={`RFIs (${item.rfiCount ?? 0})`}>
            {(detail?.rfis ?? []).length === 0 ? (
              <div style={{ fontSize: 10, color: C.muted }}>{item.rfiCount > 0 ? `${item.rfiCount} linked` : 'None'}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {detail.rfis.slice(0, 6).map(r => {
                  const sc = STATUS_COLORS[r.status] ?? C.sec;
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

          {/* Variations */}
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

// ── Column headers ────────────────────────────────────────────────────────────
const COLS = ['', 'Item Name', 'Status', 'Phase', 'Sub 1', 'S4', 'Sub 2', 'S5', 'Sub C01', 'TDL', 'DRW', 'RFI'];

function TableHead() {
  return (
    <thead>
      <tr style={{ background: '#0b1020', borderBottom: `1px solid ${C.border}` }}>
        {COLS.map((h, i) => (
          <th key={i} style={{
            padding: i === 0 ? '7px 8px' : '7px 10px',
            textAlign: i >= 9 ? 'center' : 'left',
            fontSize: 9, fontWeight: 700, color: C.muted,
            letterSpacing: '0.07em', textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}>{h}</th>
        ))}
      </tr>
    </thead>
  );
}

// ── Item Row ──────────────────────────────────────────────────────────────────
function ItemRow({ item, isExpanded, onToggle, odd }) {
  const d = item.dates ?? {};

  const CountChip = ({ n, color }) => (
    <span style={{ fontSize: 9, fontWeight: 700, color: n > 0 ? color : C.muted, background: n > 0 ? hexToRgba(color, 0.12) : 'transparent', borderRadius: 3, padding: '1px 5px', minWidth: 16, textAlign: 'center', display: 'inline-block' }}>{n ?? 0}</span>
  );

  return (
    <tr
      onClick={onToggle}
      style={{ background: odd ? '#0b1020' : C.bgCard, borderBottom: `1px solid ${C.grid}`, cursor: 'pointer', transition: 'background 0.1s' }}
      onMouseEnter={e => { e.currentTarget.style.background = C.bgPanel; }}
      onMouseLeave={e => { e.currentTarget.style.background = odd ? '#0b1020' : C.bgCard; }}
    >
      {/* Expand toggle */}
      <td style={{ padding: '7px 8px', width: 20 }}>
        <span style={{ fontSize: 10, color: C.muted, lineHeight: 1 }}>{isExpanded ? '▾' : '▸'}</span>
      </td>
      {/* Item name */}
      <td style={{ padding: '7px 12px', maxWidth: 260 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{item.name}</span>
        {item.noClientApproval && <span style={{ fontSize: 9, color: '#a78bfa', marginLeft: 6 }}>NCA</span>}
      </td>
      {/* Status */}
      <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
        <StatusPill status={item.status} />
      </td>
      {/* Phase */}
      <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
        {item.dmPhase
          ? <span style={{ fontSize: 10, color: C.sec, background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 6px' }}>{PHASE_SHORT[item.dmPhase] ?? item.dmPhase}</span>
          : <span style={{ color: C.muted, fontSize: 10 }}>—</span>}
      </td>
      {/* Submission dates */}
      {[d.sub1?.adj, d.s4Status?.adj, d.sub2?.adj, d.s5Status?.adj, d.subC01?.adj].map((dt, i) => (
        <td key={i} style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
          <DateCell dateStr={dt} />
        </td>
      ))}
      {/* Counts */}
      <td style={{ padding: '7px 10px', textAlign: 'center' }}><CountChip n={item.tdlCount} color="#60a5fa" /></td>
      <td style={{ padding: '7px 10px', textAlign: 'center' }}><CountChip n={item.drawingCount} color="#a78bfa" /></td>
      <td style={{ padding: '7px 10px', textAlign: 'center' }}><CountChip n={item.rfiCount} color="#f59e0b" /></td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ItemSchedulePage() {
  const [items,          setItems]          = useState([]);
  const [projects,       setProjects]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [refreshKey,     setRefreshKey]     = useState(0);
  const [lastRefreshed,  setLastRefreshed]  = useState(null);

  const [filterProject,  setFilterProject]  = useState('all');
  const [filterPhase,    setFilterPhase]    = useState('all');
  const [filterStatus,   setFilterStatus]   = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [groupBy,        setGroupBy]        = useState('project'); // 'project' | 'phase' | 'status'

  // Per-item expand state + lazy-loaded details
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [itemDetails,   setItemDetails]   = useState({});

  // Group-level expand (collapsed by default)
  const [expandedGroups, setExpandedGroups] = useState({});

  const today = new Date();

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const id = setInterval(() => setRefreshKey(k => k + 1), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const cached = getCached('projects');
    if (cached) setProjects(cached);
    else {
      fetch('/api/projects')
        .then(r => r.json())
        .then(d => { const list = Array.isArray(d) ? d : []; setCached('projects', list); setProjects(list); })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const cached = getCached('all-items');
    if (cached) { setItems(cached); setLoading(false); return; }
    setLoading(true);
    fetch('/api/all-items')
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : [];
        setCached('all-items', list);
        setItems(list);
        setLastRefreshed(new Date());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  // Build color map
  const allProjectIds = [...new Set([...projects.map(p => p.id), ...items.map(i => i.projectId).filter(Boolean)])];
  const colorMap = assignProjectColors(allProjectIds.map(id => ({ id })));

  // Filter options
  const phaseOptions    = [...new Set(items.map(i => i.dmPhase).filter(Boolean))].sort();
  const statusOptions   = [...new Set(items.map(i => i.status).filter(Boolean))].sort();
  const categoryOptions = [...new Set(items.map(i => i.contractCategory).filter(Boolean))].sort();

  // Apply filters
  const visible = items.filter(i => {
    if (filterProject  !== 'all' && i.projectId        !== filterProject)  return false;
    if (filterPhase    !== 'all' && i.dmPhase           !== filterPhase)    return false;
    if (filterStatus   !== 'all' && i.status            !== filterStatus)   return false;
    if (filterCategory !== 'all' && i.contractCategory  !== filterCategory) return false;
    return true;
  });

  // Build groups
  const grouped = [];
  const seen = new Map();
  for (const item of visible) {
    const key =
      groupBy === 'phase'   ? (item.dmPhase          ?? 'No Phase')   :
      groupBy === 'status'  ? (item.status            ?? 'No Status')  :
      /* project */           (item.projectName       ?? 'No Project');
    const projectId = groupBy === 'project' ? item.projectId : null;
    if (!seen.has(key)) {
      seen.set(key, []);
      grouped.push({ key, projectId, items: seen.get(key) });
    }
    seen.get(key).push(item);
  }
  grouped.sort((a, b) => a.key.localeCompare(b.key));

  // Toggle item row expand + lazy load details
  const toggleItem = useCallback(async (item) => {
    const id = item.id;
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

    if (itemDetails[id]) return; // already loaded

    setItemDetails(prev => ({ ...prev, [id]: { loading: true, drawings: [], rfis: [] } }));
    try {
      const [drawRes, rfiRes] = await Promise.all([
        fetch(`/api/item-drawings?ids=${id}`).then(r => r.json()).catch(() => ({})),
        item.rfiCount > 0
          ? fetch(`/api/rfis?ids=${id}`).then(r => r.json()).catch(() => [])
          : Promise.resolve([]),
      ]);
      setItemDetails(prev => ({
        ...prev,
        [id]: {
          loading:  false,
          drawings: drawRes[id] ?? [],
          rfis:     Array.isArray(rfiRes) ? rfiRes : [],
        },
      }));
    } catch {
      setItemDetails(prev => ({ ...prev, [id]: { loading: false, drawings: [], rfis: [] } }));
    }
  }, [itemDetails]);

  const toggleGroup = (key) => setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','ui-monospace',monospace", padding: '24px 32px' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>ITEM SCHEDULE</h1>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Progress status · drawing submission dates · grouped by {groupBy}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 11, color: C.muted }}>
            {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          {lastRefreshed && <span style={{ fontSize: 10, color: C.muted }}>updated {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={() => { setCached('all-items', null); setRefreshKey(k => k + 1); }} title="Refresh" style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontSize: 11, padding: '3px 8px', cursor: 'pointer', lineHeight: 1 }}>↻</button>
        </div>
      </div>

      <AppNav />

      {/* Global status bar */}
      {!loading && visible.length > 0 && <GlobalStatusBar items={visible} />}

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={selStyle}>
          <option value="all">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterPhase} onChange={e => setFilterPhase(e.target.value)} style={selStyle}>
          <option value="all">All Phases</option>
          {phaseOptions.map(ph => <option key={ph} value={ph}>{ph}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
          <option value="all">All Statuses</option>
          <option value="active">Active only</option>
          {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={selStyle}>
          <option value="all">All Categories</option>
          {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontSize: 10, color: C.muted, marginLeft: 4 }}>Group by:</span>
        {['project','phase','status'].map(g => (
          <button key={g} style={btnStyle(groupBy === g)} onClick={() => setGroupBy(g)}>
            {g.charAt(0).toUpperCase() + g.slice(1)}
          </button>
        ))}
        <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>
          {loading ? 'Loading…' : `${visible.length} items`}
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
            const isExpanded = !!expandedGroups[key];

            return (
              <div
                key={key}
                style={{
                  background:   C.bgCard,
                  border:       `1px solid ${C.border}`,
                  borderLeft:   `3px solid ${projColor}`,
                  borderRadius: 10,
                  overflow:     'hidden',
                  boxShadow:    `0 2px 12px ${hexToRgba(projColor, 0.12)}`,
                }}
              >
                {/* Group header */}
                <div
                  onClick={() => toggleGroup(key)}
                  style={{ padding: '10px 16px', background: C.bgPanel, borderBottom: isExpanded ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                >
                  <span style={{ fontSize: 11, color: C.muted, width: 12, flexShrink: 0 }}>{isExpanded ? '▾' : '▸'}</span>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: projColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{key}</span>
                  <span style={{ fontSize: 10, color: C.muted }}>{groupItems.length} item{groupItems.length !== 1 ? 's' : ''}</span>
                  <div style={{ marginLeft: 8, flex: 1 }}>
                    <GroupStatusBar items={groupItems} />
                  </div>
                </div>

                {/* Item table */}
                {isExpanded && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <TableHead />
                      <tbody>
                        {groupItems.map((item, idx) => {
                          const expanded = expandedItems.has(item.id);
                          return (
                            <>
                              <ItemRow
                                key={item.id}
                                item={item}
                                isExpanded={expanded}
                                onToggle={() => toggleItem(item)}
                                odd={idx % 2 !== 0}
                              />
                              {expanded && (
                                <tr key={`${item.id}-detail`}>
                                  <td colSpan={COLS.length} style={{ padding: 0 }}>
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
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
