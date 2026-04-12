import { useState, useEffect, useRef, useCallback } from 'react';
import AppNav from '../components/AppNav.jsx';
import { assignProjectColors, PROJECT_COLORS } from '../data/colors.js';
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
  'A':                   { bg: '#14532d', text: '#4ade80', border: '#166534' },
  'A1':                  { bg: '#14532d', text: '#4ade80', border: '#166534' },
  'A2':                  { bg: '#14532d', text: '#4ade80', border: '#166534' },
  'B':                   { bg: '#78350f', text: '#fcd34d', border: '#92400e' },
  'B1':                  { bg: '#78350f', text: '#fcd34d', border: '#92400e' },
  'B2':                  { bg: '#78350f', text: '#fcd34d', border: '#92400e' },
  'C':                   { bg: '#7f1d1d', text: '#fca5a5', border: '#991b1b' },
  'C1':                  { bg: '#7f1d1d', text: '#fca5a5', border: '#991b1b' },
  'C2':                  { bg: '#7f1d1d', text: '#fca5a5', border: '#991b1b' },
};
const STATUS_DEFAULT = { bg: '#1e2d45', text: '#94a3b8', border: '#2d3f5a' };

function statusStyle(s) {
  if (!s) return STATUS_DEFAULT;
  const key = s.split(/[\s–\-]/)[0]; // first word/letter
  return STATUS_COLORS[key] ?? STATUS_DEFAULT;
}

function StatusBadge({ value }) {
  if (!value) return <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
  const st = statusStyle(value);
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      padding: '2px 6px', borderRadius: 4, background: st.bg, color: st.text,
      border: `1px solid ${st.border}`, whiteSpace: 'nowrap', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis',
    }} title={value}>
      {value}
    </span>
  );
}

// ── Item status badge (task progress) ─────────────────────────────────────────
const ITEM_STATUS_COLORS = {
  'Not Started':    { bg: '#1e2d45', text: '#64748b' },
  'In Progress':    { bg: '#1e3a5f', text: '#60a5fa' },
  'In Review':      { bg: '#312e81', text: '#a5b4fc' },
  'PC Approved':    { bg: '#14532d', text: '#4ade80' },
  'In Manufacture': { bg: '#064e3b', text: '#34d399' },
  'Complete':       { bg: '#064e3b', text: '#34d399' },
  'Omitted':        { bg: '#292524', text: '#78716c' },
  'On Hold':        { bg: '#451a03', text: '#fb923c' },
};
function ItemStatusBadge({ value }) {
  if (!value) return null;
  const sc = ITEM_STATUS_COLORS[value] ?? { bg: '#1e2d45', text: '#94a3b8' };
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 3, background: sc.bg, color: sc.text }}>
      {value}
    </span>
  );
}

// ── Editable date cell ────────────────────────────────────────────────────────
function DateCell({ value, fieldKey, drawingId, onCommit, dragState, onDragStart, onDragEnter, isSelected, isPending }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value ?? '');
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value ?? ''); }, [value]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const commit = (v) => {
    setEditing(false);
    const clean = v?.trim() || null;
    if (clean !== (value ?? null)) onCommit(drawingId, fieldKey, clean || null);
  };

  const highlight = isSelected || isPending;

  return (
    <div style={{ position: 'relative', minWidth: 88 }}>
      {editing ? (
        <input
          ref={inputRef}
          type="date"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(draft); if (e.key === 'Escape') { setEditing(false); setDraft(value ?? ''); } }}
          style={{ width: '100%', background: '#0b1225', border: `1px solid #60a5fa`, borderRadius: 4, color: C.text, fontSize: 11, padding: '3px 6px', outline: 'none', fontFamily: 'inherit', colorScheme: 'dark' }}
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          onMouseDown={e => { if (e.target === e.currentTarget) { e.preventDefault(); onDragStart?.(drawingId, fieldKey); } }}
          onMouseEnter={() => dragState?.active && onDragEnter?.(drawingId, fieldKey)}
          style={{
            padding: '3px 6px', borderRadius: 4, cursor: 'text', minHeight: 22,
            background: highlight ? hexToRgba('#3b82f6', 0.18) : 'transparent',
            border: `1px solid ${highlight ? '#3b82f6' : 'transparent'}`,
            color: value ? (isPending ? '#93c5fd' : C.text) : C.muted,
            fontSize: 11, fontFamily: 'inherit', display: 'flex', alignItems: 'center',
            transition: 'background 0.1s, border-color 0.1s',
            userSelect: 'none',
          }}
        >
          {value ? fmtDate(value) : '—'}
          {/* drag handle */}
          <span
            onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onDragStart?.(drawingId, fieldKey); }}
            style={{ marginLeft: 'auto', paddingLeft: 4, cursor: 'row-resize', color: C.muted, fontSize: 9, opacity: 0.5, lineHeight: 1 }}
            title="Drag to fill down"
          >▼</span>
        </div>
      )}
    </div>
  );
}

// ── Editable select cell ──────────────────────────────────────────────────────
function SelectCell({ value, fieldKey, drawingId, options, onCommit, dragState, onDragStart, onDragEnter, isSelected, isPending }) {
  const [editing, setEditing] = useState(false);
  const selectRef = useRef(null);

  useEffect(() => { if (editing && selectRef.current) selectRef.current.focus(); }, [editing]);

  const commit = (v) => {
    setEditing(false);
    const clean = v || null;
    if (clean !== (value ?? null)) onCommit(drawingId, fieldKey, clean);
  };

  const highlight = isSelected || isPending;

  if (editing) {
    return (
      <select
        ref={selectRef}
        defaultValue={value ?? ''}
        onChange={e => commit(e.target.value)}
        onBlur={() => setEditing(false)}
        style={{ width: '100%', background: C.input, border: `1px solid #60a5fa`, borderRadius: 4, color: C.text, fontSize: 11, padding: '3px 6px', outline: 'none', fontFamily: 'inherit', colorScheme: 'dark' }}
      >
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      onMouseDown={e => { if (!editing) { e.preventDefault(); onDragStart?.(drawingId, fieldKey); } }}
      onMouseEnter={() => dragState?.active && onDragEnter?.(drawingId, fieldKey)}
      style={{
        padding: '3px 6px', borderRadius: 4, cursor: 'pointer', minHeight: 22, minWidth: 80,
        background: highlight ? hexToRgba('#3b82f6', 0.18) : 'transparent',
        border: `1px solid ${highlight ? '#3b82f6' : 'transparent'}`,
        transition: 'background 0.1s, border-color 0.1s',
        userSelect: 'none',
      }}
    >
      <StatusBadge value={isPending ? value : value} />
      {value && (
        <span
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onDragStart?.(drawingId, fieldKey); }}
          style={{ marginLeft: 4, cursor: 'row-resize', color: C.muted, fontSize: 9, opacity: 0.5 }}
          title="Drag to fill down"
        >▼</span>
      )}
    </div>
  );
}

// ── Column headers ─────────────────────────────────────────────────────────────
function TableHead() {
  const th = (label, width, align = 'left') => (
    <th key={label} style={{ padding: '7px 10px', textAlign: align, fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', whiteSpace: 'nowrap', width, borderBottom: `1px solid ${C.border}`, background: '#080d17' }}>
      {label}
    </th>
  );
  return (
    <thead>
      <tr>
        {th('Dwg No / Stage / Rev', 130)}
        {th('Title', undefined)}
        {th('S4 Submit', 96, 'center')}
        {th('S4 Status Date / Status', 140, 'center')}
        {th('S5 Submit', 96, 'center')}
        {th('S5 Status Date / Status', 140, 'center')}
      </tr>
    </thead>
  );
}

// ── Drawing row ───────────────────────────────────────────────────────────────
function DrawingRow({ drawing, odd, pending, editOptions, dragState, onDragStart, onDragEnter, onCommit, isInDragRange }) {
  const { id, drawingNumber, title1, title2, title3, designStage, rev,
          s4Submit, s4Status, s4StatusDate,
          s5Submit, s5Status, s5StatusDate } = drawing;

  // Merge pending edits into displayed values
  const p = pending[id] ?? {};
  const vals = {
    s4SubmitActual: p.s4SubmitActual !== undefined ? p.s4SubmitActual : (s4Submit?.actual ?? null),
    s4StatusDate:   p.s4StatusDate   !== undefined ? p.s4StatusDate   : (s4StatusDate ?? null),
    s4Status:       p.s4Status       !== undefined ? p.s4Status       : (s4Status ?? null),
    s5SubmitActual: p.s5SubmitActual !== undefined ? p.s5SubmitActual : (s5Submit?.actual ?? null),
    s5StatusDate:   p.s5StatusDate   !== undefined ? p.s5StatusDate   : (s5StatusDate ?? null),
    s5Status:       p.s5Status       !== undefined ? p.s5Status       : (s5Status ?? null),
  };

  const hasPending = Object.keys(p).length > 0;

  const cellProps = (fieldKey) => ({
    drawingId: id, fieldKey, onCommit,
    dragState,
    onDragStart,
    onDragEnter,
    isSelected: dragState?.active && dragState.field === fieldKey && isInDragRange,
    isPending: p[fieldKey] !== undefined,
  });

  return (
    <tr style={{
      background: odd ? '#0b1020' : C.bgCard,
      borderBottom: `1px solid ${C.grid}`,
      outline: hasPending ? `1px solid ${hexToRgba('#3b82f6', 0.3)}` : 'none',
      outlineOffset: -1,
    }}>
      {/* Col 1: Drawing Number / Design Stage / Rev */}
      <td style={{ padding: '6px 10px', verticalAlign: 'top' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: 'inherit' }}>{drawingNumber || '—'}</div>
        {designStage && <div style={{ fontSize: 10, color: C.sec, marginTop: 2 }}>{designStage}</div>}
        {rev && <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>Rev {rev}</div>}
      </td>

      {/* Col 2: Titles stacked */}
      <td style={{ padding: '6px 10px', verticalAlign: 'top', maxWidth: 280 }}>
        {title1 && <div style={{ fontSize: 12, color: C.text, lineHeight: 1.35 }}>{title1}</div>}
        {title2 && <div style={{ fontSize: 11, color: C.sec, lineHeight: 1.35 }}>{title2}</div>}
        {title3 && <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.35 }}>{title3}</div>}
        {!title1 && !title2 && !title3 && <span style={{ color: C.muted, fontSize: 10 }}>—</span>}
      </td>

      {/* Col 3: S4 Submit Date (Actual) */}
      <td style={{ padding: '6px 10px', textAlign: 'center', verticalAlign: 'middle' }}>
        <DateCell value={vals.s4SubmitActual} {...cellProps('s4SubmitActual')} />
      </td>

      {/* Col 4: S4 Status Date + S4 Status */}
      <td style={{ padding: '6px 10px', textAlign: 'center', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <DateCell value={vals.s4StatusDate} {...cellProps('s4StatusDate')} />
          <SelectCell value={vals.s4Status} options={editOptions.s4Status} {...cellProps('s4Status')} />
        </div>
      </td>

      {/* Col 5: S5 Submit Date (Actual) */}
      <td style={{ padding: '6px 10px', textAlign: 'center', verticalAlign: 'middle' }}>
        <DateCell value={vals.s5SubmitActual} {...cellProps('s5SubmitActual')} />
      </td>

      {/* Col 6: S5 Status Date + S5 Status */}
      <td style={{ padding: '6px 10px', textAlign: 'center', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <DateCell value={vals.s5StatusDate} {...cellProps('s5StatusDate')} />
          <SelectCell value={vals.s5Status} options={editOptions.s5Status} {...cellProps('s5Status')} />
        </div>
      </td>
    </tr>
  );
}

// ── Filter bar styles ──────────────────────────────────────────────────────────
const selStyle = { background: C.input, border: `1px solid ${C.border}`, color: C.sec, fontSize: 10, borderRadius: 4, padding: '3px 6px', cursor: 'pointer', fontFamily: 'inherit' };

const CHUNK_SIZE = 25; // item IDs per drawings fetch

// ── PCSA filter — items containing "PCSA" in their name are ignored globally ──
const isPCSA = n => (n ?? '').toUpperCase().includes('PCSA');

// ── Main page ──────────────────────────────────────────────────────────────────
export default function DrawingsPage() {
  const [regItems,      setRegItems]      = useState([]);
  const [itemsLoading,  setItemsLoading]  = useState(true); // true until first load completes
  const [drawings,      setDrawings]      = useState([]);
  const [chunksTotal,   setChunksTotal]   = useState(0);
  const [chunksDone,    setChunksDone]    = useState(0);
  const [projects,      setProjects]      = useState([]);
  const [fetchError,    setFetchError]    = useState(null);
  const [refreshKey,    setRefreshKey]    = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [expanded,      setExpanded]      = useState({});

  const [filterProject,     setFilterProject]     = useState('all');
  const [filterItem,        setFilterItem]        = useState('all');
  const [filterDesignStage, setFilterDesignStage] = useState('all');
  const [filterRev,         setFilterRev]         = useState('all');
  const [filterS4Status,    setFilterS4Status]    = useState('all');
  const [filterS5Status,    setFilterS5Status]    = useState('all');
  const [groupBy,           setGroupBy]           = useState('item');

  const [pending,    setPending]    = useState({});
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveError,  setSaveError]  = useState(null);
  const [dragState,  setDragState]  = useState(null);
  const dragRef = useRef(null);

  const today = new Date();

  useEffect(() => {
    const id = setInterval(() => setRefreshKey(k => k + 1), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // ── Projects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const cached = getCached('projects');
    if (cached) { setProjects(cached); return; }
    fetch('/api/projects').then(r => r.json())
      .then(d => { const list = Array.isArray(d) ? d : []; setCached('projects', list); setProjects(list); })
      .catch(() => {});
  }, []);

  // ── Phase 1: load items for all projects in parallel (or just the selected one)
  // Firing N scoped requests in parallel avoids any single unfiltered query that
  // would time out on large databases. Each per-project call is fast.
  useEffect(() => {
    if (!projects.length) return; // wait for project list

    setItemsLoading(true);
    setFetchError(null);
    setRegItems([]);
    setDrawings([]);

    const projectIds = filterProject === 'all'
      ? projects.map(p => p.id)
      : [filterProject];

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

  // ── Phase 2: load drawings in parallel chunks once items are known ──────────
  useEffect(() => {
    if (!regItems.length) return;

    const cacheKey  = `dr-drawings:${filterProject}`;
    const cachedDwgs = getCached(cacheKey);
    if (cachedDwgs && refreshKey === 0) {
      setDrawings(cachedDwgs);
      setLastRefreshed(new Date());
      return;
    }

    const itemIds = regItems.map(i => i.id);
    const chunks  = [];
    for (let i = 0; i < itemIds.length; i += CHUNK_SIZE) {
      chunks.push(itemIds.slice(i, i + CHUNK_SIZE));
    }

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

  // ── Colour map ──────────────────────────────────────────────────────────────
  const allProjIds = [...new Set([...projects.map(p => p.id), ...regItems.map(i => i.projectId).filter(Boolean)])];
  const colorMap   = assignProjectColors(allProjIds.map(id => ({ id })));

  // ── Lookup maps ─────────────────────────────────────────────────────────────
  // drawings indexed by their first itemId for quick per-group retrieval
  const drawingsByItemId = new Map();
  for (const dwg of drawings) {
    const iid = dwg.itemIds?.[0] ?? null;
    if (!iid) continue;
    if (!drawingsByItemId.has(iid)) drawingsByItemId.set(iid, []);
    drawingsByItemId.get(iid).push(dwg);
  }

  // ── Filter options ──────────────────────────────────────────────────────────
  const itemOptions        = [...new Set(regItems.filter(i => !isPCSA(i.name)).map(i => i.name).filter(Boolean))].sort();
  const designStageOptions = [...new Set(drawings.map(d => d.designStage).filter(Boolean))].sort();
  const revOptions         = [...new Set(drawings.map(d => d.rev).filter(Boolean))].sort();
  const s4StatusOptions    = [...new Set(drawings.map(d => d.s4Status).filter(Boolean))].sort();
  const s5StatusOptions    = [...new Set(drawings.map(d => d.s5Status).filter(Boolean))].sort();

  // ── Grouping ─────────────────────────────────────────────────────────────────
  // PCSA items are excluded globally. Then filter by item-level and drawing-level
  // criteria, then group according to groupBy state.
  const eligibleItems = regItems.filter(item => {
    if (isPCSA(item.name)) return false;
    if (filterProject !== 'all' && item.projectId !== filterProject) return false;
    if (filterItem    !== 'all' && item.name      !== filterItem)    return false;
    return true;
  });

  const matchesDwgFilter = d => {
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

  const grouped = (() => {
    if (groupBy === 'project') {
      const map = new Map();
      for (const { item, dwgs } of itemDrawings) {
        const projId   = item.projectId;
        const projName = projects.find(p => p.id === projId)?.name ?? projId ?? 'Unknown Project';
        if (!map.has(projId)) map.set(projId, { key: projName, projectId: projId, drawings: [] });
        map.get(projId).drawings.push(...dwgs);
      }
      return [...map.values()];
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
      return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
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
      return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
    }
    // Default: group by item
    return itemDrawings.map(({ item, dwgs }) => ({
      key:        item.name ?? item.id,
      projectId:  item.projectId,
      itemId:     item.id,
      itemStatus: item.status,
      drawings:   dwgs,
    }));
  })();

  // flat visible drawings list (for drag-range ordering)
  const visible    = grouped.flatMap(g => g.drawings);
  const orderedIds = visible.map(d => d.id);

  // ── Drag-to-fill handlers ─────────────────────────────────────────────────
  const handleDragStart = useCallback((drawingId, field) => {
    const state = { active: true, startId: drawingId, field, endId: drawingId };
    dragRef.current = state;
    setDragState(state);

    const onMouseUp = () => {
      const s = dragRef.current;
      if (!s) return;
      setDragState(null);
      dragRef.current = null;

      // Compute range and fill
      const start = orderedIds.indexOf(s.startId);
      const end   = orderedIds.indexOf(s.endId);
      if (start === -1 || end === -1 || start === end) return;

      const lo = Math.min(start, end), hi = Math.max(start, end);
      const sourceDrawing = drawings.find(d => d.id === s.startId);
      if (!sourceDrawing) return;

      // Get source value (including any pending edit)
      const pendingSource = pending[s.startId] ?? {};
      let sourceVal;
      const field = s.field;
      if (pendingSource[field] !== undefined) sourceVal = pendingSource[field];
      else if (field === 's4SubmitActual') sourceVal = sourceDrawing.s4Submit?.actual ?? null;
      else if (field === 's4StatusDate')   sourceVal = sourceDrawing.s4StatusDate ?? null;
      else if (field === 's4Status')       sourceVal = sourceDrawing.s4Status ?? null;
      else if (field === 's5SubmitActual') sourceVal = sourceDrawing.s5Submit?.actual ?? null;
      else if (field === 's5StatusDate')   sourceVal = sourceDrawing.s5StatusDate ?? null;
      else if (field === 's5Status')       sourceVal = sourceDrawing.s5Status ?? null;

      setPending(prev => {
        const next = { ...prev };
        for (let i = lo; i <= hi; i++) {
          const tid = orderedIds[i];
          if (tid === s.startId) continue; // skip source
          next[tid] = { ...(next[tid] ?? {}), [field]: sourceVal };
        }
        return next;
      });
    };

    window.addEventListener('mouseup', onMouseUp, { once: true });
  }, [drawings, orderedIds, pending]);

  const handleDragEnter = useCallback((drawingId, field) => {
    if (!dragRef.current || dragRef.current.field !== field) return;
    dragRef.current = { ...dragRef.current, endId: drawingId };
    setDragState(prev => prev ? { ...prev, endId: drawingId } : prev);
  }, []);

  function isInDragRange(drawingId, field) {
    if (!dragState || !dragState.active || dragState.field !== field) return false;
    const start = orderedIds.indexOf(dragState.startId);
    const end   = orderedIds.indexOf(dragState.endId);
    const pos   = orderedIds.indexOf(drawingId);
    if (start === -1 || end === -1 || pos === -1) return false;
    return pos >= Math.min(start, end) && pos <= Math.max(start, end);
  }

  // ── Commit a single cell edit ─────────────────────────────────────────────
  const handleCommit = useCallback((drawingId, fieldKey, value) => {
    setPending(prev => ({
      ...prev,
      [drawingId]: { ...(prev[drawingId] ?? {}), [fieldKey]: value },
    }));
    setSaveStatus('idle');
  }, []);

  // ── Save all pending edits ────────────────────────────────────────────────
  const pendingCount = Object.values(pending).reduce((n, fields) => n + Object.keys(fields).length, 0);

  const saveAll = async () => {
    const updates = Object.entries(pending).map(([id, fields]) => ({ id, fields })).filter(({ fields }) => Object.keys(fields).length > 0);
    if (!updates.length) return;

    setSaveStatus('saving');
    setSaveError(null);
    try {
      const res = await fetch('/api/drawings-register/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const data = await res.json();
      if (!data.ok) throw new Error(`${data.failed?.length ?? 0} updates failed`);

      // Merge pending into drawings state, clear pending
      setDrawings(prev => prev.map(d => {
        const edits = pending[d.id];
        if (!edits) return d;
        const next = { ...d };
        if (edits.s4SubmitActual !== undefined) next.s4Submit = { ...d.s4Submit, actual: edits.s4SubmitActual };
        if (edits.s4StatusDate   !== undefined) next.s4StatusDate   = edits.s4StatusDate;
        if (edits.s4Status       !== undefined) next.s4Status       = edits.s4Status;
        if (edits.s5SubmitActual !== undefined) next.s5Submit = { ...d.s5Submit, actual: edits.s5SubmitActual };
        if (edits.s5StatusDate   !== undefined) next.s5StatusDate   = edits.s5StatusDate;
        if (edits.s5Status       !== undefined) next.s5Status       = edits.s5Status;
        return next;
      }));
      // Bust cache so next load picks up fresh data
      setCached('drawings-register', null);
      setPending({});
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e) {
      setSaveStatus('error');
      setSaveError(e.message);
    }
  };

  const discardAll = () => { setPending({}); setSaveStatus('idle'); setSaveError(null); };

  const editOptions = { s4Status: s4StatusOptions, s5Status: s5StatusOptions };

  return (
    <div
      style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','ui-monospace',monospace", padding: '24px 32px' }}
      onMouseLeave={() => { if (dragRef.current) { dragRef.current = null; setDragState(null); } }}
    >
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>DRAWINGS</h1>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Drawing register · grouped by {groupBy === 'designStage' ? 'design stage' : groupBy}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 11, color: C.muted }}>
            {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          {lastRefreshed && <span style={{ fontSize: 10, color: C.muted }}>updated {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={() => { setCached('drawings-register', null); setRefreshKey(k => k + 1); }} title="Refresh" style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontSize: 11, padding: '3px 8px', cursor: 'pointer', lineHeight: 1 }}>↻</button>
        </div>
      </div>

      <AppNav />

      {/* Filter bar */}
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
        <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={{ ...selStyle, marginLeft: 8, borderColor: '#2d4a6e', color: '#93c5fd' }}>
          <option value="item">Group: Item</option>
          <option value="project">Group: Project</option>
          <option value="designStage">Group: Design Stage</option>
          <option value="rev">Group: Rev</option>
        </select>
        <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>
          {itemsLoading
            ? 'Loading items…'
            : chunksDone < chunksTotal
              ? `Loading drawings… ${chunksDone}/${chunksTotal}`
              : `${visible.length} drawings`}
        </span>
      </div>

      {/* Pending changes save bar */}
      {(pendingCount > 0 || saveStatus !== 'idle') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '8px 14px', borderRadius: 8, background: saveStatus === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.08)', border: `1px solid ${saveStatus === 'error' ? 'rgba(239,68,68,0.25)' : 'rgba(59,130,246,0.25)'}` }}>
          {saveStatus === 'saving' && <span style={{ fontSize: 11, color: '#60a5fa' }}>Saving {Object.keys(pending).length} drawing(s)…</span>}
          {saveStatus === 'saved'  && <span style={{ fontSize: 11, color: '#34d399' }}>All changes saved ✓</span>}
          {saveStatus === 'error'  && <span style={{ fontSize: 11, color: '#f87171' }}>Save failed: {saveError}</span>}
          {saveStatus === 'idle'   && <span style={{ fontSize: 11, color: '#93c5fd' }}>{pendingCount} unsaved change{pendingCount !== 1 ? 's' : ''} across {Object.keys(pending).length} drawing{Object.keys(pending).length !== 1 ? 's' : ''}</span>}
          {pendingCount > 0 && saveStatus !== 'saving' && (
            <>
              <button onClick={saveAll} style={{ marginLeft: 'auto', padding: '4px 14px', borderRadius: 5, border: 'none', background: '#1d4ed8', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Save to Notion</button>
              <button onClick={discardAll} style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.border}`, background: 'transparent', color: C.sec, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Discard</button>
            </>
          )}
        </div>
      )}

      {/* Content */}
      {fetchError ? (
        <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 12 }}>
          Error: {fetchError}
        </div>
      ) : itemsLoading ? (
        <div style={{ color: C.muted, fontSize: 12 }}>Loading items…</div>
      ) : grouped.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 12 }}>No items match filters</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {grouped.map(({ key, projectId, itemId, itemStatus, drawings: groupDwgs }) => {
            const projColor      = colorMap.get(projectId) ?? PROJECT_COLORS[0];
            const isExpanded     = !!expanded[key]; // default collapsed
            const groupLoading   = chunksDone < chunksTotal; // drawings still arriving

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
                  onClick={() => setExpanded(prev => ({ ...prev, [key]: !isExpanded }))}
                  style={{ padding: '9px 16px', background: C.bgPanel, borderBottom: isExpanded ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                >
                  <span style={{ fontSize: 11, color: C.muted, lineHeight: 1, width: 12, flexShrink: 0 }}>{isExpanded ? '▾' : '▸'}</span>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: projColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{key}</span>
                  <span style={{ fontSize: 10, color: C.muted }}>
                    {groupLoading && groupDwgs.length === 0
                      ? '…'
                      : `${groupDwgs.length} dwg${groupDwgs.length !== 1 ? 's' : ''}`}
                  </span>
                  {itemStatus && <ItemStatusBadge value={itemStatus} />}
                </div>

                {/* Drawing table */}
                {isExpanded && (
                  groupLoading && groupDwgs.length === 0 ? (
                    <div style={{ padding: '10px 16px', fontSize: 11, color: C.muted }}>Loading drawings…</div>
                  ) : groupDwgs.length === 0 ? (
                    <div style={{ padding: '10px 16px', fontSize: 11, color: C.muted }}>No drawings</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <TableHead />
                        <tbody>
                          {groupDwgs.map((dwg, idx) => (
                            <DrawingRow
                              key={dwg.id}
                              drawing={dwg}
                              odd={idx % 2 !== 0}
                              pending={pending}
                              editOptions={editOptions}
                              dragState={dragState}
                              onDragStart={handleDragStart}
                              onDragEnter={handleDragEnter}
                              onCommit={handleCommit}
                              isInDragRange={isInDragRange(dwg.id, dragState?.field)}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
