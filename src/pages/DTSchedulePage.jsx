import { useState, useEffect, useCallback, useMemo } from 'react';
import AppNav from '../components/AppNav.jsx';
import { calcRow, toISO, fmtShort } from '../lib/scheduleCalc.js';
import { ITEM_STATUS_COLORS, ITEM_STATUS_DEFAULT } from '../data/colors.js';

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#0a0f1a', surface: '#0d1830', border: '#1e2d45', text: '#e2e8f0',
  muted: '#7b90b0', sec: '#94a3b8', active: '#60a5fa',
  plan: '#d4d4d4', adj: '#a78bfa', actual: '#4ade80',
};

const selStyle = {
  background: '#0b1020', border: '1px solid #1e2d45', color: '#94a3b8',
  fontSize: 10, borderRadius: 4, padding: '3px 6px', cursor: 'pointer', fontFamily: 'inherit',
};

const LS_OVERRIDES = 'dmtracker:schedule-overrides';
const DEFAULT_PROJ_CFG = { approvalDays: 10, revisionDays: 15, productionPrepPeriod: 5, qaDefault: 3 };

// ── Milestone columns (condensed key DT schedule milestones) ──────────────────
// Keys match calcRow output (Date objects isoified) + direct Notion fields
const MILESTONES = [
  // 1st Issue
  { key: 'dtStart1Plan',   label: '1st DT\nStart (P)',     src: 'plan',   group: '1st',  groupColor: '#60a5fa' },
  { key: 'dtStart1Act',    label: '1st DT\nStart (A)',     src: 'actual', group: '1st',  groupColor: '#60a5fa' },
  { key: 'sub1P',          label: '1st Sub\n(Plan)',       src: 'plan',   group: '1st',  groupColor: '#60a5fa' },
  { key: 'sub1A',          label: '1st Sub\n(Adj)',        src: 'adj',    group: '1st',  groupColor: '#60a5fa' },
  { key: 'sub1Act',        label: '1st Sub\n(Actual)',     src: 'actual', group: '1st',  groupColor: '#60a5fa' },
  { key: 'dtSlip1',        label: '1st\nSlip',            src: 'slip',   group: '1st',  groupColor: '#60a5fa' },
  // S4 Approval
  { key: 's4ApprovalPlan', label: 'S4 Appr\n(Plan)',      src: 'plan',   group: 'S4',   groupColor: '#38bdf8' },
  { key: 's4Date',         label: 'S4 Appr\n(Actual)',    src: 'actual', group: 'S4',   groupColor: '#38bdf8' },
  // 2nd Issue
  { key: 'sub2P',          label: '2nd Sub\n(Plan)',       src: 'plan',   group: '2nd',  groupColor: '#a78bfa' },
  { key: 'sub2A',          label: '2nd Sub\n(Adj)',        src: 'adj',    group: '2nd',  groupColor: '#a78bfa' },
  { key: 'sub2Act',        label: '2nd Sub\n(Actual)',     src: 'actual', group: '2nd',  groupColor: '#a78bfa' },
  { key: 'dtSlip2',        label: '2nd\nSlip',            src: 'slip',   group: '2nd',  groupColor: '#a78bfa' },
  // S5 Approval
  { key: 's5ApprovalPlan', label: 'S5 Appr\n(Plan)',      src: 'plan',   group: 'S5',   groupColor: '#38bdf8' },
  { key: 's5Date',         label: 'S5 Appr\n(Actual)',    src: 'actual', group: 'S5',   groupColor: '#38bdf8' },
  // Construction
  { key: 'subCP',           label: 'C01 Sub\n(Plan)',      src: 'plan',   group: 'C01',  groupColor: '#fb923c' },
  { key: 'subCA',           label: 'C01 Sub\n(Adj)',       src: 'adj',    group: 'C01',  groupColor: '#fb923c' },
  { key: 'subCActSnap',     label: 'C01 Sub\n(Actual)',    src: 'actual', group: 'C01',  groupColor: '#fb923c' },
  { key: 'dtSlipC',         label: 'C01\nSlip',           src: 'slip',   group: 'C01',  groupColor: '#fb923c' },
  { key: 'c01SignOffPlan',  label: 'C01 Sign\nOff (Plan)', src: 'plan',   group: 'C01',  groupColor: '#fb923c' },
  { key: 'c01SignOffAdj',   label: 'C01 Sign\nOff (Adj)',  src: 'adj',    group: 'C01',  groupColor: '#fb923c' },
  { key: 'c01SignOffActSnap', label: 'C01 Sign\nOff (Act)', src: 'actual', group: 'C01', groupColor: '#fb923c' },
  // Production
  { key: 'prodDateP',       label: 'Prod\n(Plan)',          src: 'plan',   group: 'Prod', groupColor: '#4ade80' },
  { key: 'prodDateAdj',     label: 'Prod\n(Adj)',           src: 'adj',    group: 'Prod', groupColor: '#4ade80' },
  { key: 'instDate',        label: 'Install\nDate',         src: 'plan',   group: 'Prod', groupColor: '#4ade80' },
];

const NCA_SKIPPED = new Set([
  'sub1P','sub1A','sub1Act','dtSlip1','s4ApprovalPlan','s4Date',
  'sub2P','sub2A','sub2Act','dtSlip2','s5ApprovalPlan','s5Date',
]);

// ── Build display row (calcRow + ISO) ─────────────────────────────────────────
function buildDisplayRow(item, override) {
  const cfg = DEFAULT_PROJ_CFG;
  const nca = override?.noClientApproval ?? item.noClientApproval;
  const rowInput = {
    dtStart1Plan:    item.dtStart1Plan,
    dtStart1Act:     item.dtStart1Act,
    del1ActDate:     item.del1ActDate,
    sub1ActDate:     item.sub1ActDate,
    dtStart2Act:     item.dtStart2Act,
    del2ActDate:     item.del2ActDate,
    sub2ActDate:     item.sub2ActDate,
    stCActDate:      item.stCActDate,
    delCActDate:     item.delCActDate,
    subCActDate:     item.subCActDate,
    s4Date:          item.s4Date,
    s5Date:          item.s5Date,
    c01SignOffActDate: item.c01SignOffActDate,
    dd1:             override?.dd1            ?? 0,
    qa1:             override?.qa1            ?? cfg.qaDefault,
    qa2:             override?.qa2            ?? cfg.qaDefault,
    constrDrawDays:  override?.constrDrawDays ?? 15,
    qaC:             override?.qaC            ?? cfg.qaDefault,
    noClientApproval: nca,
    productionTime:  null,
  };
  const calc = calcRow(rowInput, cfg);
  const calc2 = {};
  for (const [k, v] of Object.entries(calc)) calc2[k] = v instanceof Date ? toISO(v) : v;
  return {
    dtStart1Plan: item.dtStart1Plan,
    dtStart1Act:  item.dtStart1Act,
    s4Date:       item.s4Date,
    s5Date:       item.s5Date,
    nca,
    ...calc2,
  };
}

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCSV(items, displayRows, projects) {
  const projMap = Object.fromEntries(projects.map(p => [p.id, p.name]));
  const fmt     = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  };
  const fmtSlip = n => n == null ? '' : n === 0 ? '0d' : (n > 0 ? `+${n}d` : `${n}d`);

  const headers = ['Project', 'Item Name', 'Status', 'NCA',
    ...MILESTONES.map(m => m.label.replace('\n', ' '))];

  const rows = items.map((item, i) => {
    const dr = displayRows[i];
    return [
      projMap[item.projectId] ?? '', item.name, item.status ?? '', dr.nca ? 'Yes' : '',
      ...MILESTONES.map(m => {
        if (dr.nca && NCA_SKIPPED.has(m.key)) return 'N/A';
        if (m.src === 'slip') return fmtSlip(dr[m.key]);
        return fmt(dr[m.key]);
      }),
    ];
  });

  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
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
  const [selPhase,      setSelPhase]      = useState('');
  const [selStatus,     setSelStatus]     = useState('');
  const [itemSearch,    setItemSearch]    = useState('');
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const [rowOverrides] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_OVERRIDES) ?? '{}'); }
    catch { return {}; }
  });

  const fetchData = useCallback(async (projectId) => {
    setLoading(true); setError(null);
    try {
      const qs  = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
      const res = await fetch(`/api/schedule-items${qs}`);
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
      setLastRefreshed(new Date());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(''); }, [fetchData]);

  function handleProjectChange(pid) { setSelProject(pid); fetchData(pid); }

  const projects = data?.projects ?? [];
  const allItems = data?.items    ?? [];

  const phases   = useMemo(() => [...new Set(allItems.map(i => i.dmPhase).filter(Boolean))].sort(), [allItems]);
  const statuses = useMemo(() => [...new Set(allItems.map(i => i.status).filter(Boolean))].sort(), [allItems]);

  const visItems = useMemo(() => allItems.filter(item => {
    if (selProject && item.projectId !== selProject) return false;
    if (selPhase   && item.dmPhase   !== selPhase)   return false;
    if (selStatus  && item.status    !== selStatus)   return false;
    if (itemSearch && !item.name.toLowerCase().includes(itemSearch.toLowerCase())) return false;
    return true;
  }), [allItems, selProject, selPhase, selStatus, itemSearch]);

  const displayRows = useMemo(
    () => visItems.map(item => buildDisplayRow(item, rowOverrides[item.id])),
    [visItems, rowOverrides],
  );

  // Build group header spans
  const groups = [];
  for (const m of MILESTONES) {
    if (!groups.length || groups[groups.length - 1].label !== m.group) {
      groups.push({ label: m.group, color: m.groupColor, count: 1 });
    } else {
      groups[groups.length - 1].count++;
    }
  }

  const S = {
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
    td: { padding: '2px 4px', border: `1px solid ${C.border}`, fontSize: 11, whiteSpace: 'nowrap' },
  };

  const pageWrap = {
    minHeight: '100vh', background: C.bg, color: C.text,
    fontFamily: "'DM Mono','ui-monospace',monospace", padding: '24px 20px',
  };
  const h1Style = {
    fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
    margin: '0 0 16px', color: C.text,
  };

  if (loading && !data) return (
    <div style={pageWrap}>
      <h1 style={h1Style}>DT SCHEDULE</h1>
      <AppNav />
      <p style={{ color: C.muted, fontSize: 11, marginTop: 24 }}>Loading schedule data…</p>
    </div>
  );

  if (error) return (
    <div style={pageWrap}>
      <h1 style={h1Style}>DT SCHEDULE</h1>
      <AppNav />
      <p style={{ color: '#f87171', fontSize: 11, marginTop: 24 }}>Error: {error}</p>
    </div>
  );

  return (
    <div style={pageWrap}>

      {/* Heading ABOVE nav */}
      <h1 style={h1Style}>
        DT SCHEDULE
        {lastRefreshed && (
          <span style={{ fontSize: 10, fontWeight: 400, color: C.muted, marginLeft: 10 }}>
            updated {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </h1>

      <AppNav />

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12, marginTop: 20 }}>

        <select value={selProject} onChange={e => handleProjectChange(e.target.value)} style={selStyle}>
          <option value=''>All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select value={selPhase} onChange={e => setSelPhase(e.target.value)} style={selStyle}>
          <option value=''>All Phases</option>
          {phases.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select value={selStatus} onChange={e => setSelStatus(e.target.value)} style={selStyle}>
          <option value=''>All Statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <input
          type='text'
          placeholder='Search items…'
          value={itemSearch}
          onChange={e => setItemSearch(e.target.value)}
          style={{ ...selStyle, width: 160, color: C.text }}
        />

        {loading && <span style={{ fontSize: 10, color: C.muted }}>↺</span>}

        <span style={{ flex: 1 }} />

        <span style={{ fontSize: 10, color: C.muted }}>
          {visItems.length} item{visItems.length !== 1 ? 's' : ''}
          {visItems.length !== allItems.length ? ` of ${allItems.length}` : ''}
        </span>

        <button
          onClick={() => exportCSV(visItems, displayRows, projects)}
          style={{ ...selStyle, color: C.active, padding: '3px 10px' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.active; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e2d45'; }}
        >
          EXPORT CSV
        </button>
      </div>

      {/* ── Table ── */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 200px)', border: `1px solid ${C.border}`, borderRadius: 6 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 10, fontFamily: "'DM Mono','ui-monospace',monospace" }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ ...S.th, ...S.stickyName, zIndex: 30, verticalAlign: 'middle', height: 28 }}>Item Name</th>
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
            <tr>
              {MILESTONES.map((m, mi) => {
                const isGroupStart = mi === 0 || MILESTONES[mi - 1].group !== m.group;
                return (
                  <th
                    key={m.key}
                    style={{
                      ...S.th,
                      minWidth: m.src === 'slip' ? 50 : 84,
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
              const dr    = displayRows[ri];
              const rowBg = ri % 2 === 0 ? 'transparent' : 'rgba(30,45,69,0.3)';
              const scfg  = ITEM_STATUS_COLORS[item.status] ?? ITEM_STATUS_DEFAULT;

              return (
                <tr key={item.id} style={{ background: rowBg }}>
                  <td style={{ ...S.td, ...S.stickyName, background: ri % 2 === 0 ? C.bg : '#0c1220', zIndex: 5, padding: '3px 6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                      <span style={{ fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {item.name}
                      </span>
                      {dr.nca && (
                        <span style={{ fontSize: 8, color: '#facc15', background: '#1a1400', padding: '0 3px', borderRadius: 2, flexShrink: 0 }}>NCA</span>
                      )}
                    </div>
                  </td>

                  <td style={{ ...S.td, textAlign: 'center' }}>
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: scfg.bg, color: scfg.text, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                      {item.status ?? '—'}
                    </span>
                  </td>

                  {MILESTONES.map((m, mi) => {
                    const isGroupStart = mi === 0 || MILESTONES[mi - 1].group !== m.group;
                    const groupBorder  = isGroupStart ? `3px solid ${m.groupColor}66` : undefined;

                    if (dr.nca && NCA_SKIPPED.has(m.key)) {
                      return (
                        <td key={m.key} style={{ ...S.td, textAlign: 'center', borderLeft: groupBorder, background: 'rgba(30,45,69,0.1)' }}>
                          <span style={{ fontSize: 10, color: '#2a3a4a' }}>N/A</span>
                        </td>
                      );
                    }

                    if (m.src === 'slip') {
                      const slip = dr[m.key];
                      if (slip == null) return (
                        <td key={m.key} style={{ ...S.td, textAlign: 'center', borderLeft: groupBorder }}>
                          <span style={{ color: '#2a3a4a', fontSize: 10 }}>—</span>
                        </td>
                      );
                      const late = slip > 0;
                      return (
                        <td key={m.key} style={{ ...S.td, textAlign: 'center', borderLeft: groupBorder }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: late ? '#f97316' : slip < 0 ? '#4ade80' : '#555', background: late ? '#1a0800' : slip < 0 ? '#001a0a' : 'transparent', padding: '1px 3px', borderRadius: 3 }}>
                            {slip === 0 ? '0d' : (late ? `+${slip}` : `${slip}`) + 'd'}
                          </span>
                        </td>
                      );
                    }

                    const iso     = dr[m.key];
                    const display = fmtShort(iso ? new Date(iso) : null);
                    const color   = m.src === 'actual' ? C.actual : m.src === 'adj' ? C.adj : C.plan;
                    const bg      = m.src === 'adj' ? 'rgba(139,92,246,0.06)' : 'transparent';
                    return (
                      <td key={m.key} style={{ ...S.td, textAlign: 'center', borderLeft: groupBorder, background: bg }}>
                        <span style={{ fontSize: 10, color: iso ? color : '#2a3a4a' }}>{display}</span>
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
