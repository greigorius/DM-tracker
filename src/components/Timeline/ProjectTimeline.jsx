/**
 * ProjectTimeline — horizontal Gantt chart
 *
 * Props:
 *   projectId        string  — fetch /api/projects/:id/timeline when provided
 *   projectName      string  — heading (single-project view)
 *   items            array   — pre-fetched items (combined view skips internal fetch)
 *   showProjectBadge bool    — render per-item project colour indicator
 *
 * Behaviour:
 *   • Viewport defaults to 2 weeks centred on today; full timeline scrollable horizontally
 *   • Item rows filter dynamically so only items with activity in the visible window appear
 *   • WCAG AA contrast throughout (all text ≥ 4.5 : 1 on darkest background)
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// ── Layout constants ──────────────────────────────────────────────────────────
const DAY_W     = 56    // px per day  →  14 days ≈ 784 px in viewport
const LABEL_W   = 256   // px sticky name column
const ROW_H     = 56    // px item row
const DWG_ROW_H = 42    // px drawing sub-row

// ── Accessible colour palette ─────────────────────────────────────────────────
const C = {
  bg:       '#0a0f1a',
  bgAlt:    '#0d1525',
  bgHover:  '#182035',
  bgSub:    '#080e1a',
  bgHeader: '#0d1830',

  border:    '#1e2d45',
  borderSub: '#131e30',

  text:      '#e2e8f0',
  textSec:   '#94a3b8',
  textMuted: '#7b90b0',
  textWeek:  '#8899b4',
  textBlue:  '#60a5fa',

  todayLine: 'rgba(74,222,128,0.75)',
  gridLine:  '#1a2540',
  gridMonth: '#1e2d45',
};

// ── Milestone colours ─────────────────────────────────────────────────────────
const MC = {
  dt1:    { bg: '#1e3a5f', text: '#60a5fa' },
  p01:    { bg: '#2e1f5e', text: '#818cf8' },
  s4:     { bg: '#78350f', text: '#fbbf24' },
  dt2:    { bg: '#1e3a5f', text: '#60a5fa' },
  p02:    { bg: '#2e1f5e', text: '#818cf8' },
  s5:     { bg: '#2e1065', text: '#a78bfa' },
  dtc:    { bg: '#3b1a3b', text: '#e879f9' },
  c01:    { bg: '#1a3a2a', text: '#34d399' },
  prod:   { bg: '#1a3a2a', text: '#34d399' },
  s4dwg:  { bg: '#78350f', text: '#fbbf24' },
  s5dwg:  { bg: '#2e1065', text: '#a78bfa' },
  c01dwg: { bg: '#1a3a2a', text: '#34d399' },
};

const ITEM_MILESTONES = [
  { key: 'dt1Start',    label: 'DT1↑', ck: 'dt1'  },
  { key: 'dt1Delivery', label: 'DT1↓', ck: 'dt1'  },
  { key: 'sub1',        label: 'P01',  ck: 'p01'  },
  { key: 's4Status',    label: 'S4',   ck: 's4'   },
  { key: 'dt2Start',    label: 'DT2↑', ck: 'dt2'  },
  { key: 'dt2Delivery', label: 'DT2↓', ck: 'dt2'  },
  { key: 'sub2',        label: 'P02',  ck: 'p02'  },
  { key: 's5Status',    label: 'S5',   ck: 's5'   },
  { key: 'dtcDelivery', label: 'DTC',  ck: 'dtc'  },
  { key: 'subC01',      label: 'C01',  ck: 'c01'  },
  { key: 'production',  label: 'PROD', ck: 'prod' },
];

const DWG_MILESTONES = [
  { key: 's4Submit',  label: 'S4',  ck: 's4dwg'  },
  { key: 's5Submit',  label: 'S5',  ck: 's5dwg'  },
  { key: 'c01Submit', label: 'C01', ck: 'c01dwg' },
];

const LEGEND_ITEMS = [
  { ck: 'dt1', label: 'DT1↑', desc: 'DT start — 1st issue'          },
  { ck: 'dt1', label: 'DT1↓', desc: 'DT delivery — 1st issue'       },
  { ck: 'p01', label: 'P01',  desc: '1st submission for approval'    },
  { ck: 's4',  label: 'S4',   desc: 'S4 contractor approval'         },
  { ck: 'dt2', label: 'DT2↑', desc: 'DT start — 2nd issue'          },
  { ck: 'dt2', label: 'DT2↓', desc: 'DT delivery — 2nd issue'       },
  { ck: 'p02', label: 'P02',  desc: '2nd submission for approval'    },
  { ck: 's5',  label: 'S5',   desc: 'S5 client approval'             },
  { ck: 'dtc', label: 'DTC',  desc: 'Construction issue DT delivery' },
  { ck: 'c01', label: 'C01',  desc: 'Construction issue submission'  },
  { ck: 'prod',label: 'PROD', desc: 'Production start'               },
];

const STATUS_COLORS = {
  'Backlog':                  { bg: '#37352f', text: '#c9c8c2' },
  'In Review':                { bg: '#2e2459', text: '#c5bcf0' },
  'On Hold - Supplier Info':  { bg: '#3b2f14', text: '#e8c06a' },
  'On Hold - RFIs':           { bg: '#3b1a1a', text: '#f09090' },
  'In Progress':              { bg: '#3b2714', text: '#f0a030' },
  'Pre-Submittal Check':      { bg: '#3b3214', text: '#e0c840' },
  '1st Issue - Approval':     { bg: '#0f2a4a', text: '#80b8e8' },
  '1st Comments Received':    { bg: '#3b1f2e', text: '#d898b8' },
  'Revisions Approval':       { bg: '#3b1f2e', text: '#d898b8' },
  '2nd Issue - Approval':     { bg: '#3b1f2e', text: '#d898b8' },
  '2nd Comments Received':    { bg: '#2e2318', text: '#c0a888' },
  'Revisions Construction':   { bg: '#2e2318', text: '#c0a888' },
  '2nd Issue - Construction': { bg: '#2e2318', text: '#c0a888' },
  'Pre-Production':           { bg: '#3b3214', text: '#e0c840' },
  'PC Approved':              { bg: '#14532d', text: '#6ee7a0' },
  'In Manufacture':           { bg: '#14532d', text: '#6ee7a0' },
  'Construction Sign Off':    { bg: '#3b2714', text: '#f0a030' },
  'Complete':                 { bg: '#14532d', text: '#6ee7a0' },
  'Omitted':                  { bg: '#252525', text: '#909090' },
};

const COMPLETED = new Set(['PC Approved', 'In Manufacture', 'Complete', 'Omitted']);

// ── Helpers ───────────────────────────────────────────────────────────────────
const daysBetween = (a, b) => (b - a) / 86_400_000;
const bestDate    = d => d ? (d.actual || d.adj || d.plan || null) : null;

function pickBest(d, viewMode) {
  if (!d) return null;
  if (viewMode === 'plan')   return d.plan   ?? null;
  if (viewMode === 'actual') return d.actual ?? d.adj ?? d.plan ?? null;
  /* adj */                  return d.adj    ?? d.plan ?? null;
}

function itemSpan(item, viewMode) {
  const all = [];
  for (const m of ITEM_MILESTONES) {
    const d = item.dates?.[m.key];
    const v = pickBest(d, viewMode);
    if (v) all.push(new Date(v));
  }
  if (!all.length) return null;
  all.sort((a, b) => a - b);

  const dt1Raw  = item.dates?.dt1Start ?? item.dates?.dt1Delivery;
  const dt1Str  = pickBest(dt1Raw, viewMode);
  const start   = dt1Str ? new Date(dt1Str) : all[0];

  const c01Raw  = item.dates?.subC01;
  const c01Str  = pickBest(c01Raw, viewMode);
  const end     = c01Str ? new Date(c01Str) : all[all.length - 1];

  return { start, end };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ProjectTimeline({
  projectId,
  projectName,
  items: propItems,
  showProjectBadge = false,
}) {
  const [fetchedItems, setFetchedItems] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);

  const scrollRef   = useRef(null);
  const scrolledRef = useRef(false);

  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportW,  setViewportW]  = useState(900);

  const filterScrollRef = useRef(0);
  const [filterScroll, setFilterScroll] = useState(0);

  const [viewMode,     setViewMode]     = useState('adj');
  const [filterCat,    setFilterCat]    = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');
  const [expanded,     setExpanded]     = useState({});
  const [hoveredItem,  setHoveredItem]  = useState(null);
  const [tooltip,      setTooltip]      = useState(null);

  const items = propItems ?? fetchedItems;

  // ── Fetch ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId || propItems) return;
    setLoading(true);
    setFetchedItems([]);
    setExpanded({});
    scrolledRef.current = false;
    let cancelled = false;
    fetch(`/api/projects/${projectId}/timeline`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        if (cancelled) return;
        setFetchedItems(data.items || []);
        setError(null);
        setLoading(false);
        if (data.phase === 'tasks') {
          fetch(`/api/projects/${projectId}/timeline?phase=all`)
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d2 => { if (!cancelled) setFetchedItems(d2.items || []); })
            .catch(() => {});
        }
      })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (propItems) scrolledRef.current = false;
  }, [propItems]);

  // ── Scroll tracking ─────────────────────────────────────────────────────────
  const hasItems = items.length > 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let debounceTimer;
    const onScroll = () => {
      const sl = el.scrollLeft;
      setScrollLeft(sl);
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        filterScrollRef.current = sl;
        setFilterScroll(sl);
      }, 180);
    };

    const ro = new ResizeObserver(([entry]) => setViewportW(entry.contentRect.width));
    el.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      clearTimeout(debounceTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasItems]);

  // ── Date range ──────────────────────────────────────────────────────────────
  const { minDate, totalDays } = useMemo(() => {
    const all = [];
    items.forEach(item => {
      Object.values(item.dates || {}).forEach(d => {
        ['plan','adj','actual'].forEach(k => { if (d?.[k]) all.push(new Date(d[k])); });
      });
      (item.drawings || []).forEach(dwg => {
        DWG_MILESTONES.forEach(m => {
          ['plan','adj','actual'].forEach(k => { if (dwg[m.key]?.[k]) all.push(new Date(dwg[m.key][k])); });
        });
      });
    });
    if (!all.length) {
      const t = new Date();
      t.setDate(t.getDate() - 14);
      return { minDate: t, totalDays: 365 };
    }
    all.sort((a, b) => a - b);
    const lo = new Date(all[0].getTime()            - 56 * 86_400_000);
    const hi = new Date(all[all.length-1].getTime() + 56 * 86_400_000);
    const dow = lo.getDay();
    lo.setDate(lo.getDate() - (dow === 0 ? 6 : dow - 1));
    return { minDate: lo, totalDays: Math.ceil(daysBetween(lo, hi)) };
  }, [items]);

  const totalWidth = totalDays * DAY_W;

  const dateX = useCallback(date => {
    if (!date) return null;
    const dt = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dt)) return null;
    return Math.round(daysBetween(minDate, dt) * DAY_W);
  }, [minDate]);

  const todayX = useMemo(() => {
    const t = new Date(); t.setHours(0,0,0,0);
    return dateX(t);
  }, [dateX]);

  // ── Initial scroll: centre today ────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || items.length === 0 || scrolledRef.current) return;
    scrolledRef.current = true;
    const ganttVW = el.clientWidth - LABEL_W;
    const tx = todayX ?? 0;
    const target = Math.max(0, tx - ganttVW / 2);
    requestAnimationFrame(() => {
      el.scrollLeft = target;
      setScrollLeft(target);
      setFilterScroll(target);
      filterScrollRef.current = target;
    });
  }, [items.length, todayX]);

  // ── Scroll-to-today ─────────────────────────────────────────────────────────
  const scrollToToday = useCallback(() => {
    const el = scrollRef.current;
    if (!el || todayX === null) return;
    const ganttVW = el.clientWidth - LABEL_W;
    const target  = Math.max(0, todayX - ganttVW / 2);
    el.scrollLeft = target;
    setScrollLeft(target);
    setFilterScroll(target);
    filterScrollRef.current = target;
  }, [todayX]);

  // ── Week headers ────────────────────────────────────────────────────────────
  const weekHeaders = useMemo(() => {
    const hs = [];
    const d  = new Date(minDate);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    while (daysBetween(minDate, d) < totalDays) {
      const x = Math.round(daysBetween(minDate, d) * DAY_W);
      hs.push({
        x,
        label:   d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        isMonth: d.getDate() <= 7,
        month:   d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      });
      d.setDate(d.getDate() + 7);
    }
    return hs;
  }, [minDate, totalDays]);

  // ── Filters ─────────────────────────────────────────────────────────────────
  const categoryFiltered = useMemo(() =>
    items.filter(item => {
      if (filterCat !== 'all' && item.contractCategory !== filterCat) return false;
      if (filterStatus === 'active'   && COMPLETED.has(item.status)) return false;
      if (filterStatus === 'complete' && !COMPLETED.has(item.status)) return false;
      return true;
    }),
  [items, filterCat, filterStatus]);

  const visibleItems = useMemo(() => {
    const ganttVW  = Math.max(viewportW - LABEL_W, DAY_W * 14);
    const winLeft  = new Date(minDate.getTime() + (filterScroll / DAY_W)             * 86_400_000);
    const winRight = new Date(minDate.getTime() + ((filterScroll + ganttVW) / DAY_W) * 86_400_000);

    return categoryFiltered.filter(item => {
      const span = itemSpan(item, viewMode);
      if (!span) return false;
      return span.start <= winRight && span.end >= winLeft;
    });
  }, [categoryFiltered, filterScroll, viewportW, minDate, viewMode]);

  // ── Milestone badge ─────────────────────────────────────────────────────────
  const renderMilestone = (date, ck, label, dateType) => {
    const x = dateX(date);
    if (x === null) return null;
    const colors  = MC[ck];
    if (!colors) return null;
    const opacity   = dateType === 'actual' ? 1 : dateType === 'adj' ? 0.9 : 0.45;
    const dt        = typeof date === 'string' ? new Date(date) : date;
    const dateLabel = !isNaN(dt) ? dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

    return (
      <div
        key={`${label}-${dateType}-${date}`}
        style={{ position: 'absolute', left: x, top: '50%', transform: 'translate(-50%, -50%)', opacity, cursor: 'default', zIndex: 3 }}
        onMouseEnter={e => setTooltip({ label, date: dateLabel, type: dateType, ck, x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setTooltip(null)}
      >
        <div style={{
          background:    colors.bg,
          color:         colors.text,
          border:        `1px solid ${colors.text}50`,
          borderRadius:  3,
          padding:       '2px 6px',
          fontSize:      10,
          fontWeight:    700,
          letterSpacing: '0.05em',
          fontFamily:    'monospace',
          textTransform: 'uppercase',
          whiteSpace:    'nowrap',
          lineHeight:    1.4,
          boxShadow:     dateType === 'actual' ? `0 0 0 1px ${colors.text}70` : 'none',
          userSelect:    'none',
        }}>
          {label}
        </div>
      </div>
    );
  };

  // ── Item span bar ───────────────────────────────────────────────────────────
  const renderItemBar = item => {
    const xs = [];
    ITEM_MILESTONES.forEach(m => {
      const d    = item.dates?.[m.key];
      const date = viewMode === 'plan'   ? d?.plan
                 : viewMode === 'actual' ? (d?.actual || d?.adj || d?.plan)
                 : bestDate(d);
      const x = dateX(date);
      if (x !== null) xs.push(x);
    });
    if (xs.length < 2) return null;
    const lo = Math.min(...xs), hi = Math.max(...xs);
    return (
      <div style={{
        position: 'absolute', left: lo, width: hi - lo,
        top: '50%', transform: 'translateY(-50%)',
        height: 2,
        background: `linear-gradient(90deg, ${MC.dt1.text}25, ${MC.prod.text}25)`,
        borderRadius: 1, zIndex: 1, pointerEvents: 'none',
      }} />
    );
  };

  // ── Item milestones ─────────────────────────────────────────────────────────
  const renderItemMilestones = item =>
    ITEM_MILESTONES.map(m => {
      const d = item.dates?.[m.key];
      if (!d) return null;
      if (viewMode === 'adj') {
        return [
          d.plan   && renderMilestone(d.plan,   m.ck, m.label, 'plan'),
          d.adj    && renderMilestone(d.adj,     m.ck, m.label, 'adj'),
          d.actual && renderMilestone(d.actual,  m.ck, m.label, 'actual'),
        ];
      }
      const date = viewMode === 'plan' ? d.plan : (d.actual || d.adj || d.plan);
      return date && renderMilestone(date, m.ck, m.label, viewMode);
    });

  // ── Drawing sub-rows ────────────────────────────────────────────────────────
  const renderDrawingRows = item => {
    if (!expanded[item.id] || !item.drawings?.length) return null;
    return item.drawings.map((dwg, di) => {
      const bg = di % 2 === 0 ? C.bgSub : '#0b1020';
      return (
        <div key={dwg.id} style={{ display: 'flex', height: DWG_ROW_H, borderBottom: `1px solid ${C.borderSub}`, background: bg }}>
          <div style={{
            width: LABEL_W, flexShrink: 0, padding: '0 8px 0 36px',
            position: 'sticky', left: 0, zIndex: 10, background: bg,
            borderRight: `1px solid ${C.borderSub}`, height: '100%',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            gap: 2,
          }}>
            <div style={{ fontSize: 10, color: '#818cf8', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {dwg.drawingNumber || '—'}
            </div>
            {dwg.title && (
              <div style={{ fontSize: 9, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {dwg.title}
              </div>
            )}
            <div style={{ display: 'flex', gap: 3 }}>
              {dwg.rev && (
                <span style={{ fontSize: 8, background: '#1e293b', border: `1px solid ${C.border}`, borderRadius: 3, padding: '0 4px', color: C.textMuted }}>
                  Rev {dwg.rev}
                </span>
              )}
              {dwg.s4Status && statusBadge('S4', dwg.s4Status)}
              {dwg.s5Status && dwg.s5Status !== 'NA' && statusBadge('S5', dwg.s5Status)}
            </div>
          </div>

          <div style={{ flex: 1, position: 'relative', height: DWG_ROW_H, overflow: 'hidden' }}>
            <GridLines />
            {todayX !== null && <TodayLine height={DWG_ROW_H} />}
            {DWG_MILESTONES.map(m => {
              const d = dwg[m.key];
              if (!d) return null;
              const date = viewMode === 'plan'   ? d.plan
                         : viewMode === 'actual' ? (d.actual || d.adj || d.plan)
                         : bestDate(d);
              const type = viewMode === 'actual' && d.actual ? 'actual'
                         : viewMode === 'adj'    && d.adj    ? 'adj' : 'plan';
              return date && renderMilestone(date, m.ck, m.label, type);
            })}
          </div>
        </div>
      );
    });
  };

  // ── Grid / today helpers ────────────────────────────────────────────────────
  const GridLines = () =>
    weekHeaders.map((w, i) => (
      <div key={i} style={{
        position: 'absolute', left: w.x, top: 0, width: 1, height: '100%',
        background: w.isMonth ? C.gridMonth : C.gridLine, zIndex: 0, pointerEvents: 'none',
      }} />
    ));

  const TodayLine = ({ height }) => (
    <div style={{
      position: 'absolute', left: todayX, top: 0,
      width: 2, height, background: C.todayLine, zIndex: 2, pointerEvents: 'none',
    }} />
  );

  function statusBadge(prefix, val) {
    const good = val === 'A', warn = val === 'B';
    return (
      <span key={prefix} style={{
        fontSize: 8, borderRadius: 3, padding: '0 4px', fontWeight: 700,
        background: good ? '#14532d' : warn ? '#78350f' : '#7f1d1d',
        color:      good ? '#6ee7a0' : warn ? '#fbbf24' : '#f87171',
      }}>{prefix}:{val}</span>
    );
  }

  // ── Loading / error ─────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: '40px 0', textAlign: 'center', color: C.textSec, fontSize: 13 }}>
      Loading timeline…
    </div>
  );
  if (error) return (
    <div style={{ padding: 16, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, color: '#fca5a5', fontSize: 12 }}>
      Failed to load: {error}
    </div>
  );
  if (!items.length) return null;

  const totalDrawings = visibleItems.reduce((n, i) => n + (i.drawings?.length || 0), 0);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.bg, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', fontFamily: "'DM Mono', 'ui-monospace', monospace" }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '14px 20px', gap: 12, flexWrap: 'wrap', borderBottom: `1px solid ${C.border}`, background: C.bgHeader }}>
        <div>
          {projectName && (
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>
              {projectName} — Programme Timeline
            </div>
          )}
          <div style={{ fontSize: 11, color: C.textSec, marginTop: projectName ? 4 : 0 }}>
            {visibleItems.length} of {categoryFiltered.length} items visible · {totalDrawings} drawings
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>

          {/* Today reset */}
          <button onClick={scrollToToday} style={{
            padding: '5px 11px', fontSize: 10, fontWeight: 700, border: `1px solid ${C.todayLine}60`,
            borderRadius: 6, cursor: 'pointer', background: 'rgba(74,222,128,0.08)',
            color: '#4ade80', fontFamily: 'inherit', letterSpacing: '0.05em',
          }}>↺ Today</button>

          {/* View mode */}
          <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
            {[['plan','Plan'],['adj','Adjusted'],['actual','Actual']].map(([v,l]) => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                padding: '5px 11px', fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: viewMode === v ? '#3b82f6' : '#131c2e',
                color:      viewMode === v ? '#fff'    : C.textSec,
                fontFamily: 'inherit', letterSpacing: '0.05em',
              }}>{l}</button>
            ))}
          </div>

          {/* Category */}
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{
            background: '#131c2e', border: `1px solid ${C.border}`, borderRadius: 6,
            color: C.textSec, fontSize: 10, padding: '5px 8px', cursor: 'pointer', outline: 'none',
          }}>
            <option value="all">All categories</option>
            <option value="Main Works">Main Works</option>
            <option value="PCSA">PCSA</option>
          </select>

          {/* Status */}
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{
            background: '#131c2e', border: `1px solid ${C.border}`, borderRadius: 6,
            color: C.textSec, fontSize: 10, padding: '5px 8px', cursor: 'pointer', outline: 'none',
          }}>
            <option value="active">Active items</option>
            <option value="all">All items</option>
            <option value="complete">Complete</option>
          </select>
        </div>
      </div>

      {/* ── Legend ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px 16px', padding: '10px 20px', borderBottom: `1px solid ${C.border}` }}>
        {LEGEND_ITEMS.map((li, i) => {
          const colors = MC[li.ck];
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{
                background: colors.bg, color: colors.text,
                border: `1px solid ${colors.text}50`, borderRadius: 3,
                padding: '2px 6px', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.05em', fontFamily: 'monospace', textTransform: 'uppercase',
                whiteSpace: 'nowrap', flexShrink: 0, minWidth: 34, textAlign: 'center',
              }}>{li.label}</div>
              <span style={{ fontSize: 9, color: C.textMuted, lineHeight: 1.3 }}>{li.desc}</span>
            </div>
          );
        })}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 34, height: 2, background: C.todayLine, borderRadius: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 9, color: C.textMuted }}>Today</span>
        </div>
      </div>

      {/* ── Scroll container ── */}
      <div ref={scrollRef} style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)', position: 'relative', scrollBehavior: 'auto' }}>

        <div style={{ display: 'inline-block', minWidth: LABEL_W + totalWidth }}>

          {/* Sticky date header row */}
          <div style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', background: C.bgHeader, borderBottom: `1px solid ${C.border}` }}>
            <div style={{
              width: LABEL_W, flexShrink: 0, padding: '8px 12px',
              fontSize: 10, color: C.textWeek, letterSpacing: '0.08em', textTransform: 'uppercase',
              position: 'sticky', left: 0, zIndex: 21, background: C.bgHeader,
              borderRight: `1px solid ${C.border}`,
            }}>
              Item
            </div>
            <div style={{ width: totalWidth, flexShrink: 0, position: 'relative', height: 36 }}>
              {weekHeaders.map((w, i) => (
                <div key={i} style={{ position: 'absolute', left: w.x, top: 0, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', paddingLeft: 5, paddingTop: 3 }}>
                  {w.isMonth && (
                    <span style={{ fontSize: 9, color: '#818cf8', fontWeight: 700, letterSpacing: '0.07em', lineHeight: 1.2 }}>
                      {w.month.toUpperCase()}
                    </span>
                  )}
                  <span style={{ fontSize: 9, color: C.textWeek, lineHeight: 1.3 }}>{w.label}</span>
                </div>
              ))}
              {todayX !== null && (
                <div style={{ position: 'absolute', left: todayX, top: 0, width: 2, height: '100%', background: C.todayLine, zIndex: 5 }} />
              )}
            </div>
          </div>

          {/* Item rows */}
          {visibleItems.length === 0 && (
            <div style={{ padding: '32px 24px', color: C.textMuted, fontSize: 12, textAlign: 'center' }}>
              No items with activity in this time window — scroll left or right
            </div>
          )}

          {visibleItems.map((item, rowIndex) => {
            const rowBg  = rowIndex % 2 === 0 ? C.bg : C.bgAlt;
            const bg     = hoveredItem === item.id ? C.bgHover : rowBg;
            const sc     = STATUS_COLORS[item.status] || { bg: '#252525', text: '#909090' };
            const hasExp = item.drawings?.length > 0;
            const isExp  = !!expanded[item.id];

            return (
              <div key={item.id}>
                <div
                  style={{ display: 'flex', height: ROW_H, borderBottom: `1px solid ${C.border}`, background: bg, transition: 'background 0.1s' }}
                  onMouseEnter={() => setHoveredItem(item.id)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  {/* Sticky label */}
                  <div style={{
                    width: LABEL_W, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0,
                    position: 'sticky', left: 0, zIndex: 10, background: bg,
                    borderRight: `1px solid ${C.border}`, height: '100%',
                    transition: 'background 0.1s', overflow: 'hidden',
                  }}>
                    {showProjectBadge && item.projectColor && (
                      <div style={{ width: 4, flexShrink: 0, height: '100%', background: item.projectColor, opacity: 0.85 }} />
                    )}

                    {hasExp ? (
                      <button
                        style={{
                          background: 'none', border: 'none', color: C.textSec,
                          cursor: 'pointer', fontSize: 10, padding: '0 4px',
                          lineHeight: 1, flexShrink: 0, fontFamily: 'monospace', width: 16,
                        }}
                        onClick={() => setExpanded(e => ({ ...e, [item.id]: !e[item.id] }))}
                        aria-label={isExp ? 'Collapse drawings' : `Show ${item.drawings.length} drawings`}
                      >
                        {isExp ? '▾' : '▸'}
                      </button>
                    ) : (
                      <div style={{ width: 16, flexShrink: 0 }} />
                    )}

                    <div style={{ flex: 1, minWidth: 0, padding: '0 6px 0 2px' }}>
                      {showProjectBadge && item.projectName && (
                        <div style={{ fontSize: 8, color: item.projectColor ?? C.textMuted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.projectName}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: C.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3, marginBottom: 1 }}>
                        {item.name}
                      </div>
                      {item.assignee && (
                        <div style={{ fontSize: 9, color: C.textBlue, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.assignee}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap', overflow: 'hidden' }}>
                        <span style={{ background: sc.bg, color: sc.text, borderRadius: 3, padding: '1px 5px', fontSize: 8, fontWeight: 600, fontFamily: 'monospace', letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {item.status}
                        </span>
                        {hasExp && (
                          <span style={{ background: '#1a2540', border: `1px solid ${C.border}`, borderRadius: 8, padding: '0 5px', color: C.textSec, fontSize: 8, flexShrink: 0 }}>
                            {item.drawings.length} dwg{item.drawings.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {item.contractCategory === 'PCSA' && (
                          <span style={{ background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: 8, padding: '0 5px', color: '#c4b5fd', fontSize: 8, letterSpacing: '0.06em', flexShrink: 0 }}>
                            PCSA
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Gantt area */}
                  <div style={{ width: totalWidth, flexShrink: 0, position: 'relative', height: ROW_H, overflow: 'hidden' }}>
                    <GridLines />
                    {todayX !== null && <TodayLine height={ROW_H} />}
                    {renderItemBar(item)}
                    {renderItemMilestones(item)}
                  </div>
                </div>

                {renderDrawingRows(item)}
              </div>
            );
          })}

        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 14, top: tooltip.y - 32, pointerEvents: 'none', zIndex: 200,
          background: '#1e293b', border: `1px solid ${MC[tooltip.ck]?.text ?? C.border}60`,
          borderRadius: 6, padding: '6px 12px', fontSize: 11, color: C.text,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          <span style={{ color: MC[tooltip.ck]?.text, marginRight: 6 }}>●</span>
          <strong>{tooltip.label}</strong>: {tooltip.date}
          <span style={{ marginLeft: 8, color: C.textMuted, fontSize: 9 }}>({tooltip.type})</span>
        </div>
      )}
    </div>
  );
}
