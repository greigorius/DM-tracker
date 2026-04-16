import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import AppNav from '../components/AppNav.jsx';
import { calcRow, toISO, fmtShort } from '../lib/scheduleCalc.js';
import { ITEM_STATUS_COLORS, ITEM_STATUS_DEFAULT } from '../data/colors.js';

// ── LocalStorage keys ─────────────────────────────────────────────────────────
const LS_OVERRIDES  = 'dmtracker:schedule-overrides';
const LS_PROJ_CFG   = 'dmtracker:schedule-project-configs';
const LS_COL_VIS    = 'dmtracker:schedule-col-visibility';
const LS_COL_PRESETS = 'dmtracker:schedule-col-presets';

// ── Default project config (used when Notion DB lacks these fields) ───────────
const DEFAULT_PROJ_CFG = { approvalDays: 10, revisionDays: 15, productionPrepPeriod: 5, qaDefault: 3 };

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#0a0f1a', surface: '#0d1830', border: '#1e2d45', text: '#e2e8f0',
  muted: '#7b90b0', sec: '#94a3b8', active: '#60a5fa',
  plan: '#d4d4d4', adj: '#a78bfa', actual: '#4ade80',
};

// Filter/select shared style (matches ItemSchedulePage)
const selStyle = {
  background: '#0b1020', border: '1px solid #1e2d45', color: '#94a3b8',
  fontSize: 10, borderRadius: 4, padding: '3px 6px', cursor: 'pointer', fontFamily: 'inherit',
};

// ── NCA-skipped column keys ───────────────────────────────────────────────────
const NCA_SKIPPED = new Set([
  'del1P','del1A','del1ActSnap','sub1P','sub1A','sub1Act',
  'dtSlip1','s4ApprovalPlan','s4Date','approvalSlip1',
  'st2P','st2A','dtStart2Act','del2P','del2A','del2ActSnap',
  'sub2P','sub2A','sub2Act','dtSlip2','s5ApprovalPlan','s5Date','approvalSlip2',
]);

// ── Column group definitions ──────────────────────────────────────────────────
const COL_GROUPS = [
  {
    label: 'Draw Days',
    color: '#f59e0b',
    collapsible: false,
    cols: [
      { key: 'nca',            label: 'NCA',   src: 'checkbox', minWidth: 30 },
      { key: 'dd1',            label: 'DD1',   src: 'edit',     minWidth: 32, title: '1st Issue draw days' },
      { key: 'qa1',            label: 'QA1',   src: 'edit',     minWidth: 32, title: '1st Issue QA days' },
      { key: 'qa2',            label: 'QA2',   src: 'edit',     minWidth: 32, title: '2nd Issue QA days' },
      { key: 'constrDrawDays', label: 'DD-C',  src: 'edit',     minWidth: 32, title: 'Construction draw days' },
      { key: 'qaC',            label: 'QA-C',  src: 'edit',     minWidth: 32, title: 'Construction QA days' },
    ],
  },
  {
    label: 'Status',
    color: '#94a3b8',
    collapsible: false,
    cols: [
      { key: 's4Statuses', label: 'S4\nStatus', src: 'status', minWidth: 42 },
      { key: 's5Statuses', label: 'S5\nStatus', src: 'status', minWidth: 42 },
    ],
  },
  {
    label: '1st Issue — Design Intent',
    color: '#60a5fa',
    collapsible: true,
    cols: [
      { key: 'dtStart1Plan',   label: 'DT Start\n(Plan)',        src: 'plan',   minWidth: 78 },
      { key: 'dtStart1Act',    label: 'DT Start\n(Actual)',      src: 'actual', minWidth: 78 },
      { key: 'del1P',          label: 'DT Delivery\n(Plan)',     src: 'plan',   minWidth: 78 },
      { key: 'del1A',          label: 'DT Delivery\n(Adj)',      src: 'adj',    minWidth: 78 },
      { key: 'del1ActSnap',    label: 'DT Delivery\n(Actual)',   src: 'actual', minWidth: 78 },
      { key: 'sub1P',          label: 'Submission\n(Plan)',      src: 'plan',   minWidth: 78 },
      { key: 'sub1A',          label: 'Submission\n(Adj)',       src: 'adj',    minWidth: 78 },
      { key: 'sub1Act',        label: 'Submission\n(Actual)',    src: 'actual', minWidth: 78 },
      { key: 'dtSlip1',        label: 'DT\nSlippage',           src: 'slip',   minWidth: 50 },
      { key: 's4ApprovalPlan', label: 'S4 Approval\n(Plan)',    src: 'plan',   minWidth: 78 },
      { key: 's4Date',         label: 'S4 Approval\n(Actual)',  src: 'actual', minWidth: 78 },
      { key: 'approvalSlip1',  label: 'S4\nSlippage',           src: 'slip',   minWidth: 50 },
    ],
  },
  {
    label: '2nd Issue — For Approval',
    color: '#a78bfa',
    collapsible: true,
    cols: [
      { key: 'st2P',           label: 'DT Start\n(Plan)',        src: 'plan',   minWidth: 78 },
      { key: 'st2A',           label: 'DT Start\n(Adj)',         src: 'adj',    minWidth: 78 },
      { key: 'dtStart2Act',    label: 'DT Start\n(Actual)',      src: 'actual', minWidth: 78 },
      { key: 'del2P',          label: 'DT Delivery\n(Plan)',     src: 'plan',   minWidth: 78 },
      { key: 'del2A',          label: 'DT Delivery\n(Adj)',      src: 'adj',    minWidth: 78 },
      { key: 'del2ActSnap',    label: 'DT Delivery\n(Actual)',   src: 'actual', minWidth: 78 },
      { key: 'sub2P',          label: 'Submission\n(Plan)',      src: 'plan',   minWidth: 78 },
      { key: 'sub2A',          label: 'Submission\n(Adj)',       src: 'adj',    minWidth: 78 },
      { key: 'sub2Act',        label: 'Submission\n(Actual)',    src: 'actual', minWidth: 78 },
      { key: 'dtSlip2',        label: 'DT\nSlippage',           src: 'slip',   minWidth: 50 },
      { key: 's5ApprovalPlan', label: 'S5 Approval\n(Plan)',    src: 'plan',   minWidth: 78 },
      { key: 's5Date',         label: 'S5 Approval\n(Actual)',  src: 'actual', minWidth: 78 },
      { key: 'approvalSlip2',  label: 'S5\nSlippage',           src: 'slip',   minWidth: 50 },
    ],
  },
  {
    label: 'Construction Issue — C01',
    color: '#fb923c',
    collapsible: true,
    cols: [
      { key: 'stCP',              label: 'DT Start\n(Plan)',         src: 'plan',   minWidth: 78 },
      { key: 'stCA',              label: 'DT Start\n(Adj)',          src: 'adj',    minWidth: 78 },
      { key: 'stCActDate',        label: 'DT Start\n(Actual)',       src: 'actual', minWidth: 78 },
      { key: 'delCP',             label: 'DT Delivery\n(Plan)',      src: 'plan',   minWidth: 78 },
      { key: 'delCA',             label: 'DT Delivery\n(Adj)',       src: 'adj',    minWidth: 78 },
      { key: 'delCActSnap',       label: 'DT Delivery\n(Actual)',    src: 'actual', minWidth: 78 },
      { key: 'subCP',             label: 'Submission\n(Plan)',       src: 'plan',   minWidth: 78 },
      { key: 'subCA',             label: 'Submission\n(Adj)',        src: 'adj',    minWidth: 78 },
      { key: 'subCActSnap',       label: 'Submission\n(Actual)',     src: 'actual', minWidth: 78 },
      { key: 'dtSlipC',           label: 'DT\nSlippage',            src: 'slip',   minWidth: 50 },
      { key: 'c01SignOffPlan',    label: 'C01 Sign Off\n(Plan)',     src: 'plan',   minWidth: 78 },
      { key: 'c01SignOffAdj',     label: 'C01 Sign Off\n(Adj)',      src: 'adj',    minWidth: 78 },
      { key: 'c01SignOffActSnap', label: 'C01 Sign Off\n(Actual)',   src: 'actual', minWidth: 78 },
      { key: 'approvalSlipC',     label: 'C01\nSlippage',           src: 'slip',   minWidth: 50 },
    ],
  },
  {
    label: 'Production & Install',
    color: '#4ade80',
    collapsible: true,
    cols: [
      { key: 'prodDateP',   label: 'Production\nDate (Plan)', src: 'plan', minWidth: 78 },
      { key: 'prodDateAdj', label: 'Production\nDate (Adj)',  src: 'adj',  minWidth: 78 },
      { key: 'instDate',    label: 'Install\nDate',           src: 'plan', minWidth: 78 },
    ],
  },
];

const ALL_COL_KEYS = COL_GROUPS.flatMap(g => g.cols.map(c => c.key));

function initColVisibility() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_COL_VIS) ?? 'null');
    if (saved && typeof saved === 'object') {
      const merged = {};
      for (const key of ALL_COL_KEYS) merged[key] = saved[key] ?? true;
      return merged;
    }
  } catch {}
  return Object.fromEntries(ALL_COL_KEYS.map(k => [k, true]));
}

// ── Build per-row display data (calcRow + ISO conversion) ─────────────────────
function buildDisplayRow(item, override, projCfg) {
  const cfg = projCfg ?? DEFAULT_PROJ_CFG;
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

  // Convert all Date objects to ISO strings
  const calc2 = {};
  for (const [k, v] of Object.entries(calc)) {
    calc2[k] = v instanceof Date ? toISO(v) : v;
  }

  return {
    // Direct Notion fields (not in calcRow output)
    dtStart1Plan: item.dtStart1Plan,
    dtStart1Act:  item.dtStart1Act,
    dtStart2Act:  item.dtStart2Act,
    stCActDate:   item.stCActDate,
    s4Date:       item.s4Date,
    s5Date:       item.s5Date,
    s4Statuses:   item.s4Statuses ?? [],
    s5Statuses:   item.s5Statuses ?? [],
    // Draw-day values (for editable cells)
    nca,
    dd1:            rowInput.dd1,
    qa1:            rowInput.qa1,
    qa2:            rowInput.qa2,
    constrDrawDays: rowInput.constrDrawDays,
    qaC:            rowInput.qaC,
    // All calcRow outputs (isoified)
    ...calc2,
  };
}

// ── Cell renderers ────────────────────────────────────────────────────────────
function DateCell({ iso, src, groupBorder }) {
  const display = fmtShort(iso ? new Date(iso) : null);
  const color = src === 'actual' ? C.actual : src === 'adj' ? C.adj : C.plan;
  const bg    = src === 'adj' ? 'rgba(139,92,246,0.06)' : 'transparent';
  return (
    <td style={{
      padding: '2px 4px', border: `1px solid ${C.border}`,
      whiteSpace: 'nowrap', background: bg, borderLeft: groupBorder,
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
      <td style={{ padding: '2px 4px', border: `1px solid ${C.border}`, textAlign: 'center', borderLeft: groupBorder }}>
        <span style={{ color: '#2a3a4a', fontSize: 10 }}>—</span>
      </td>
    );
  }
  const late  = slip > 0;
  const color = late ? '#f97316' : slip < 0 ? '#4ade80' : '#555';
  const bg    = late ? '#1a0800' : slip < 0 ? '#001a0a' : 'transparent';
  return (
    <td style={{ padding: '2px 4px', border: `1px solid ${C.border}`, textAlign: 'center', borderLeft: groupBorder }}>
      <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, padding: '1px 3px', borderRadius: 3 }}>
        {slip === 0 ? '0d' : (late ? `+${slip}` : `${slip}`) + 'd'}
      </span>
    </td>
  );
}

function StatusCell({ val, groupBorder }) {
  const raw     = Array.isArray(val) ? val : (val ? [val] : []);
  const letters = raw.map(v => String(v).trim().charAt(0)).filter(Boolean);
  const lColor  = l => l === 'A' ? '#4ade80' : l === 'B' ? '#facc15' : l === 'C' ? '#f87171' : '#6b7280';
  return (
    <td style={{
      padding: '2px 4px', border: `1px solid ${C.border}`, textAlign: 'center',
      background: 'rgba(107,114,128,0.04)', borderLeft: groupBorder,
    }}>
      {letters.length ? (
        <span style={{ display: 'inline-flex', gap: 2 }}>
          {letters.map((l, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 700, color: lColor(l) }}>{l}</span>
          ))}
        </span>
      ) : (
        <span style={{ color: '#2a3a4a', fontSize: 10 }}>—</span>
      )}
    </td>
  );
}

// ── Column Visibility Panel ───────────────────────────────────────────────────
function ColVisPanel({ colVis, onChange, onClose }) {
  const [presets, setPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_COL_PRESETS) ?? '{}'); }
    catch { return {}; }
  });

  function savePreset() {
    const name = prompt('Preset name:');
    if (!name?.trim()) return;
    const updated = { ...presets, [name.trim()]: { ...colVis } };
    setPresets(updated);
    localStorage.setItem(LS_COL_PRESETS, JSON.stringify(updated));
  }

  function loadPreset(name) {
    const p = presets[name];
    if (p) {
      const merged = Object.fromEntries(ALL_COL_KEYS.map(k => [k, p[k] ?? true]));
      onChange(merged);
    }
  }

  function deletePreset(name) {
    const updated = { ...presets };
    delete updated[name];
    setPresets(updated);
    localStorage.setItem(LS_COL_PRESETS, JSON.stringify(updated));
  }

  function toggleGroup(keys, to) {
    onChange({ ...colVis, ...Object.fromEntries(keys.map(k => [k, to])) });
  }

  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 300,
      background: '#0d1830', border: `1px solid ${C.border}`, borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)', padding: 14, width: 340,
      maxHeight: 'calc(100vh - 180px)', overflowY: 'auto',
    }}>
      {/* Saved presets */}
      {Object.keys(presets).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5 }}>
            Presets
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {Object.keys(presets).map(name => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <button
                  onClick={() => loadPreset(name)}
                  style={{ ...selStyle, padding: '2px 8px', color: C.active }}
                >
                  {name}
                </button>
                <button
                  onClick={() => deletePreset(name)}
                  style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12, padding: '0 3px', lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Group toggles */}
      {COL_GROUPS.map((g, gi) => (
        <div key={gi} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, paddingBottom: 3, borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: g.color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {g.label}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => toggleGroup(g.cols.map(c => c.key), true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, color: C.muted, padding: 0 }}>all</button>
              <button onClick={() => toggleGroup(g.cols.map(c => c.key), false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, color: C.muted, padding: 0 }}>none</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 14px' }}>
            {g.cols.map(col => (
              <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 10, color: C.sec }}>
                <input
                  type='checkbox'
                  checked={colVis[col.key] !== false}
                  onChange={e => onChange({ ...colVis, [col.key]: e.target.checked })}
                  style={{ accentColor: g.color, cursor: 'pointer' }}
                />
                {col.label.replace('\n', ' ')}
              </label>
            ))}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
        <button
          onClick={() => onChange(Object.fromEntries(ALL_COL_KEYS.map(k => [k, true])))}
          style={{ ...selStyle, padding: '3px 10px' }}
        >
          Reset
        </button>
        <button
          onClick={savePreset}
          style={{ ...selStyle, padding: '3px 10px', color: C.active }}
        >
          Save as Preset
        </button>
        <button
          onClick={onClose}
          style={{ ...selStyle, padding: '3px 10px' }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCSV(items, displayRows, projects) {
  const projMap = Object.fromEntries(projects.map(p => [p.id, p.name]));
  const fmt = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  };
  const fmtSlip = n => n == null ? '' : n === 0 ? '0d' : (n > 0 ? `+${n}d` : `${n}d`);
  const fmtSt  = arr => (arr ?? []).map(s => String(s).charAt(0)).join(',');

  const headers = [
    'Project', 'Item Name', 'Status', 'NCA',
    'S4 Status', 'S5 Status',
    'DD1', 'QA1', 'QA2', 'DD-C', 'QA-C',
    'DT Start (Plan)', 'DT Start (Act)',
    'Del1 Plan', 'Del1 Adj', 'Del1 Act',
    'Sub1 Plan', 'Sub1 Adj', 'Sub1 Act', 'Slip1',
    'S4 Appr Plan', 'S4 Appr Act', 'S4 Slip',
    'ST2 Plan', 'ST2 Adj', 'ST2 Act',
    'Del2 Plan', 'Del2 Adj', 'Del2 Act',
    'Sub2 Plan', 'Sub2 Adj', 'Sub2 Act', 'Slip2',
    'S5 Appr Plan', 'S5 Appr Act', 'S5 Slip',
    'StC Plan', 'StC Adj', 'StC Act',
    'DelC Plan', 'DelC Adj', 'DelC Act',
    'SubC Plan', 'SubC Adj', 'SubC Act', 'SlipC',
    'C01 SO Plan', 'C01 SO Adj', 'C01 SO Act', 'C01 Slip',
    'Prod Plan', 'Prod Adj', 'Install',
  ];

  const rows = items.map((item, i) => {
    const dr = displayRows[i];
    return [
      projMap[item.projectId] ?? '', item.name, item.status ?? '', dr.nca ? 'Yes' : '',
      fmtSt(dr.s4Statuses), fmtSt(dr.s5Statuses),
      dr.dd1, dr.qa1, dr.qa2, dr.constrDrawDays, dr.qaC,
      fmt(dr.dtStart1Plan), fmt(dr.dtStart1Act),
      fmt(dr.del1P), fmt(dr.del1A), fmt(dr.del1ActSnap),
      fmt(dr.sub1P), fmt(dr.sub1A), fmt(dr.sub1Act), fmtSlip(dr.dtSlip1),
      fmt(dr.s4ApprovalPlan), fmt(dr.s4Date), fmtSlip(dr.approvalSlip1),
      fmt(dr.st2P), fmt(dr.st2A), fmt(dr.dtStart2Act),
      fmt(dr.del2P), fmt(dr.del2A), fmt(dr.del2ActSnap),
      fmt(dr.sub2P), fmt(dr.sub2A), fmt(dr.sub2Act), fmtSlip(dr.dtSlip2),
      fmt(dr.s5ApprovalPlan), fmt(dr.s5Date), fmtSlip(dr.approvalSlip2),
      fmt(dr.stCP), fmt(dr.stCA), fmt(dr.stCActDate),
      fmt(dr.delCP), fmt(dr.delCA), fmt(dr.delCActSnap),
      fmt(dr.subCP), fmt(dr.subCA), fmt(dr.subCActSnap), fmtSlip(dr.dtSlipC),
      fmt(dr.c01SignOffPlan), fmt(dr.c01SignOffAdj), fmt(dr.c01SignOffActSnap), fmtSlip(dr.approvalSlipC),
      fmt(dr.prodDateP), fmt(dr.prodDateAdj), fmt(dr.instDate),
    ];
  });

  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'item-date-matrix.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ── Table styles ──────────────────────────────────────────────────────────────
const TH = {
  position: 'sticky', top: 0, zIndex: 10,
  background: '#0d1010', border: `1px solid ${C.border}`,
  fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
  padding: '3px 4px', whiteSpace: 'pre-line', textAlign: 'center', lineHeight: 1.3,
  color: C.sec, userSelect: 'none',
};
const TH_GROUP = {
  position: 'sticky', top: 0, zIndex: 10,
  border: `1px solid ${C.border}`,
  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
  padding: '4px 6px 3px', textAlign: 'center', lineHeight: 1.2,
};
const TD_BASE = {
  padding: '2px 4px', border: `1px solid ${C.border}`,
  fontSize: 11, whiteSpace: 'nowrap',
};
const STICKY_NAME = {
  position: 'sticky', left: 0, zIndex: 20,
  background: '#0a0f1a', border: `1px solid ${C.border}`,
  minWidth: 220, maxWidth: 280, textAlign: 'left',
};
const EDIT_INPUT = {
  width: 32, background: '#0b1020', border: '1px solid #1e2d45', color: '#94a3b8',
  fontSize: 10, textAlign: 'center', borderRadius: 3, padding: '1px 2px',
  fontFamily: 'inherit', outline: 'none',
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ItemDateMatrixPage() {
  const [data,          setData]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // Filter state
  const [selProject,  setSelProject]  = useState('');
  const [selPhase,    setSelPhase]    = useState('');
  const [selStatus,   setSelStatus]   = useState('');
  const [selCategory, setSelCategory] = useState('');
  const [selNca,      setSelNca]      = useState('');
  const [itemSearch,  setItemSearch]  = useState('');
  const [groupBy,     setGroupBy]     = useState('none');

  // Group collapse (row groups)
  const [rowGroupCollapsed, setRowGroupCollapsed] = useState({});
  // Column group collapse (horizontal)
  const [colGroupCollapsed, setColGroupCollapsed] = useState({});

  // Column visibility
  const [colVis, setColVis]         = useState(initColVisibility);
  const [showColPanel, setShowColPanel] = useState(false);
  const colPanelRef = useRef(null);

  // Draw-day overrides (per-item, localStorage)
  const [rowOverrides, setRowOverrides] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_OVERRIDES) ?? '{}'); }
    catch { return {}; }
  });

  // Project config overrides (per-project, localStorage)
  const [projConfigs, setProjConfigs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_PROJ_CFG) ?? '{}'); }
    catch { return {}; }
  });

  // ── Fetch ─────────────────────────────────────────────────────────────────
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

  // Persist column visibility
  useEffect(() => {
    localStorage.setItem(LS_COL_VIS, JSON.stringify(colVis));
  }, [colVis]);

  // Close col panel on outside click
  useEffect(() => {
    if (!showColPanel) return;
    function handle(e) {
      if (colPanelRef.current && !colPanelRef.current.contains(e.target)) setShowColPanel(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showColPanel]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleProjectChange(pid) {
    setSelProject(pid);
    setSelPhase(''); setSelStatus(''); setSelCategory('');
    fetchData(pid);
  }

  function handleOverrideChange(itemId, field, value) {
    const updated = { ...rowOverrides, [itemId]: { ...(rowOverrides[itemId] ?? {}), [field]: value } };
    setRowOverrides(updated);
    localStorage.setItem(LS_OVERRIDES, JSON.stringify(updated));
  }

  function handleProjCfgChange(projId, field, value) {
    const updated = { ...projConfigs, [projId]: { ...(projConfigs[projId] ?? {}), [field]: value } };
    setProjConfigs(updated);
    localStorage.setItem(LS_PROJ_CFG, JSON.stringify(updated));
  }

  function toggleColGroup(gi) {
    setColGroupCollapsed(prev => ({ ...prev, [gi]: !prev[gi] }));
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const projects = data?.projects ?? [];
  const allItems = data?.items    ?? [];

  const phases     = useMemo(() => [...new Set(allItems.map(i => i.dmPhase).filter(Boolean))].sort(), [allItems]);
  const statuses   = useMemo(() => [...new Set(allItems.map(i => i.status).filter(Boolean))].sort(), [allItems]);
  const categories = useMemo(() => [...new Set(allItems.map(i => i.contractCategory).filter(Boolean))].sort(), [allItems]);

  const filteredItems = useMemo(() => allItems.filter(item => {
    if (selProject  && item.projectId      !== selProject)  return false;
    if (selPhase    && item.dmPhase        !== selPhase)    return false;
    if (selStatus   && item.status         !== selStatus)   return false;
    if (selCategory && item.contractCategory !== selCategory) return false;
    if (selNca === 'nca'      && !item.noClientApproval) return false;
    if (selNca === 'standard' &&  item.noClientApproval) return false;
    if (itemSearch && !item.name.toLowerCase().includes(itemSearch.toLowerCase())) return false;
    return true;
  }), [allItems, selProject, selPhase, selStatus, selCategory, selNca, itemSearch]);

  function getProjCfg(projectId) {
    const api   = projects.find(p => p.id === projectId);
    const local = projConfigs[projectId] ?? {};
    return {
      approvalDays:        local.approvalDays        ?? api?.approvalDays        ?? DEFAULT_PROJ_CFG.approvalDays,
      revisionDays:        local.revisionDays        ?? api?.revisionDays        ?? DEFAULT_PROJ_CFG.revisionDays,
      productionPrepPeriod: local.productionPrepPeriod ?? api?.productionPrepPeriod ?? DEFAULT_PROJ_CFG.productionPrepPeriod,
      qaDefault:           local.qaDefault           ?? api?.qaDefault           ?? DEFAULT_PROJ_CFG.qaDefault,
    };
  }

  // Build display rows (memoised)
  const displayRows = useMemo(() => {
    return filteredItems.map(item => buildDisplayRow(item, rowOverrides[item.id], getProjCfg(item.projectId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredItems, rowOverrides, projConfigs, projects]);

  // Group items
  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: null, items: filteredItems, rows: displayRows }];
    const map = {};
    filteredItems.forEach((item, i) => {
      const key = groupBy === 'project'  ? (item.projectId ?? '')
                : groupBy === 'phase'    ? (item.dmPhase ?? 'Unassigned')
                :                          (item.contractCategory ?? 'Unassigned');
      const label = groupBy === 'project'
        ? (projects.find(p => p.id === key)?.name ?? key)
        : key;
      if (!map[key]) map[key] = { key, label, items: [], rows: [] };
      map[key].items.push(item);
      map[key].rows.push(displayRows[i]);
    });
    return Object.values(map).sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredItems, displayRows, groupBy, projects]);

  function expandAll()   { setRowGroupCollapsed({}); }
  function collapseAll() {
    const all = {};
    for (const g of grouped) all[g.key] = true;
    setRowGroupCollapsed(all);
  }

  // Visible cols per group
  const visGroupCols = useMemo(() => COL_GROUPS.map(g => ({
    ...g,
    visCols: g.cols.filter(c => colVis[c.key] !== false),
  })), [colVis]);

  const totalCols = 2 + visGroupCols.reduce((s, g, gi) => {
    if (g.visCols.length === 0) return s;
    return s + (g.collapsible && colGroupCollapsed[gi] ? 1 : g.visCols.length);
  }, 0);

  // ── Loading / error states ────────────────────────────────────────────────
  const pageWrap = { minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','ui-monospace',monospace", padding: '24px 20px' };
  const h1Style  = { fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 16px', color: C.text };

  if (loading && !data) return (
    <div style={pageWrap}>
      <h1 style={h1Style}>ITEM DATE MATRIX</h1>
      <AppNav />
      <p style={{ color: C.muted, fontSize: 11, marginTop: 24 }}>Loading schedule data…</p>
    </div>
  );

  if (error) return (
    <div style={pageWrap}>
      <h1 style={h1Style}>ITEM DATE MATRIX</h1>
      <AppNav />
      <p style={{ color: '#f87171', fontSize: 11, marginTop: 24 }}>Error: {error}</p>
    </div>
  );

  const activeProjCfg = selProject ? getProjCfg(selProject) : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={pageWrap}>

      {/* Heading ABOVE nav */}
      <h1 style={h1Style}>
        ITEM DATE MATRIX
        {lastRefreshed && (
          <span style={{ fontSize: 10, fontWeight: 400, color: C.muted, marginLeft: 10 }}>
            updated {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </h1>

      <AppNav />

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8, marginTop: 20 }}>

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

        <select value={selCategory} onChange={e => setSelCategory(e.target.value)} style={selStyle}>
          <option value=''>All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={selNca} onChange={e => setSelNca(e.target.value)} style={selStyle}>
          <option value=''>All Items</option>
          <option value='nca'>NCA Only</option>
          <option value='standard'>Standard Only</option>
        </select>

        <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={selStyle}>
          <option value='none'>No Group</option>
          <option value='project'>By Project</option>
          <option value='phase'>By Phase</option>
          <option value='category'>By Category</option>
        </select>

        <input
          type='text'
          placeholder='Search items…'
          value={itemSearch}
          onChange={e => setItemSearch(e.target.value)}
          style={{ ...selStyle, width: 150, color: C.text }}
        />

        {groupBy !== 'none' && (
          <>
            <button onClick={expandAll}   style={{ ...selStyle, color: C.active, padding: '3px 8px' }}>Expand All</button>
            <button onClick={collapseAll} style={{ ...selStyle, color: C.active, padding: '3px 8px' }}>Collapse All</button>
          </>
        )}

        {loading && <span style={{ fontSize: 10, color: C.muted }}>↺</span>}

        {/* Spacer */}
        <span style={{ flex: 1 }} />

        <span style={{ fontSize: 10, color: C.muted }}>
          {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
          {filteredItems.length !== allItems.length ? ` of ${allItems.length}` : ''}
        </span>

        {/* Column visibility */}
        <div style={{ position: 'relative' }} ref={colPanelRef}>
          <button
            onClick={() => setShowColPanel(v => !v)}
            style={{ ...selStyle, color: C.active, padding: '3px 10px' }}
          >
            ⚙ Columns
          </button>
          {showColPanel && (
            <ColVisPanel colVis={colVis} onChange={setColVis} onClose={() => setShowColPanel(false)} />
          )}
        </div>

        {/* Export */}
        <button
          onClick={() => exportCSV(filteredItems, displayRows, projects)}
          style={{ ...selStyle, color: C.active, padding: '3px 10px' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.active; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e2d45'; }}
        >
          EXPORT CSV
        </button>
      </div>

      {/* ── Project config bar (when a project is selected) ── */}
      {selProject && activeProjCfg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8, padding: '5px 12px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 10, color: C.muted, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.active, flexShrink: 0 }}>
            Project Config
          </span>
          {[
            { key: 'approvalDays',        label: 'Approval Days' },
            { key: 'revisionDays',        label: 'Revision Days' },
            { key: 'productionPrepPeriod', label: 'Prod Prep' },
            { key: 'qaDefault',           label: 'QA Default' },
          ].map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: C.sec }}>{label}:</span>
              <input
                type='text'
                inputMode='numeric'
                value={projConfigs[selProject]?.[key] ?? activeProjCfg[key] ?? ''}
                onChange={e => {
                  const v = parseInt(e.target.value, 10);
                  handleProjCfgChange(selProject, key, isNaN(v) ? null : v);
                }}
                style={{ width: 38, background: '#0b1020', border: '1px solid #1e2d45', color: C.text, fontSize: 10, textAlign: 'center', borderRadius: 3, padding: '1px 3px', fontFamily: 'inherit', outline: 'none' }}
              />
            </label>
          ))}
        </div>
      )}

      {/* ── Matrix ── */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 240px)', border: `1px solid ${C.border}`, borderRadius: 6 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 10, fontFamily: "'DM Mono','ui-monospace',monospace" }}>
          <thead>
            {/* Row 1 — group headers */}
            <tr>
              <th rowSpan={2} style={{ ...TH, ...STICKY_NAME, zIndex: 30, verticalAlign: 'middle', height: 28 }}>
                Item Name
              </th>
              <th rowSpan={2} style={{ ...TH, minWidth: 80, verticalAlign: 'middle' }}>
                Status
              </th>
              {COL_GROUPS.map((g, gi) => {
                const visCols    = visGroupCols[gi].visCols;
                if (visCols.length === 0) return null;
                const isCollapsed = !!(g.collapsible && colGroupCollapsed[gi]);
                return (
                  <th
                    key={gi}
                    colSpan={isCollapsed ? 1 : visCols.length}
                    style={{
                      ...TH_GROUP,
                      background: `linear-gradient(${g.color}0f,${g.color}0f),#0d1010`,
                      color: g.color,
                      borderLeft: `3px solid ${g.color}66`,
                      height: 28,
                    }}
                  >
                    {g.collapsible && (
                      <button
                        onClick={() => toggleColGroup(gi)}
                        style={{ background: 'transparent', border: `1px solid ${g.color}55`, cursor: 'pointer', color: g.color, fontSize: 9, marginRight: 5, padding: '1px 4px', borderRadius: 3, lineHeight: 1, fontFamily: 'inherit' }}
                      >
                        {isCollapsed ? '▶' : '▼'}
                      </button>
                    )}
                    {isCollapsed ? g.label.split('—')[0].trim() : g.label}
                  </th>
                );
              })}
            </tr>

            {/* Row 2 — column headers */}
            <tr>
              {COL_GROUPS.map((g, gi) => {
                const visCols    = visGroupCols[gi].visCols;
                if (visCols.length === 0) return null;
                const isCollapsed = !!(g.collapsible && colGroupCollapsed[gi]);
                if (isCollapsed) {
                  return <th key={gi} style={{ ...TH, borderLeft: `3px solid ${g.color}66`, minWidth: 60 }}>…</th>;
                }
                return visCols.map((col, ci) => (
                  <th
                    key={col.key}
                    title={col.title}
                    style={{ ...TH, minWidth: col.minWidth, borderLeft: ci === 0 ? `3px solid ${g.color}66` : undefined }}
                  >
                    {col.label}
                  </th>
                ));
              })}
            </tr>
          </thead>

          <tbody>
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={totalCols} style={{ ...TD_BASE, textAlign: 'center', color: C.muted, padding: 24 }}>
                  No items found
                </td>
              </tr>
            )}

            {grouped.map(group => {
              const isGroupCollapsed = !!rowGroupCollapsed[group.key];
              return (
                <Fragment key={group.key}>
                  {/* Group header row */}
                  {group.label && (
                    <tr style={{ background: '#0d1525' }}>
                      <td
                        colSpan={totalCols}
                        style={{ ...TD_BASE, padding: '5px 10px', cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => setRowGroupCollapsed(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
                      >
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.active }}>
                          {isGroupCollapsed ? '▶' : '▼'} {group.label}
                        </span>
                        <span style={{ fontSize: 9, color: C.muted, marginLeft: 8 }}>
                          {group.items.length} items
                        </span>
                      </td>
                    </tr>
                  )}

                  {/* Item rows */}
                  {!isGroupCollapsed && group.items.map((item, ri) => {
                    const dr     = group.rows[ri];
                    const rowBg  = ri % 2 === 0 ? 'transparent' : 'rgba(30,45,69,0.3)';
                    const nameBg = ri % 2 === 0 ? C.bg : '#0c1220';
                    const scfg   = ITEM_STATUS_COLORS[item.status] ?? ITEM_STATUS_DEFAULT;

                    return (
                      <tr key={item.id} style={{ background: rowBg }}>

                        {/* Sticky name cell */}
                        <td style={{ ...TD_BASE, ...STICKY_NAME, background: nameBg, zIndex: 5, padding: '3px 6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                            <span style={{ fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                              {item.name}
                            </span>
                            {dr.nca && (
                              <span style={{ fontSize: 8, color: '#facc15', background: '#1a1400', padding: '0 3px', borderRadius: 2, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                NCA
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status badge */}
                        <td style={{ ...TD_BASE, textAlign: 'center' }}>
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: scfg.bg, color: scfg.text, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                            {item.status ?? '—'}
                          </span>
                        </td>

                        {/* Column cells per group */}
                        {COL_GROUPS.map((g, gi) => {
                          const visCols    = visGroupCols[gi].visCols;
                          if (visCols.length === 0) return null;
                          const isCollapsed = !!(g.collapsible && colGroupCollapsed[gi]);

                          if (isCollapsed) {
                            const summaryKey = visCols.find(c => c.src === 'plan')?.key;
                            const iso = summaryKey ? dr[summaryKey] : null;
                            return (
                              <td key={gi} style={{ ...TD_BASE, textAlign: 'center', borderLeft: `3px solid ${g.color}66`, background: 'rgba(30,45,69,0.2)', color: C.muted, fontSize: 10 }}>
                                {iso ? fmtShort(new Date(iso)) : '—'}
                              </td>
                            );
                          }

                          return visCols.map((col, ci) => {
                            const groupBorder = ci === 0 ? `3px solid ${g.color}66` : undefined;

                            // NCA — skip 1st/2nd issue date cols
                            if (dr.nca && NCA_SKIPPED.has(col.key)) {
                              return (
                                <td key={col.key} style={{ ...TD_BASE, textAlign: 'center', borderLeft: groupBorder, background: 'rgba(30,45,69,0.1)' }}>
                                  <span style={{ fontSize: 10, color: '#2a3a4a' }}>N/A</span>
                                </td>
                              );
                            }

                            // NCA checkbox
                            if (col.src === 'checkbox') {
                              return (
                                <td key={col.key} style={{ ...TD_BASE, textAlign: 'center', borderLeft: groupBorder, padding: '2px 4px' }}>
                                  <input
                                    type='checkbox'
                                    checked={!!dr.nca}
                                    onChange={e => handleOverrideChange(item.id, 'noClientApproval', e.target.checked)}
                                    style={{ accentColor: '#f59e0b', cursor: 'pointer', width: 12, height: 12 }}
                                  />
                                </td>
                              );
                            }

                            // Editable draw-day number
                            if (col.src === 'edit') {
                              const isNcaDisabled = dr.nca && (col.key === 'dd1' || col.key === 'qa1' || col.key === 'qa2');
                              return (
                                <td key={col.key} style={{ ...TD_BASE, textAlign: 'center', borderLeft: groupBorder, padding: '1px 2px' }}>
                                  <input
                                    type='text'
                                    inputMode='numeric'
                                    value={dr[col.key] ?? ''}
                                    onChange={e => {
                                      const v = parseInt(e.target.value, 10);
                                      handleOverrideChange(item.id, col.key, isNaN(v) ? 0 : v);
                                    }}
                                    style={{ ...EDIT_INPUT, opacity: isNcaDisabled ? 0.3 : 1 }}
                                  />
                                </td>
                              );
                            }

                            // S4/S5 status letters
                            if (col.src === 'status') {
                              return <StatusCell key={col.key} val={dr[col.key]} groupBorder={groupBorder} />;
                            }

                            // Slippage
                            if (col.src === 'slip') {
                              return <SlipCell key={col.key} slip={dr[col.key]} groupBorder={groupBorder} />;
                            }

                            // Date
                            return <DateCell key={col.key} iso={dr[col.key]} src={col.src} groupBorder={groupBorder} />;
                          });
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
