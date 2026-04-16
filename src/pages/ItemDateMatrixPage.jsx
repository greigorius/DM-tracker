import { useState, useEffect, useCallback } from 'react';
import AppNav from '../components/AppNav.jsx';
import { fmtShort, wdBetween, addWD, toISO, enrichItem } from '../lib/scheduleCalc.js';

// ── Colours (DMTracker palette) ───────────────────────────────────────────────
const C = {
  bg:        '#0a0f1a',
  surface:   '#0d1830',
  border:    '#1e2d45',
  text:      '#e2e8f0',
  muted:     '#7b90b0',
  sec:       '#94a3b8',
  active:    '#60a5fa',
  plan:      '#d4d4d4',
  adj:       '#a78bfa',
  actual:    '#4ade80',
  late:      '#f97316',
  early:     '#4ade80',
  slip:      '#f97316',
  slipBg:    '#1a0800',
  earlyBg:   '#001a0a',
};

// ── NCA-skipped column keys ───────────────────────────────────────────────────
const NCA_SKIPPED = new Set([
  'del1P','sub1P','del1A','del1ActDate','sub1A','sub1ActDate','dtSlip1','s4ApprovalPlan',
  'st2P','dtStart2Act','st2A','del2P','del2A','del2ActDate',
  'sub2P','sub2A','sub2ActDate','dtSlip2','s5ApprovalPlan',
]);

// ── Column group definitions ──────────────────────────────────────────────────
const COL_GROUPS = [
  {
    label: 'Status',
    color: '#94a3b8',
    cols: [
      { key: 's4Status',  label: 'S4\nStatus',  src: 'status' },
      { key: 's5Status',  label: 'S5\nStatus',  src: 'status' },
    ],
  },
  {
    label: '1st Issue — Design Intent',
    color: '#60a5fa',
    cols: [
      { key: 'dtStart1Plan',   label: 'DT Start\n(Plan)',        src: 'plan'   },
      { key: 'dtStart1Act',    label: 'DT Start\n(Actual)',      src: 'actual' },
      { key: 'del1P',          label: 'DT Delivery\n(Plan)',     src: 'plan'   },
      { key: 'del1A',          label: 'DT Delivery\n(Adj)',      src: 'adj'    },
      { key: 'del1ActDate',    label: 'DT Delivery\n(Actual)',   src: 'actual' },
      { key: 'sub1P',          label: 'Submission\n(Plan)',      src: 'plan'   },
      { key: 'sub1A',          label: 'Submission\n(Adj)',       src: 'adj'    },
      { key: 'sub1ActDate',    label: 'Submission\n(Actual)',    src: 'actual' },
      { key: 'dtSlip1',        label: 'DT\nSlippage',           src: 'slip'   },
      { key: 's4ApprovalPlan', label: 'S4 Approval\n(Plan)',    src: 'plan'   },
    ],
  },
  {
    label: '2nd Issue — For Approval',
    color: '#a78bfa',
    cols: [
      { key: 'st2P',           label: 'DT Start\n(Plan)',        src: 'plan'   },
      { key: 'st2A',           label: 'DT Start\n(Adj)',         src: 'adj'    },
      { key: 'dtStart2Act',    label: 'DT Start\n(Actual)',      src: 'actual' },
      { key: 'del2P',          label: 'DT Delivery\n(Plan)',     src: 'plan'   },
      { key: 'del2A',          label: 'DT Delivery\n(Adj)',      src: 'adj'    },
      { key: 'del2ActDate',    label: 'DT Delivery\n(Actual)',   src: 'actual' },
      { key: 'sub2P',          label: 'Submission\n(Plan)',      src: 'plan'   },
      { key: 'sub2A',          label: 'Submission\n(Adj)',       src: 'adj'    },
      { key: 'sub2ActDate',    label: 'Submission\n(Actual)',    src: 'actual' },
      { key: 'dtSlip2',        label: 'DT\nSlippage',           src: 'slip'   },
      { key: 's5ApprovalPlan', label: 'S5 Approval\n(Plan)',    src: 'plan'   },
    ],
  },
  {
    label: 'Construction Issue — C01',
    color: '#fb923c',
    cols: [
      { key: 'stCP',           label: 'DT Start\n(Plan)',        src: 'plan'   },
      { key: 'stCA',           label: 'DT Start\n(Adj)',         src: 'adj'    },
      { key: 'stCActDate',     label: 'DT Start\n(Actual)',      src: 'actual' },
      { key: 'delCP',          label: 'DT Delivery\n(Plan)',     src: 'plan'   },
      { key: 'delCA',          label: 'DT Delivery\n(Adj)',      src: 'adj'    },
      { key: 'delCActDate',    label: 'DT Delivery\n(Actual)',   src: 'actual' },
      { key: 'subCP',          label: 'Submission\n(Plan)',      src: 'plan'   },
      { key: 'subCA',          label: 'Submission\n(Adj)',       src: 'adj'    },
      { key: 'subCActDate',    label: 'Submission\n(Actual)',    src: 'actual' },
      { key: 'dtSlipC',        label: 'DT\nSlippage',           src: 'slip'   },
      { key: 'c01SignOffPlan', label: 'C01 Sign Off\n(Plan)',   src: 'plan'   },
    ],
  },
  {
    label: 'Production & Install',
    color: '#4ade80',
    cols: [
      { key: 'prodDateP',   label: 'Production\nDate (Plan)', src: 'plan' },
      { key: 'prodDateAdj', label: 'Production\nDate (Adj)',  src: 'adj'  },
      { key: 'instDate',    label: 'Install\nDate',           src: 'plan' },
    ],
  },
];

// ── Cell helpers ──────────────────────────────────────────────────────────────
function statusColor(l) {
  return l === 'A' ? '#4ade80' : l === 'B' ? '#facc15' : l === 'C' ? '#f87171' : '#6b7280';
}

function DateCell({ iso, src, groupBorder }) {
  const display = fmtShort(iso ? new Date(iso) : null);
  const color = src === 'actual' ? C.actual
              : src === 'adj'    ? C.adj
              : C.plan;
  const bg = src === 'adj' ? 'rgba(139,92,246,0.06)' : 'transparent';
  return (
    <td style={{
      padding: '3px 4px', border: `1px solid ${C.border}`, whiteSpace: 'nowrap',
      background: bg, borderLeft: groupBorder,
    }}>
      <span style={{ fontSize: 10, color: iso ? color : '#2a3a4a', display: 'block', textAlign: 'center' }}>
        {display}
      </span>
    </td>
  );
}

function SlipCell({ slip, groupBorder }) {
  if (slip == null) {
    return (
      <td style={{ padding: '3px 4px', border: `1px solid ${C.border}`, textAlign: 'center', borderLeft: groupBorder }}>
        <span style={{ color: '#2a3a4a', fontSize: 10 }}>—</span>
      </td>
    );
  }
  const late = slip > 0;
  const color = late ? '#f97316' : slip < 0 ? '#4ade80' : '#555';
  const bg    = late ? '#1a0800' : slip < 0 ? '#001a0a' : 'transparent';
  return (
    <td style={{ padding: '3px 4px', border: `1px solid ${C.border}`, textAlign: 'center', borderLeft: groupBorder }}>
      <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, padding: '1px 3px', borderRadius: 3 }}>
        {slip === 0 ? '0d' : (late ? `+${slip}` : `${slip}`) + 'd'}
      </span>
    </td>
  );
}

function StatusCell({ val, groupBorder }) {
  const letters = Array.isArray(val) ? val : (val ? [String(val)] : []);
  return (
    <td style={{
      padding: '2px 4px', border: `1px solid ${C.border}`, textAlign: 'center',
      background: 'rgba(107,114,128,0.04)', borderLeft: groupBorder,
    }}>
      {letters.length ? (
        <span style={{ display: 'inline-flex', gap: 2 }}>
          {letters.map((l, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 700, color: statusColor(l) }}>{l}</span>
          ))}
        </span>
      ) : (
        <span style={{ color: '#2a3a4a', fontSize: 10 }}>—</span>
      )}
    </td>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCSV(items, projects) {
  const fmt = iso => iso ? (() => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  })() : '';
  const fmtSlip = n => n == null ? '' : n === 0 ? '0d' : (n > 0 ? `+${n}d` : `${n}d`);
  const fmtStatus = v => Array.isArray(v) ? v.join(', ') : (v ?? '');
  const projMap = Object.fromEntries(projects.map(p => [p.id, p.name]));

  const headers = [
    'Project','Item Name','Status','NCA',
    'S4 Status','S5 Status',
    'DT Start (Plan)','DT Start (Actual)',
    'DT Delivery (Plan)','DT Delivery (Adj)','DT Delivery (Actual)',
    'Submission (Plan)','Submission (Adj)','Submission (Actual)',
    'DT Slippage','S4 Approval (Plan)',
    '2nd DT Start (Plan)','2nd DT Start (Adj)','2nd DT Start (Actual)',
    '2nd DT Delivery (Plan)','2nd DT Delivery (Adj)','2nd DT Delivery (Actual)',
    '2nd Submission (Plan)','2nd Submission (Adj)','2nd Submission (Actual)',
    '2nd DT Slippage','S5 Approval (Plan)',
    'C01 DT Start (Plan)','C01 DT Start (Adj)','C01 DT Start (Actual)',
    'C01 DT Delivery (Plan)','C01 DT Delivery (Adj)','C01 DT Delivery (Actual)',
    'C01 Submission (Plan)','C01 Submission (Adj)','C01 Submission (Actual)',
    'C01 DT Slippage','C01 Sign Off (Plan)',
    'Production Date (Plan)','Production Date (Adj)','Install Date',
  ];

  const rows = items.map(item => [
    projMap[item.projectId] ?? '',
    item.name, item.status ?? '', item.noClientApproval ? 'Yes' : '',
    fmtStatus(item.s4Status), fmtStatus(item.s5Status),
    fmt(item.dtStart1Plan), fmt(item.dtStart1Act),
    fmt(item.del1P), fmt(item.del1A), fmt(item.del1ActDate),
    fmt(item.sub1P), fmt(item.sub1A), fmt(item.sub1ActDate),
    fmtSlip(item.dtSlip1), fmt(item.s4ApprovalPlan),
    fmt(item.st2P), fmt(item.st2A), fmt(item.dtStart2Act),
    fmt(item.del2P), fmt(item.del2A), fmt(item.del2ActDate),
    fmt(item.sub2P), fmt(item.sub2A), fmt(item.sub2ActDate),
    fmtSlip(item.dtSlip2), fmt(item.s5ApprovalPlan),
    fmt(item.stCP), fmt(item.stCA), fmt(item.stCActDate),
    fmt(item.delCP), fmt(item.delCA), fmt(item.delCActDate),
    fmt(item.subCP), fmt(item.subCA), fmt(item.subCActDate),
    fmtSlip(item.dtSlipC), fmt(item.c01SignOffPlan),
    fmt(item.prodDateP), fmt(item.prodDateAdj), fmt(item.instDate),
  ]);

  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'item-date-matrix.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ItemDateMatrixPage() {
  const [data,          setData]          = useState(null);   // { projects, items }
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [selProject,    setSelProject]    = useState('');
  const [itemSearch,    setItemSearch]    = useState('');
  const [collapsed,     setCollapsed]     = useState({});     // { groupIdx: bool }
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const fetchData = useCallback(async (projectId) => {
    setLoading(true); setError(null);
    try {
      const qs = projectId ? `?projectId=${projectId}` : '';
      const res = await fetch(`/api/schedule-items${qs}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      // Enrich each item with computed fields (slippage, c01SignOffPlan aliases)
      setData({ ...json, items: json.items.map(enrichItem) });
      setLastRefreshed(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(''); }, [fetchData]);

  function handleProjectChange(pid) {
    setSelProject(pid);
    fetchData(pid);
  }

  function toggleGroup(gi) {
    setCollapsed(prev => ({ ...prev, [gi]: !prev[gi] }));
  }

  const projects = data?.projects ?? [];
  const allItems = data?.items ?? [];

  const visItems = allItems.filter(item => {
    if (selProject && item.projectId !== selProject) return false;
    if (itemSearch && !item.name.toLowerCase().includes(itemSearch.toLowerCase())) return false;
    return true;
  });

  // ── Styles ──────────────────────────────────────────────────────────────────
  const S = {
    page: {
      minHeight: '100vh', background: C.bg, color: C.text,
      fontFamily: "'DM Mono','ui-monospace',monospace",
      padding: '24px 20px',
    },
    heading: { fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: C.text, margin: 0 },
    subtext:  { fontSize: 11, color: C.muted, marginLeft: 10 },
    topBar: {
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      marginBottom: 16,
    },
    select: {
      background: C.surface, border: `1px solid ${C.border}`, color: C.text,
      fontSize: 11, padding: '5px 9px', borderRadius: 4, fontFamily: 'inherit',
      cursor: 'pointer', minWidth: 200,
    },
    input: {
      background: C.surface, border: `1px solid ${C.border}`, color: C.text,
      fontSize: 11, padding: '5px 9px', borderRadius: 4, fontFamily: 'inherit',
      width: 200,
    },
    btn: {
      background: 'transparent', border: `1px solid ${C.border}`, color: C.active,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '5px 12px',
      borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
    },
    th: {
      position: 'sticky', top: 0, zIndex: 10,
      background: '#0d1010', border: `1px solid ${C.border}`,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      padding: '3px 4px', whiteSpace: 'pre-line', textAlign: 'center', lineHeight: 1.3,
      color: C.sec, userSelect: 'none',
    },
    thGroup: {
      position: 'sticky', top: 0, zIndex: 10,
      border: `1px solid ${C.border}`,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
      padding: '4px 6px 3px', textAlign: 'center', lineHeight: 1.2,
    },
    stickyName: {
      position: 'sticky', left: 0, zIndex: 20,
      background: '#0a0f1a', border: `1px solid ${C.border}`,
      minWidth: 240, maxWidth: 300, textAlign: 'left',
    },
    td: {
      padding: '3px 6px', border: `1px solid ${C.border}`,
      fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    },
    matrix: {
      borderCollapse: 'collapse', fontSize: 10,
      fontFamily: "'DM Mono','ui-monospace',monospace",
    },
  };

  // ── Status badge ─────────────────────────────────────────────────────────────
  function statusBadge(status) {
    const colors = {
      'Not started':    { bg: '#1a2035', text: '#7b90b0' },
      'In progress':    { bg: '#0d1e35', text: '#60a5fa' },
      'Complete':       { bg: '#0a1f14', text: '#4ade80' },
      'PC Approved':    { bg: '#0a1f14', text: '#4ade80' },
      'In Manufacture': { bg: '#1a1400', text: '#facc15' },
      'Omitted':        { bg: '#1a1010', text: '#ef4444' },
    };
    const c = colors[status] ?? { bg: '#14182a', text: C.muted };
    return (
      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3,
        background: c.bg, color: c.text, fontWeight: 600, letterSpacing: '0.04em',
        textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {status ?? '—'}
      </span>
    );
  }

  if (loading && !data) {
    return (
      <div style={S.page}>
        <AppNav />
        <p style={{ color: C.muted, fontSize: 11 }}>Loading schedule data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={S.page}>
        <AppNav />
        <p style={{ color: '#f87171', fontSize: 11 }}>Error: {error}</p>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <AppNav />

      {/* ── Header ── */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'baseline', gap: 0, justifyContent: 'space-between' }}>
        <div>
          <span style={S.heading}>ITEM DATE MATRIX</span>
          {lastRefreshed && (
            <span style={S.subtext}>
              last updated {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: C.muted }}>
          {visItems.length} item{visItems.length !== 1 ? 's' : ''}
          {visItems.length !== allItems.length ? ` of ${allItems.length}` : ''}
        </span>
      </div>

      {/* ── Filters + CSV ── */}
      <div style={S.topBar}>
        <select
          value={selProject}
          onChange={e => handleProjectChange(e.target.value)}
          style={S.select}
        >
          <option value=''>All Projects</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <input
          type='text'
          placeholder='Search items…'
          value={itemSearch}
          onChange={e => setItemSearch(e.target.value)}
          style={S.input}
        />

        {loading && <span style={{ fontSize: 10, color: C.muted }}>Refreshing…</span>}

        <button
          style={{ ...S.btn, marginLeft: 'auto' }}
          onClick={() => exportCSV(visItems, projects)}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.active; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; }}
        >
          EXPORT CSV
        </button>
      </div>

      {/* ── Matrix ── */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 210px)', border: `1px solid ${C.border}`, borderRadius: 6 }}>
        <table style={S.matrix}>
          <thead>
            {/* Row 1: group headers */}
            <tr>
              <th rowSpan={2} style={{ ...S.th, ...S.stickyName, zIndex: 30, verticalAlign: 'middle', height: 28 }}>
                Item Name
              </th>
              <th rowSpan={2} style={{ ...S.th, minWidth: 80, verticalAlign: 'middle' }}>Status</th>
              {COL_GROUPS.map((g, gi) => {
                const isCollapsed = !!(g.cols.length > 2 && collapsed[gi]);
                const span = isCollapsed ? 1 : g.cols.length;
                return (
                  <th
                    key={gi}
                    colSpan={span}
                    style={{
                      ...S.thGroup,
                      background: `linear-gradient(${g.color}0f,${g.color}0f),#0d1010`,
                      color: g.color,
                      borderLeft: `3px solid ${g.color}66`,
                      height: 28,
                    }}
                  >
                    {g.cols.length > 2 && (
                      <button
                        onClick={() => toggleGroup(gi)}
                        style={{
                          background: 'transparent', border: `1px solid ${g.color}55`,
                          cursor: 'pointer', color: g.color, fontSize: 9, marginRight: 5,
                          padding: '1px 4px', borderRadius: 3, lineHeight: 1, fontFamily: 'inherit',
                        }}
                      >
                        {isCollapsed ? '▶' : '▼'}
                      </button>
                    )}
                    {isCollapsed ? g.label.split('—')[0].trim() : g.label}
                  </th>
                );
              })}
            </tr>
            {/* Row 2: column headers */}
            <tr>
              {COL_GROUPS.map((g, gi) => {
                const isCollapsed = !!(g.cols.length > 2 && collapsed[gi]);
                if (isCollapsed) {
                  return (
                    <th key={gi} style={{ ...S.th, borderLeft: `3px solid ${g.color}66`, minWidth: 60 }}>
                      …
                    </th>
                  );
                }
                return g.cols.map((col, ci) => (
                  <th
                    key={col.key}
                    style={{
                      ...S.th,
                      minWidth: col.src === 'status' ? 36 : col.src === 'slip' ? 54 : 90,
                      borderLeft: ci === 0 ? `3px solid ${g.color}66` : undefined,
                    }}
                  >
                    {col.label}
                  </th>
                ));
              })}
            </tr>
          </thead>

          <tbody>
            {visItems.length === 0 && (
              <tr>
                <td colSpan={99} style={{ ...S.td, textAlign: 'center', color: C.muted, padding: 24 }}>
                  No items found
                </td>
              </tr>
            )}
            {visItems.map((item, ri) => {
              const rowBg = ri % 2 === 0 ? 'transparent' : 'rgba(30,45,69,0.3)';
              return (
                <tr key={item.id} style={{ background: rowBg }}>
                  {/* Sticky name cell */}
                  <td style={{ ...S.td, ...S.stickyName, background: ri % 2 === 0 ? C.bg : '#0c1220', zIndex: 5, maxWidth: 300 }}>
                    <span style={{ fontSize: 11, color: C.text, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </span>
                    {item.noClientApproval && (
                      <span style={{ fontSize: 8, color: '#facc15', background: '#1a1400', padding: '0 3px', borderRadius: 2, marginTop: 1, display: 'inline-block' }}>NCA</span>
                    )}
                  </td>

                  {/* Status badge */}
                  <td style={{ ...S.td, textAlign: 'center' }}>
                    {statusBadge(item.status)}
                  </td>

                  {/* Date/status/slip cells per group */}
                  {COL_GROUPS.map((g, gi) => {
                    const isCollapsed = !!(g.cols.length > 2 && collapsed[gi]);

                    if (isCollapsed) {
                      // Show a single summary cell with the most important date
                      const summaryKey = g.cols.find(c => c.src === 'plan')?.key;
                      const iso = summaryKey ? item[summaryKey] : null;
                      return (
                        <td key={gi} style={{ ...S.td, textAlign: 'center', borderLeft: `3px solid ${g.color}66`, background: 'rgba(30,45,69,0.2)', color: C.muted, fontSize: 10 }}>
                          {iso ? fmtShort(new Date(iso)) : '—'}
                        </td>
                      );
                    }

                    return g.cols.map((col, ci) => {
                      const groupBorder = ci === 0 ? `3px solid ${g.color}66` : undefined;

                      // NCA check
                      if (item.noClientApproval && NCA_SKIPPED.has(col.key)) {
                        return (
                          <td key={col.key} style={{ ...S.td, textAlign: 'center', borderLeft: groupBorder, background: 'rgba(30,45,69,0.1)' }}>
                            <span style={{ fontSize: 10, color: '#2a3a4a' }}>N/A</span>
                          </td>
                        );
                      }

                      if (col.src === 'status') {
                        return <StatusCell key={col.key} val={item[col.key]} groupBorder={groupBorder} />;
                      }
                      if (col.src === 'slip') {
                        return <SlipCell key={col.key} slip={item[col.key]} groupBorder={groupBorder} />;
                      }
                      return <DateCell key={col.key} iso={item[col.key]} src={col.src} groupBorder={groupBorder} />;
                    });
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
