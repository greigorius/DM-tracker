import { useState, useEffect, useRef, useCallback } from 'react';
import AppNav from '../components/AppNav.jsx';
import { assignProjectColors, PROJECT_COLORS, ITEM_STATUS_COLORS, ITEM_STATUS_DEFAULT } from '../data/colors.js';
import { getCached, setCached } from '../hooks/usePageCache.js';

const C = {
  bg:      '#0a0f1a',
  bgCard:  '#0d1525',
  bgPanel: '#0d1830',
  border:  '#1e2d45',
  text:    '#e2e8f0',
  sec:     '#94a3b8',
  muted:   '#7b90b0',
  grid:    '#1a2540',
  input:   '#0b1020',
};

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function fmtDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// ── Status colour coding ──────────────────────────────────────────────────────
const STATUS_COLORS = {
  'A':  { bg: '#14532d', text: '#4ade80', border: '#166534' },
  'A1': { bg: '#14532d', text: '#4ade80', border: '#166534' },
  'A2': { bg: '#14532d', text: '#4ade80', border: '#166534' },
  'B':  { bg: '#78350f', text: '#fcd34d', border: '#92400e' },
  'B1': { bg: '#78350f', text: '#fcd34d', border: '#92400e' },
  'B2': { bg: '#78350f', text: '#fcd34d', border: '#92400e' },
  'C':  { bg: '#7f1d1d', text: '#fca5a5', border: '#991b1b' },
  'C1': { bg: '#7f1d1d', text: '#fca5a5', border: '#991b1b' },
  'C2': { bg: '#7f1d1d', text: '#fca5a5', border: '#991b1b' },
};
const STATUS_DEFAULT = { bg: '#1e2d45', text: '#94a3b8', border: '#2d3f5a' };

function statusStyle(s) {
  if (!s) return STATUS_DEFAULT;
  const key = s.split(/[\s–\-]/)[0];
  return STATUS_COLORS[key] ?? STATUS_DEFAULT;
}

function StatusBadge({ value }) {
  if (!value) return <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
  const st = statusStyle(value);
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      padding: '2px 6px', borderRadius: 4, background: st.bg, color: st.text,
      border: `1px solid ${st.border}`, whiteSpace: 'nowrap', maxWidth: 140,
      overflow: 'hidden', textOverflow: 'ellipsis',
    }} title={value}>
      {value}
    </span>
  );
}

function ItemStatusBadge({ value }) {
  if (!value) return null;
  const sc = ITEM_STATUS_COLORS[value] ?? ITEM_STATUS_DEFAULT;
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      padding: '2px 6px', borderRadius: 3, background: sc.bg, color: sc.text }}>
      {value}
    </span>
  );
}

// ── Column definitions ────────────────────────────────────────────────────────
const DEFAULT_COLUMNS = [
  { key: 'drawingNumber',    label: 'Dwg No',          defaultWidth: 130, minWidth: 80  },
  { key: 'title',            label: 'Title',            defaultWidth: 240, minWidth: 120 },
  { key: 'designStage',      label: 'Stage',            defaultWidth: 80,  minWidth: 50  },
  { key: 'rev',              label: 'Rev',              defaultWidth: 60,  minWidth: 40  },
  { key: 'dwgNoAssigned',    label: 'Dwg Type',         defaultWidth: 90,  minWidth: 60  },
  { key: 's4SubmitActual',   label: 'S4 Submit',        defaultWidth: 96,  minWidth: 70  },
  { key: 's4StatusDate',     label: 'S4 Status Date',   defaultWidth: 110, minWidth: 80  },
  { key: 's4Status',         label: 'S4 Status',        defaultWidth: 130, minWidth: 80  },
  { key: 's5SubmitActual',   label: 'S5 Submit',        defaultWidth: 96,  minWidth: 70  },
  { key: 's5StatusDate',     label: 'S5 Status Date',   defaultWidth: 110, minWidth: 80  },
  { key: 's5Status',         label: 'S5 Status',        defaultWidth: 130, minWidth: 80  },
  { key: 'c01SubmitActual',  label: 'C01 Submit',       defaultWidth: 96,  minWidth: 70  },
  { key: 'c01SignOffActual', label: 'C01 Sign Off',     defaultWidth: 110, minWidth: 70  },
];

const COL_CONFIG_KEY = 'dmtracker:dr-col-config';

function initColConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem(COL_CONFIG_KEY) || 'null');
    if (!stored || !Array.isArray(stored)) return DEFAULT_COLUMNS.map(c => ({ key: c.key, visible: true, width: c.defaultWidth }));
    const defMap    = new Map(DEFAULT_COLUMNS.map(c => [c.key, c]));
    const storedMap = new Map(stored.map(c => [c.key, c]));
    // Ordered by stored order; append any new default columns at end
    const orderedKeys = [...stored.map(c => c.key).filter(k => defMap.has(k))];
    for (const def of DEFAULT_COLUMNS) {
      if (!orderedKeys.includes(def.key)) orderedKeys.push(def.key);
    }
    return orderedKeys.map(k => {
      const def = defMap.get(k);
      const s   = storedMap.get(k);
      return { key: k, visible: s?.visible ?? true, width: s?.width ?? def?.defaultWidth ?? 100 };
    });
  } catch {
    return DEFAULT_COLUMNS.map(c => ({ key: c.key, visible: true, width: c.defaultWidth }));
  }
}

function persistColConfig(config) {
  try { localStorage.setItem(COL_CONFIG_KEY, JSON.stringify(config)); } catch {}
}

// ── Column config panel ───────────────────────────────────────────────────────
function ColumnConfigPanel({ colConfig, onClose, onChange }) {
  const [local, setLocal] = useState(colConfig);
  const defMap = new Map(DEFAULT_COLUMNS.map(c => [c.key, c]));

  const toggle = key => setLocal(prev => prev.map(c => c.key === key ? { ...c, visible: !c.visible } : c));
  const move   = (key, dir) => setLocal(prev => {
    const idx  = prev.findIndex(c => c.key === key);
    const next = [...prev];
    const to   = idx + dir;
    if (to < 0 || to >= next.length) return prev;
    [next[idx], next[to]] = [next[to], next[idx]];
    return next;
  });

  const apply = () => { onChange(local); onClose(); };
  const reset = () => setLocal(DEFAULT_COLUMNS.map(c => ({ key: c.key, visible: true, width: c.defaultWidth })));

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: 24, width: 320, maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 12,
        fontFamily: "'DM Mono','ui-monospace',monospace" }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Configure Columns</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {local.map((col, idx) => (
            <div key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 0', borderBottom: `1px solid ${C.grid}` }}>
              <input type="checkbox" checked={col.visible} onChange={() => toggle(col.key)}
                style={{ cursor: 'pointer', accentColor: '#3b82f6', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11, color: col.visible ? C.text : C.muted }}>
                {defMap.get(col.key)?.label ?? col.key}
              </span>
              <button onClick={() => move(col.key, -1)} disabled={idx === 0}
                style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 3,
                  color: C.muted, cursor: idx === 0 ? 'default' : 'pointer',
                  fontSize: 9, padding: '2px 5px', opacity: idx === 0 ? 0.3 : 1, fontFamily: 'inherit' }}>▲</button>
              <button onClick={() => move(col.key, 1)} disabled={idx === local.length - 1}
                style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 3,
                  color: C.muted, cursor: idx === local.length - 1 ? 'default' : 'pointer',
                  fontSize: 9, padding: '2px 5px', opacity: idx === local.length - 1 ? 0.3 : 1, fontFamily: 'inherit' }}>▼</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={reset}
            style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.border}`,
              background: 'transparent', color: C.sec, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
            Reset
          </button>
          <button onClick={apply}
            style={{ padding: '5px 14px', borderRadius: 5, border: 'none', background: '#1d4ed8',
              color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cell content renderer ─────────────────────────────────────────────────────
function CellContent({ colKey, drawing }) {
  switch (colKey) {
    case 'drawingNumber':
      return (
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {drawing.drawingNumber || '—'}
        </div>
      );

    case 'title':
      return (
        <div>
          {drawing.title1 && <div style={{ fontSize: 12, color: C.text, lineHeight: 1.35 }}>{drawing.title1}</div>}
          {drawing.title2 && <div style={{ fontSize: 11, color: C.sec, lineHeight: 1.35 }}>{drawing.title2}</div>}
          {drawing.title3 && <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.35 }}>{drawing.title3}</div>}
          {!drawing.title1 && !drawing.title2 && !drawing.title3 &&
            <span style={{ color: C.muted, fontSize: 10 }}>—</span>}
        </div>
      );

    case 'designStage':
      return drawing.designStage
        ? <span style={{ fontSize: 11, color: C.sec }}>{drawing.designStage}</span>
        : <span style={{ color: C.muted, fontSize: 10 }}>—</span>;

    case 'rev':
      return drawing.rev
        ? <span style={{ fontSize: 11, color: C.sec }}>Rev {drawing.rev}</span>
        : <span style={{ color: C.muted, fontSize: 10 }}>—</span>;

    case 'dwgNoAssigned':
      return drawing.dwgNoAssigned
        ? <span style={{ fontSize: 10, fontWeight: 600, color: C.sec }}>{drawing.dwgNoAssigned}</span>
        : <span style={{ color: C.muted, fontSize: 10 }}>—</span>;

    case 's4SubmitActual': {
      const v = drawing.s4Submit?.actual;
      return <span style={{ fontSize: 11, color: v ? C.text : C.muted }}>{v ? fmtDate(v) : '—'}</span>;
    }

    case 's4StatusDate': {
      const v     = drawing.s4StatusDate;
      const color = v ? statusStyle(drawing.s4Status).text : C.muted;
      return <span style={{ fontSize: 11, color, fontWeight: v ? 600 : 400 }}>{v ? fmtDate(v) : '—'}</span>;
    }

    case 's4Status':
      return <StatusBadge value={drawing.s4Status} />;

    case 's5SubmitActual': {
      const v = drawing.s5Submit?.actual;
      return <span style={{ fontSize: 11, color: v ? C.text : C.muted }}>{v ? fmtDate(v) : '—'}</span>;
    }

    case 's5StatusDate': {
      const v     = drawing.s5StatusDate;
      const color = v ? statusStyle(drawing.s5Status).text : C.muted;
      return <span style={{ fontSize: 11, color, fontWeight: v ? 600 : 400 }}>{v ? fmtDate(v) : '—'}</span>;
    }

    case 's5Status':
      return <StatusBadge value={drawing.s5Status} />;

    case 'c01SubmitActual': {
      const v = drawing.c01Submit?.actual;
      return <span style={{ fontSize: 11, color: v ? C.text : C.muted }}>{v ? fmtDate(v) : '—'}</span>;
    }

    case 'c01SignOffActual': {
      const v = drawing.c01SignOff?.actual;
      return <span style={{ fontSize: 11, color: v ? C.text : C.muted }}>{v ? fmtDate(v) : '—'}</span>;
    }

    default:
      return <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
  }
}

// ── Drawing row ───────────────────────────────────────────────────────────────
function DrawingRow({ drawing, odd, visibleCols }) {
  return (
    <tr style={{ background: odd ? '#0b1020' : C.bgCard, borderBottom: `1px solid ${C.grid}` }}>
      {visibleCols.map(col => {
        const isLeft = col.key === 'drawingNumber' || col.key === 'title';
        return (
          <td key={col.key} style={{
            padding: '6px 10px',
            textAlign: isLeft ? 'left' : 'center',
            verticalAlign: isLeft ? 'top' : 'middle',
            overflow: 'hidden',
          }}>
            <CellContent colKey={col.key} drawing={drawing} />
          </td>
        );
      })}
    </tr>
  );
}

// ── Table header with resize handles ─────────────────────────────────────────
function TableHead({ visibleCols, onResizeStart }) {
  return (
    <thead>
      <tr>
        {visibleCols.map(col => {
          const isLeft = col.key === 'drawingNumber' || col.key === 'title';
          const def    = DEFAULT_COLUMNS.find(c => c.key === col.key);
          return (
            <th key={col.key} style={{
              position: 'relative',
              padding: '7px 10px',
              textAlign: isLeft ? 'left' : 'center',
              fontSize: 9, fontWeight: 700, color: C.muted,
              letterSpacing: '0.07em', textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              width: col.width,
              minWidth: def?.minWidth ?? 40,
              borderBottom: `1px solid ${C.border}`,
              background: '#080d17',
              userSelect: 'none',
            }}>
              {def?.label ?? col.key}
              <div
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onResizeStart(e, col.key); }}
                style={{
                  position: 'absolute', right: 0, top: 0, bottom: 0, width: 5,
                  cursor: 'col-resize', zIndex: 1,
                  background: 'transparent',
                }}
              />
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

// ── CSV / Excel export ────────────────────────────────────────────────────────
function exportToCSV(visibleCols, grouped) {
  const defMap = new Map(DEFAULT_COLUMNS.map(c => [c.key, c]));
  const headers = visibleCols.map(c => defMap.get(c.key)?.label ?? c.key);

  function raw(dwg, key) {
    switch (key) {
      case 'drawingNumber':    return dwg.drawingNumber ?? '';
      case 'title':            return [dwg.title1, dwg.title2, dwg.title3].filter(Boolean).join(' — ');
      case 'designStage':      return dwg.designStage ?? '';
      case 'rev':              return dwg.rev ?? '';
      case 'dwgNoAssigned':    return dwg.dwgNoAssigned ?? '';
      case 's4SubmitActual':   return fmtDate(dwg.s4Submit?.actual) ?? '';
      case 's4StatusDate':     return fmtDate(dwg.s4StatusDate) ?? '';
      case 's4Status':         return dwg.s4Status ?? '';
      case 's5SubmitActual':   return fmtDate(dwg.s5Submit?.actual) ?? '';
      case 's5StatusDate':     return fmtDate(dwg.s5StatusDate) ?? '';
      case 's5Status':         return dwg.s5Status ?? '';
      case 'c01SubmitActual':  return fmtDate(dwg.c01Submit?.actual) ?? '';
      case 'c01SignOffActual': return fmtDate(dwg.c01SignOff?.actual) ?? '';
      default: return '';
    }
  }

  const esc  = v => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [headers.map(esc).join(',')];
  for (const group of grouped) {
    for (const dwg of group.drawings) {
      rows.push(visibleCols.map(c => esc(raw(dwg, c.key))).join(','));
    }
  }

  const csv  = '\uFEFF' + rows.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `drawings-register-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Filter bar select style ───────────────────────────────────────────────────
const selStyle = {
  background: '#0b1020', border: '1px solid #1e2d45', color: '#94a3b8',
  fontSize: 10, borderRadius: 4, padding: '3px 6px', cursor: 'pointer', fontFamily: 'inherit',
};

const CHUNK_SIZE = 25;
const isPCSA = n => (n ?? '').toUpperCase().includes('PCSA');

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DrawingsPage() {
  const [regItems,      setRegItems]      = useState([]);
  const [itemsLoading,  setItemsLoading]  = useState(true);
  const [drawings,      setDrawings]      = useState([]);
  const [chunksTotal,   setChunksTotal]   = useState(0);
  const [chunksDone,    setChunksDone]    = useState(0);
  const [projects,      setProjects]      = useState([]);
  const [fetchError,    setFetchError]    = useState(null);
  const [refreshKey,    setRefreshKey]    = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [expanded,          setExpanded]          = useState({});
  const [showColPanel,      setShowColPanel]      = useState(false);
  const [filterAssignedOnly, setFilterAssignedOnly] = useState(false);
  const [colConfig,     setColConfig]     = useState(initColConfig);

  const [filterProject,     setFilterProject]     = useState('all');
  const [filterItem,        setFilterItem]        = useState('all');
  const [filterDesignStage, setFilterDesignStage] = useState('all');
  const [filterRev,         setFilterRev]         = useState('all');
  const [filterS4Status,    setFilterS4Status]    = useState('all');
  const [filterS5Status,    setFilterS5Status]    = useState('all');
  const [groupBy,           setGroupBy]           = useState('dwgType');

  const colConfigRef = useRef(colConfig);
  useEffect(() => { colConfigRef.current = colConfig; }, [colConfig]);

  const today = new Date();

  // Persist column config with debounce
  useEffect(() => {
    const t = setTimeout(() => persistColConfig(colConfig), 400);
    return () => clearTimeout(t);
  }, [colConfig]);

  // Column resize via mouse drag
  const startResize = useCallback((e, colKey) => {
    const startX     = e.clientX;
    const def        = DEFAULT_COLUMNS.find(c => c.key === colKey);
    const minW       = def?.minWidth ?? 40;
    const startWidth = colConfigRef.current.find(c => c.key === colKey)?.width ?? 100;

    const onMove = me => {
      const newW = Math.max(minW, startWidth + (me.clientX - startX));
      setColConfig(prev => prev.map(c => c.key === colKey ? { ...c, width: newW } : c));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // Auto-refresh
  useEffect(() => {
    const id = setInterval(() => setRefreshKey(k => k + 1), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Projects
  useEffect(() => {
    const cached = getCached('projects');
    if (cached) { setProjects(cached); return; }
    fetch('/api/projects').then(r => r.json())
      .then(d => { const list = Array.isArray(d) ? d : []; setCached('projects', list); setProjects(list); })
      .catch(() => {});
  }, []);

  // Phase 1: items
  useEffect(() => {
    if (!projects.length) return;
    setItemsLoading(true);
    setFetchError(null);
    setRegItems([]);
    setDrawings([]);

    const projectIds = filterProject === 'all' ? projects.map(p => p.id) : [filterProject];

    Promise.allSettled(
      projectIds.map(projId => {
        const cacheKey = `dr-items:${projId}`;
        const cached   = getCached(cacheKey);
        if (cached && refreshKey === 0) return Promise.resolve(cached);
        return fetch(`/api/drawings-register/items?projectId=${projId}`)
          .then(async r => {
            const d = await r.json();
            if (!Array.isArray(d)) return [];
            setCached(cacheKey, d);
            return d;
          })
          .catch(err => { console.error('[dr-items]', err); return []; });
      })
    ).then(results => {
      const allItems = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
      setRegItems(allItems);
      setItemsLoading(false);
    });
  }, [filterProject, projects.length, refreshKey]);

  // Phase 2: drawings
  useEffect(() => {
    if (!regItems.length) return;

    const cacheKey   = `dr-drawings:${filterProject}`;
    const cachedDwgs = getCached(cacheKey);
    if (cachedDwgs && refreshKey === 0) {
      setDrawings(cachedDwgs);
      setLastRefreshed(new Date());
      return;
    }

    const itemIds = regItems.map(i => i.id);
    const chunks  = [];
    for (let i = 0; i < itemIds.length; i += CHUNK_SIZE) chunks.push(itemIds.slice(i, i + CHUNK_SIZE));

    setDrawings([]);
    setChunksTotal(chunks.length);
    setChunksDone(0);

    const accumulated = [];
    const seenIds     = new Set();

    Promise.allSettled(
      chunks.map(chunk =>
        fetch(`/api/drawings-register/chunk?itemIds=${chunk.join(',')}`)
          .then(r => r.json())
          .then(d => {
            if (!Array.isArray(d)) return;
            setDrawings(prev => {
              const next = [...prev];
              for (const dwg of d) {
                if (!seenIds.has(dwg.id)) { seenIds.add(dwg.id); next.push(dwg); accumulated.push(dwg); }
              }
              return next;
            });
          })
          .catch(err => console.error('[dr-chunk]', err))
          .finally(() => setChunksDone(n => n + 1))
      )
    ).then(() => {
      setCached(cacheKey, accumulated);
      setLastRefreshed(new Date());
    });
  }, [regItems]);

  // Colour map
  const allProjIds = [...new Set([...projects.map(p => p.id), ...regItems.map(i => i.projectId).filter(Boolean)])];
  const colorMap   = assignProjectColors(allProjIds.map(id => ({ id })));

  // Index drawings by item ID
  const drawingsByItemId = new Map();
  for (const dwg of drawings) {
    const iid = dwg.itemIds?.[0] ?? null;
    if (!iid) continue;
    if (!drawingsByItemId.has(iid)) drawingsByItemId.set(iid, []);
    drawingsByItemId.get(iid).push(dwg);
  }

  // Filter options derived from data
  const itemOptions        = [...new Set(regItems.filter(i => !isPCSA(i.name)).map(i => i.name).filter(Boolean))].sort();
  const designStageOptions = [...new Set(drawings.map(d => d.designStage).filter(Boolean))].sort();
  const revOptions         = [...new Set(drawings.map(d => d.rev).filter(Boolean))].sort();
  const s4StatusOptions    = [...new Set(drawings.map(d => d.s4Status).filter(Boolean))].sort();
  const s5StatusOptions    = [...new Set(drawings.map(d => d.s5Status).filter(Boolean))].sort();

  // Eligible items (non-PCSA, matching project/item filters)
  const eligibleItems = regItems.filter(item => {
    if (isPCSA(item.name)) return false;
    if (filterProject !== 'all' && item.projectId !== filterProject) return false;
    if (filterItem    !== 'all' && item.name      !== filterItem)    return false;
    return true;
  }).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

  // Drawing-level filter
  const matchesDwgFilter = d => {
    if (filterAssignedOnly && !d.dwgNoAssigned) return false;
    if (filterDesignStage !== 'all' && d.designStage !== filterDesignStage) return false;
    if (filterRev         !== 'all' && d.rev         !== filterRev)         return false;
    if (filterS4Status    !== 'all' && d.s4Status    !== filterS4Status)    return false;
    if (filterS5Status    !== 'all' && d.s5Status    !== filterS5Status)    return false;
    return true;
  };

  const hasDrawingFilter = filterDesignStage !== 'all' || filterRev !== 'all' || filterS4Status !== 'all' || filterS5Status !== 'all';

  const itemDrawings = eligibleItems.map(item => ({
    item,
    dwgs: (drawingsByItemId.get(item.id) ?? []).filter(matchesDwgFilter),
  })).filter(({ dwgs }) => !hasDrawingFilter || dwgs.length > 0);

  const sortDwgs = dwgs => [...dwgs].sort((a, b) => (a.drawingNumber ?? '').localeCompare(b.drawingNumber ?? ''));

  // Grouping
  const grouped = (() => {
    if (groupBy === 'project') {
      const map = new Map();
      for (const { item, dwgs } of itemDrawings) {
        const projId   = item.projectId;
        const projName = projects.find(p => p.id === projId)?.name ?? projId ?? 'Unknown Project';
        if (!map.has(projId)) map.set(projId, { key: projName, projectId: projId, drawings: [] });
        map.get(projId).drawings.push(...dwgs);
      }
      return [...map.values()].sort((a, b) => a.key.localeCompare(b.key)).map(g => ({ ...g, drawings: sortDwgs(g.drawings) }));
    }
    if (groupBy === 'designStage') {
      const map = new Map();
      for (const { dwgs } of itemDrawings) {
        for (const d of dwgs) {
          const k = d.designStage ?? 'No Stage';
          if (!map.has(k)) map.set(k, { key: k, projectId: null, drawings: [] });
          map.get(k).drawings.push(d);
        }
      }
      return [...map.values()].sort((a, b) => a.key.localeCompare(b.key)).map(g => ({ ...g, drawings: sortDwgs(g.drawings) }));
    }
    if (groupBy === 'rev') {
      const map = new Map();
      for (const { dwgs } of itemDrawings) {
        for (const d of dwgs) {
          const k = d.rev ?? 'No Rev';
          if (!map.has(k)) map.set(k, { key: k, projectId: null, drawings: [] });
          map.get(k).drawings.push(d);
        }
      }
      return [...map.values()].sort((a, b) => a.key.localeCompare(b.key)).map(g => ({ ...g, drawings: sortDwgs(g.drawings) }));
    }
    if (groupBy === 'dwgType') {
      const map = new Map();
      for (const { dwgs } of itemDrawings) {
        for (const d of dwgs) {
          const k = d.dwgNoAssigned ?? 'Other';
          if (!map.has(k)) map.set(k, { key: k, projectId: null, drawings: [] });
          map.get(k).drawings.push(d);
        }
      }
      return [...map.values()].sort((a, b) => a.key.localeCompare(b.key)).map(g => ({ ...g, drawings: sortDwgs(g.drawings) }));
    }
    if (groupBy === 'none') {
      const allDwgs = sortDwgs(itemDrawings.flatMap(({ dwgs }) => dwgs));
      return [{ key: '__none__', projectId: null, drawings: allDwgs }];
    }
    // Default: group by item
    return itemDrawings
      .map(({ item, dwgs }) => ({
        key:        item.name ?? item.id,
        projectId:  item.projectId,
        itemId:     item.id,
        itemStatus: item.status,
        drawings:   sortDwgs(dwgs),
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  })();

  const visible    = grouped.flatMap(g => g.drawings);
  const visibleCols = colConfig.filter(c => c.visible);

  // Expand / collapse all
  const expandAll   = () => { const s = {}; for (const g of grouped) s[g.key] = true; setExpanded(s); };
  const collapseAll = () => setExpanded({});

  const groupByLabel = { item: 'item', project: 'project', designStage: 'design stage', rev: 'rev', dwgType: 'drawing type', none: 'none' };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','ui-monospace',monospace", padding: '24px 32px' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>DRAWINGS</h1>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            Drawing register · grouped by {groupByLabel[groupBy] ?? groupBy}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 11, color: C.muted }}>
            {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          {lastRefreshed && (
            <span style={{ fontSize: 10, color: C.muted }}>
              updated {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => { setCached('drawings-register', null); setRefreshKey(k => k + 1); }}
            title="Refresh"
            style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontSize: 11, padding: '3px 8px', cursor: 'pointer', lineHeight: 1, fontFamily: 'inherit' }}
          >↻</button>
        </div>
      </div>

      <AppNav />

      {/* Filter / toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={selStyle}>
          <option value="all">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterItem} onChange={e => setFilterItem(e.target.value)} style={selStyle}>
          <option value="all">All Items</option>
          {itemOptions.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
        <select value={filterDesignStage} onChange={e => setFilterDesignStage(e.target.value)} style={selStyle}>
          <option value="all">All Stages</option>
          {designStageOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterRev} onChange={e => setFilterRev(e.target.value)} style={selStyle}>
          <option value="all">All Revs</option>
          {revOptions.map(r => <option key={r} value={r}>Rev {r}</option>)}
        </select>
        <select value={filterS4Status} onChange={e => setFilterS4Status(e.target.value)} style={selStyle}>
          <option value="all">All S4 Status</option>
          {s4StatusOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterS5Status} onChange={e => setFilterS5Status(e.target.value)} style={selStyle}>
          <option value="all">All S5 Status</option>
          {s5StatusOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Group by */}
        <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
          style={{ ...selStyle, marginLeft: 4, borderColor: '#2d4a6e', color: '#93c5fd' }}>
          <option value="dwgType">Group: Dwg Type</option>
          <option value="item">Group: Item</option>
          <option value="project">Group: Project</option>
          <option value="designStage">Group: Design Stage</option>
          <option value="rev">Group: Rev</option>
          <option value="none">No Grouping</option>
        </select>

        {/* Expand / collapse all */}
        <button onClick={expandAll}
          style={{ ...selStyle, cursor: 'pointer', borderColor: '#2d4a6e', color: '#93c5fd' }}>
          Expand All
        </button>
        <button onClick={collapseAll}
          style={{ ...selStyle, cursor: 'pointer', borderColor: '#2d4a6e', color: '#93c5fd' }}>
          Collapse All
        </button>

        {/* Column configurator */}
        <button onClick={() => setShowColPanel(true)}
          style={{ ...selStyle, cursor: 'pointer', borderColor: '#2d4a6e', color: '#93c5fd' }}>
          ⚙ Columns
        </button>

        {/* Assigned only toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
          fontSize: 10, color: filterAssignedOnly ? '#93c5fd' : C.muted, userSelect: 'none' }}>
          <input type="checkbox" checked={filterAssignedOnly}
            onChange={e => setFilterAssignedOnly(e.target.checked)}
            style={{ accentColor: '#3b82f6', cursor: 'pointer' }} />
          Assigned only
        </label>

        {/* Export */}
        <button onClick={() => exportToCSV(visibleCols, grouped)}
          style={{ ...selStyle, cursor: 'pointer', borderColor: '#166534', color: '#4ade80' }}>
          ↓ Export CSV
        </button>

        <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>
          {itemsLoading
            ? 'Loading items…'
            : chunksDone < chunksTotal
              ? `Loading drawings… ${chunksDone}/${chunksTotal}`
              : `${visible.length} drawing${visible.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Content */}
      {fetchError ? (
        <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 12 }}>
          Error: {fetchError}
        </div>
      ) : itemsLoading ? (
        <div style={{ color: C.muted, fontSize: 12 }}>Loading items…</div>
      ) : grouped.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 12 }}>No drawings match filters</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {grouped.map(({ key, projectId, itemStatus, drawings: groupDwgs }) => {
            const projColor    = colorMap.get(projectId) ?? PROJECT_COLORS[0];
            const isExpanded   = groupBy === 'none' ? true : !!expanded[key];
            const groupLoading = chunksDone < chunksTotal;
            const noGrouping   = groupBy === 'none';

            const table = (
              groupLoading && groupDwgs.length === 0 ? (
                <div style={{ padding: '10px 16px', fontSize: 11, color: C.muted }}>Loading drawings…</div>
              ) : groupDwgs.length === 0 ? null : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed',
                    width: visibleCols.reduce((s, c) => s + c.width, 0) }}>
                    <TableHead visibleCols={visibleCols} onResizeStart={startResize} />
                    <tbody>
                      {groupDwgs.map((dwg, idx) => (
                        <DrawingRow key={dwg.id} drawing={dwg} odd={idx % 2 !== 0} visibleCols={visibleCols} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            );

            if (noGrouping) {
              return (
                <div key={key} style={{
                  background: C.bgCard, border: `1px solid ${C.border}`,
                  borderRadius: 10, overflow: 'hidden',
                }}>
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
                {/* Group header */}
                <div
                  onClick={() => setExpanded(prev => ({ ...prev, [key]: !isExpanded }))}
                  style={{ padding: '9px 16px', background: C.bgPanel,
                    borderBottom: isExpanded ? `1px solid ${C.border}` : 'none',
                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                >
                  <span style={{ fontSize: 11, color: C.muted, lineHeight: 1, width: 12, flexShrink: 0 }}>
                    {isExpanded ? '▾' : '▸'}
                  </span>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: projColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{key}</span>
                  <span style={{ fontSize: 10, color: C.muted }}>
                    {groupLoading && groupDwgs.length === 0
                      ? '…'
                      : `${groupDwgs.length} dwg${groupDwgs.length !== 1 ? 's' : ''}`}
                  </span>
                  {itemStatus && <ItemStatusBadge value={itemStatus} />}
                </div>
                {isExpanded && table}
              </div>
            );
          })}
        </div>
      )}

      {/* Column config panel */}
      {showColPanel && (
        <ColumnConfigPanel
          colConfig={colConfig}
          onClose={() => setShowColPanel(false)}
          onChange={newConfig => { setColConfig(newConfig); persistColConfig(newConfig); }}
        />
      )}
    </div>
  );
}
