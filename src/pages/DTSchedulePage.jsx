import { useState, useEffect, useCallback } from 'react';
import AppNav from '../components/AppNav.jsx';
import { fmtShort, wdBetween, addWD, toISO, enrichItem } from '../lib/scheduleCalc.js';

// ── Colours (DMTracker palette) ───────────────────────────────────────────────
const C = {
  bg:      '#0a0f1a',
  surface: '#0d1830',
  border:  '#1e2d45',
  text:    '#e2e8f0',
  muted:   '#7b90b0',
  sec:     '#94a3b8',
  active:  '#60a5fa',
  plan:    '#d4d4d4',
  adj:     '#a78bfa',
  actual:  '#4ade80',
};

// ── Milestone columns (the key DT schedule milestones per issue) ───────────────
const MILESTONES = [
  // 1st Issue
  { key: 'dtStart1Plan',   label: '1st DT\nStart (P)',     src: 'plan',   group: '1st',  groupColor: '#60a5fa' },
  { key: 'dtStart1Act',    label: '1st DT\nStart (A)',     src: 'actual', group: '1st',  groupColor: '#60a5fa' },
  { key: 'sub1P',          label: '1st Sub\n(Plan)',       src: 'plan',   group: '1st',  groupColor: '#60a5fa' },
  { key: 'sub1A',          label: '1st Sub\n(Adj)',        src: 'adj',    group: '1st',  groupColor: '#60a5fa' },
  { key: 'sub1ActDate',    label: '1st Sub\n(Actual)',     src: 'actual', group: '1st',  groupColor: '#60a5fa' },
  { key: 'dtSlip1',        label: '1st\nSlip',            src: 'slip',   group: '1st',  groupColor: '#60a5fa' },
  // S4 Approval
  { key: 's4ApprovalPlan', label: 'S4 Appr\n(Plan)',      src: 'plan',   group: 'S4',   groupColor: '#38bdf8' },
  // 2nd Issue
  { key: 'sub2P',          label: '2nd Sub\n(Plan)',       src: 'plan',   group: '2nd',  groupColor: '#a78bfa' },
  { key: 'sub2A',          label: '2nd Sub\n(Adj)',        src: 'adj',    group: '2nd',  groupColor: '#a78bfa' },
  { key: 'sub2ActDate',    label: '2nd Sub\n(Actual)',     src: 'actual', group: '2nd',  groupColor: '#a78bfa' },
  { key: 'dtSlip2',        label: '2nd\nSlip',            src: 'slip',   group: '2nd',  groupColor: '#a78bfa' },
  // S5 Approval
  { key: 's5ApprovalPlan', label: 'S5 Appr\n(Plan)',      src: 'plan',   group: 'S5',   groupColor: '#38bdf8' },
  // Construction
  { key: 'subCP',          label: 'C01 Sub\n(Plan)',       src: 'plan',   group: 'C01',  groupColor: '#fb923c' },
  { key: 'subCA',          label: 'C01 Sub\n(Adj)',        src: 'adj',    group: 'C01',  groupColor: '#fb923c' },
  { key: 'subCActDate',    label: 'C01 Sub\n(Actual)',     src: 'actual', group: 'C01',  groupColor: '#fb923c' },
  { key: 'dtSlipC',        label: 'C01\nSlip',            src: 'slip',   group: 'C01',  groupColor: '#fb923c' },
  { key: 'c01SignOffPlan', label: 'C01 Sign\nOff (Plan)',  src: 'plan',   group: 'C01',  groupColor: '#fb923c' },
  // Production
  { key: 'prodDateP',      label: 'Prod\n(Plan)',          src: 'plan',   group: 'Prod', groupColor: '#4ade80' },
  { key: 'prodDateAdj',    label: 'Prod\n(Adj)',           src: 'adj',    group: 'Prod', groupColor: '#4ade80' },
  { key: 'instDate',       label: 'Install\nDate',         src: 'plan',   group: 'Prod', groupColor: '#4ade80' },
];

// ── NCA-skipped milestone keys ────────────────────────────────────────────────
const NCA_SKIPPED = new Set([
  'sub1P','sub1A','sub1ActDate','dtSlip1','s4ApprovalPlan',
  'sub2P','sub2A','sub2ActDate','dtSlip2','s5ApprovalPlan',
]);

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCSV(items, projects) {
  const fmt = iso => iso ? (() => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  })() : '';
  const fmtSlip = n => n == null ? '' : n === 0 ? '0d' : (n > 0 ? `+${n}d` : `${n}d`);
  const projMap = Object.fromEntries(projects.map(p => [p.id, p.name]));

  const slipKeys = new Set(['dtSlip1','dtSlip2','dtSlipC']);
  const headers = ['Project', 'Item Name', 'Status', 'NCA', ...MILESTONES.map(m => m.label.replace('\n', ' '))];
  const rows = items.map(item => [
    projMap[item.projectId] ?? '',
    item.name,
    item.status ?? '',
    item.noClientApproval ? 'Yes' : '',
    ...MILESTONES.map(m => {
      if (item.noClientApproval && NCA_SKIPPED.has(m.key)) return 'N/A';
      if (m.src === 'slip') return fmtSlip(item[m.key]);
      return fmt(item[m.key]);
    }),
  ]);

  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'dt-schedule.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DTSchedulePage() {
  const [data,          setData]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [selProject,    setSelProject]    = useState('');
  const [itemSearch,    setItemSearch]    = useState('');
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const fetchData = useCallback(async (projectId) => {
    setLoading(true); setError(null);
    try {
      const qs = projectId ? `?projectId=${projectId}` : '';
      const res = await fetch(`/api/schedule-items${qs}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
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
    stickyName: {
      position: 'sticky', left: 0, zIndex: 20,
      background: '#0a0f1a', border: `1px solid ${C.border}`,
      minWidth: 220, maxWidth: 280, textAlign: 'left',
    },
    td: { padding: '3px 6px', border: `1px solid ${C.border}`, fontSize: 11, whiteSpace: 'nowrap' },
    matrix: {
      borderCollapse: 'collapse', fontSize: 10,
      fontFamily: "'DM Mono','ui-monospace',monospace",
    },
  };

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

  // Build group spans for the header
  const groups = [];
  let gi = 0;
  for (const m of MILESTONES) {
    if (!groups.length || groups[groups.length - 1].label !== m.group) {
      groups.push({ label: m.group, color: m.groupColor, count: 1 });
    } else {
      groups[groups.length - 1].count++;
    }
  }

  return (
    <div style={S.page}>
      <AppNav />

      {/* ── Header ── */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <span style={S.heading}>DT SCHEDULE</span>
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

      {/* ── Table ── */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 210px)', border: `1px solid ${C.border}`, borderRadius: 6 }}>
        <table style={S.matrix}>
          <thead>
            {/* Group header row */}
            <tr>
              <th rowSpan={2} style={{ ...S.th, ...S.stickyName, zIndex: 30, verticalAlign: 'middle', height: 28 }}>
                Item Name
              </th>
              <th rowSpan={2} style={{ ...S.th, minWidth: 80, verticalAlign: 'middle' }}>Status</th>
              {groups.map((g, i) => (
                <th
                  key={i}
                  colSpan={g.count}
                  style={{
                    ...S.th,
                    color: g.color,
                    background: `linear-gradient(${g.color}0f,${g.color}0f),#0d1010`,
                    borderLeft: `3px solid ${g.color}66`,
                    height: 28, textAlign: 'center', fontSize: 9,
                  }}
                >
                  {g.label}
                </th>
              ))}
            </tr>
            {/* Column header row */}
            <tr>
              {MILESTONES.map((m, mi) => {
                const prevGroup = mi === 0 ? null : MILESTONES[mi - 1].group;
                const isGroupStart = prevGroup !== m.group;
                return (
                  <th
                    key={m.key}
                    style={{
                      ...S.th,
                      minWidth: m.src === 'slip' ? 54 : 90,
                      borderLeft: isGroupStart ? `3px solid ${m.groupColor}66` : undefined,
                    }}
                  >
                    {m.label}
                  </th>
                );
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
                  {/* Sticky name */}
                  <td style={{ ...S.td, ...S.stickyName, background: ri % 2 === 0 ? C.bg : '#0c1220', zIndex: 5 }}>
                    <span style={{ fontSize: 11, color: C.text, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </span>
                    {item.noClientApproval && (
                      <span style={{ fontSize: 8, color: '#facc15', background: '#1a1400', padding: '0 3px', borderRadius: 2, marginTop: 1, display: 'inline-block' }}>NCA</span>
                    )}
                  </td>

                  {/* Status */}
                  <td style={{ ...S.td, textAlign: 'center' }}>
                    {statusBadge(item.status)}
                  </td>

                  {/* Milestone cells */}
                  {MILESTONES.map((m, mi) => {
                    const prevGroup = mi === 0 ? null : MILESTONES[mi - 1].group;
                    const isGroupStart = prevGroup !== m.group;
                    const groupBorder = isGroupStart ? `3px solid ${m.groupColor}66` : undefined;

                    // NCA skip
                    if (item.noClientApproval && NCA_SKIPPED.has(m.key)) {
                      return (
                        <td key={m.key} style={{ ...S.td, textAlign: 'center', borderLeft: groupBorder, background: 'rgba(30,45,69,0.1)' }}>
                          <span style={{ fontSize: 10, color: '#2a3a4a' }}>N/A</span>
                        </td>
                      );
                    }

                    if (m.src === 'slip') {
                      const slip = item[m.key];
                      if (slip == null) {
                        return (
                          <td key={m.key} style={{ ...S.td, textAlign: 'center', borderLeft: groupBorder }}>
                            <span style={{ color: '#2a3a4a', fontSize: 10 }}>—</span>
                          </td>
                        );
                      }
                      const late = slip > 0;
                      return (
                        <td key={m.key} style={{ ...S.td, textAlign: 'center', borderLeft: groupBorder }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            color: late ? '#f97316' : slip < 0 ? '#4ade80' : '#555',
                            background: late ? '#1a0800' : slip < 0 ? '#001a0a' : 'transparent',
                            padding: '1px 3px', borderRadius: 3,
                          }}>
                            {slip === 0 ? '0d' : (late ? `+${slip}` : `${slip}`) + 'd'}
                          </span>
                        </td>
                      );
                    }

                    const iso = item[m.key];
                    const display = fmtShort(iso ? new Date(iso) : null);
                    const color = m.src === 'actual' ? C.actual : m.src === 'adj' ? C.adj : C.plan;
                    const bg    = m.src === 'adj' ? 'rgba(139,92,246,0.06)' : 'transparent';

                    return (
                      <td key={m.key} style={{ ...S.td, textAlign: 'center', borderLeft: groupBorder, background: bg }}>
                        <span style={{ fontSize: 10, color: iso ? color : '#2a3a4a' }}>
                          {display}
                        </span>
                      </td>
                    );
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
