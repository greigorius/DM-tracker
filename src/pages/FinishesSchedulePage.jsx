import { useState, useEffect, useCallback, useRef } from 'react';
import AppNav from '../components/AppNav.jsx';
import { assignProjectColors, PROJECT_COLORS } from '../data/colors.js';
import { getCached, setCached } from '../hooks/usePageCache.js';
import {
  initColConfig, persistColConfig, mergeVisibleCols,
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

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function fmtDate(str) {
  if (!str) return null;
  return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

// ── APPROVED select config ────────────────────────────────────────────────────
const APPROVED_CFG = {
  'A':                 { color: '#34d399', label: 'A — Approved'       },
  'B':                 { color: '#f59e0b', label: 'B — Minor Comments' },
  'C':                 { color: '#f87171', label: 'C — Major Comments' },
  'Awaiting Approval': { color: '#60a5fa', label: 'Awaiting Approval'  },
  'Not Submitted':     { color: '#7b90b0', label: 'Not Submitted'      },
};
const APPROVED_ORDER = ['A','B','C','Awaiting Approval','Not Submitted'];
const approvedColor  = v => APPROVED_CFG[v]?.color ?? '#7b90b0';

// ── SAMPLE TYPE select config ─────────────────────────────────────────────────
const SAMPLE_TYPE_CFG = {
  'MATERIAL ONLY':            { color: '#b08060' },
  'MATERIAL FINISH & COLOUR': { color: '#60a5fa' },
  'MOCK UP':                  { color: '#a78bfa' },
  'COLOUR ONLY':              { color: '#f472b6' },
};
const SAMPLE_TYPE_ORDER = ['MATERIAL ONLY','MATERIAL FINISH & COLOUR','MOCK UP','COLOUR ONLY'];
const sampleTypeColor   = v => SAMPLE_TYPE_CFG[v]?.color ?? '#94a3b8';

// ── Spec Ref badge colours ────────────────────────────────────────────────────
const SPEC_COLORS = ['#60a5fa','#a78bfa','#34d399','#f472b6','#38bdf8','#fbbf24','#4ade80','#f87171','#fb923c'];
const specColor = ref => SPEC_COLORS[Math.abs([...String(ref)].reduce((h,c) => h*31 + c.charCodeAt(0), 0)) % SPEC_COLORS.length];

// ── Finish Description field order ────────────────────────────────────────────
// These keys map directly to row properties returned by the API.
const FINISH_FIELDS_DEFAULT = [
  { key: 'materialType',    label: 'Material Type',    visible: true },
  { key: 'supplier',        label: 'Supplier',         visible: true },
  { key: 'brand',           label: 'Brand',            visible: true },
  { key: 'faceMaterial',    label: 'Face Material',    visible: true },
  { key: 'core',            label: 'Core',             visible: true },
  { key: 'finish',          label: 'Finish',           visible: true },
  { key: 'productCode',     label: 'Product Code',     visible: true },
  { key: 'matchingPattern', label: 'Matching Pattern', visible: true },
  { key: 'fireRating',      label: 'Fire Rating',      visible: true },
  { key: 'sheen',           label: 'Sheen',            visible: true },
  { key: 'lipping',         label: 'Lipping',          visible: true },
];
const FINISH_FIELDS_LS_KEY = 'dmtracker:finishes-field-order-v2';

function loadFieldOrder() {
  try {
    const stored = JSON.parse(localStorage.getItem(FINISH_FIELDS_LS_KEY) ?? 'null');
    if (!Array.isArray(stored)) return FINISH_FIELDS_DEFAULT;
    const defaultKeys = new Set(FINISH_FIELDS_DEFAULT.map(f => f.key));
    // Keep stored items that are still valid, then append any new default fields
    const merged = stored.filter(f => defaultKeys.has(f.key));
    const storedKeys = new Set(merged.map(f => f.key));
    for (const def of FINISH_FIELDS_DEFAULT) {
      if (!storedKeys.has(def.key)) merged.push(def);
    }
    return merged;
  } catch { return FINISH_FIELDS_DEFAULT; }
}
function saveFieldOrder(order) {
  try { localStorage.setItem(FINISH_FIELDS_LS_KEY, JSON.stringify(order)); } catch {}
}

// ── Column definitions ────────────────────────────────────────────────────────
const DEFAULT_COLUMNS = [
  { key: 'items',       label: 'Items',             defaultWidth: 170, minWidth: 80,  align: 'left'   },
  { key: 'cadRef',      label: 'CAD Ref',            defaultWidth: 110, minWidth: 60,  align: 'left'   },
  { key: 'specRef',     label: 'Spec Ref',           defaultWidth: 130, minWidth: 70,  align: 'left'   },
  { key: 'finishDesc',  label: 'Finish Description', defaultWidth: 420, minWidth: 160, align: 'left'   },
  { key: 'sampleRef',   label: 'Sample Ref',         defaultWidth: 110, minWidth: 60,  align: 'left'   },
  { key: 'sampleType',  label: 'Sample Type',        defaultWidth: 170, minWidth: 80,  align: 'left'   },
  { key: 'suffix',      label: 'Suffix',             defaultWidth: 80,  minWidth: 50,  align: 'center' },
  { key: 'cuttingList', label: 'Cutting List',       defaultWidth: 88,  minWidth: 60,  align: 'center' },
  { key: 'approved',    label: 'Approved',           defaultWidth: 150, minWidth: 80,  align: 'center' },
  { key: 'submittedOn', label: 'Submitted On',       defaultWidth: 105, minWidth: 70,  align: 'center' },
];

const CACHE_KEY  = 'finishes-schedule';
const COL_LS_KEY = 'dmtracker:finishes-col-config-v2';

// ── Shared toolbar styles ─────────────────────────────────────────────────────
const selStyle = {
  background: C.input, border: `1px solid ${C.border}`, color: C.sec,
  fontSize: 10, borderRadius: 4, padding: '3px 6px', cursor: 'pointer', fontFamily: 'inherit',
};
const toolSel = { ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd' };

// ── Badge components ──────────────────────────────────────────────────────────
function SpecBadge({ spec, active, onClick }) {
  const col = specColor(spec);
  return (
    <span
      onClick={onClick}
      title={onClick ? `Filter by "${spec}"` : undefined}
      style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.03em',
        background: active ? hexToRgba(col, 0.22) : hexToRgba(col, 0.1),
        color: col,
        border: `1px solid ${active ? hexToRgba(col, 0.6) : hexToRgba(col, 0.3)}`,
        borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >{spec}</span>
  );
}

function ApprovedPill({ value }) {
  if (!value) return <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
  const col   = approvedColor(value);
  const label = APPROVED_CFG[value]?.label ?? value;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700,
      background: hexToRgba(col, 0.12), color: col,
      border: `1px solid ${hexToRgba(col, 0.28)}`,
      borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

function SampleTypePill({ value }) {
  if (!value) return <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
  const col = sampleTypeColor(value);
  return (
    <span style={{
      fontSize: 9, fontWeight: 700,
      background: hexToRgba(col, 0.12), color: col,
      border: `1px solid ${hexToRgba(col, 0.28)}`,
      borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap',
    }}>{value}</span>
  );
}

// ── Finish Description cell ───────────────────────────────────────────────────
// Renders chips from individual row fields in the user-configured order.
// Falls back to splitting row.finishDescription if no fieldOrder is provided.
function FinishDescCell({ row, fieldOrder }) {
  const parts = fieldOrder
    ? fieldOrder.filter(f => f.visible !== false).map(f => row[f.key]).filter(Boolean)
    : (row.finishDescription ?? '').split(' | ').map(s => s.trim()).filter(Boolean);

  if (!parts.length) return <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
  if (parts.length === 1) return <span style={{ fontSize: 11, color: C.text }}>{parts[0]}</span>;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 5px' }}>
      {parts.map((part, i) => (
        <span key={i} style={{
          fontSize: 10, color: C.text,
          background: hexToRgba('#4a90d9', 0.07),
          border: `1px solid ${hexToRgba('#4a90d9', 0.18)}`,
          borderRadius: 3, padding: '2px 7px', whiteSpace: 'nowrap',
        }}>{part}</span>
      ))}
    </div>
  );
}

// ── Finish Field Order Panel ──────────────────────────────────────────────────
function FinishFieldOrderPanel({ fields, onApply, onClose }) {
  const [local, setLocal] = useState(() => fields.map(f => ({ ...f })));

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= local.length) return;
    const next = [...local];
    [next[i], next[j]] = [next[j], next[i]];
    setLocal(next);
  };
  const toggle = i => {
    const next = [...local];
    next[i] = { ...next[i], visible: next[i].visible === false };
    setLocal(next);
  };
  const reset = () => setLocal(FINISH_FIELDS_DEFAULT.map(f => ({ ...f })));

  const panelStyle = {
    position: 'fixed', inset: 0, zIndex: 300,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.55)',
  };
  const boxStyle = {
    background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 10,
    padding: '20px 22px', minWidth: 280, maxHeight: '80vh',
    display: 'flex', flexDirection: 'column', gap: 0,
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  };

  return (
    <div style={panelStyle} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={boxStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Finish Description Fields</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 14, cursor: 'pointer', lineHeight: 1, padding: 0 }}>✕</button>
        </div>

        {/* Field list */}
        <div style={{ overflowY: 'auto', flex: 1, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {local.map((f, i) => {
            const visible = f.visible !== false;
            return (
              <div key={f.key} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 5,
                background: visible ? hexToRgba('#4a90d9', 0.05) : 'transparent',
                border: `1px solid ${visible ? hexToRgba('#4a90d9', 0.15) : C.border}`,
              }}>
                {/* Visible toggle */}
                <div
                  onClick={() => toggle(i)}
                  style={{
                    width: 13, height: 13, borderRadius: 3, flexShrink: 0, cursor: 'pointer',
                    background: visible ? '#4a90d9' : 'transparent',
                    border: `1.5px solid ${visible ? '#4a90d9' : C.muted}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {visible && <span style={{ color: '#fff', fontSize: 8, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                </div>

                {/* Drag handle / label */}
                <span style={{ fontSize: 11, color: visible ? C.text : C.muted, flex: 1, userSelect: 'none' }}>
                  {f.label}
                </span>

                {/* Move buttons */}
                <button
                  onClick={() => move(i, -1)} disabled={i === 0}
                  style={{ background: 'none', border: 'none', color: i === 0 ? C.border : C.muted, fontSize: 10, cursor: i === 0 ? 'default' : 'pointer', padding: '1px 4px', lineHeight: 1 }}
                  title="Move up"
                >↑</button>
                <button
                  onClick={() => move(i, 1)} disabled={i === local.length - 1}
                  style={{ background: 'none', border: 'none', color: i === local.length - 1 ? C.border : C.muted, fontSize: 10, cursor: i === local.length - 1 ? 'default' : 'pointer', padding: '1px 4px', lineHeight: 1 }}
                  title="Move down"
                >↓</button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
          <button
            onClick={reset}
            style={{ ...selStyle, fontSize: 10, color: C.muted }}
          >Reset defaults</button>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onClose} style={{ ...selStyle }}>Cancel</button>
            <button
              onClick={() => { onApply(local); onClose(); }}
              style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd', fontWeight: 700 }}
            >Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Multi-select filter dropdown ──────────────────────────────────────────────
function MultiSelectFilter({ label, options, selected, onChange, colorFn, labelFn }) {
  const [open, setOpen]  = useState(false);
  const containerRef     = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = val => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val); else next.add(val);
    onChange(next);
  };

  const count = selected.size;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          ...selStyle,
          borderColor: count > 0 ? '#2d4a6e' : undefined,
          color:       count > 0 ? '#93c5fd' : undefined,
          userSelect: 'none',
        }}
      >
        {count === 0 ? label : `${label} (${count})`} {open ? '▴' : '▾'}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 3px)', left: 0, zIndex: 200,
          background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 6,
          padding: '4px 0', minWidth: 200,
          boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
        }}>
          {count > 0 && (
            <button
              onClick={() => { onChange(new Set()); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '4px 12px', background: 'none', border: 'none',
                borderBottom: `1px solid ${C.border}`,
                color: C.muted, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                marginBottom: 2,
              }}
            >✕ Clear all</button>
          )}
          {options.map(val => {
            const checked = selected.has(val);
            const col     = colorFn?.(val) ?? C.sec;
            const lbl     = labelFn?.(val) ?? val;
            return (
              <div
                key={val}
                onClick={() => toggle(val)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 12px', cursor: 'pointer', fontSize: 10,
                  color: checked ? col : C.sec,
                  background: checked ? hexToRgba(col, 0.06) : 'transparent',
                  transition: 'background 0.1s',
                }}
              >
                <span style={{
                  width: 12, height: 12, borderRadius: 2, flexShrink: 0,
                  background: checked ? col : 'transparent',
                  border: `1.5px solid ${col}`,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {checked && <span style={{ color: '#000', fontSize: 8, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                </span>
                {lbl}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Cell renderer ─────────────────────────────────────────────────────────────
function FinishCell({ row, colKey, activeSpecRef, onSpecClick, fieldOrder }) {
  switch (colKey) {
    case 'items': {
      if (!row.itemNames?.length) return <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {row.itemNames.map((name, i) => (
            <span key={i} style={{
              fontSize: 10, color: C.sec, background: C.bgDeep,
              border: `1px solid ${C.border}`, borderRadius: 3,
              padding: '1px 6px', whiteSpace: 'nowrap',
            }}>{name}</span>
          ))}
        </div>
      );
    }
    case 'cadRef':
      return <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{row.cadRef ?? '—'}</span>;

    case 'specRef': {
      if (!row.specRef?.length) return <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {row.specRef.map((s, i) => (
            <SpecBadge key={i} spec={s} active={activeSpecRef === s} onClick={() => onSpecClick?.(s)} />
          ))}
        </div>
      );
    }
    case 'finishDesc':
      return <FinishDescCell row={row} fieldOrder={fieldOrder} />;

    case 'sampleRef':
      return <span style={{ fontSize: 11, color: C.sec }}>{row.sampleRef ?? '—'}</span>;

    case 'sampleType':
      return <SampleTypePill value={row.sampleType} />;

    case 'suffix':
      return row.suffix
        ? <span style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', background: hexToRgba('#a78bfa', 0.1), border: `1px solid ${hexToRgba('#a78bfa', 0.25)}`, borderRadius: 4, padding: '2px 7px' }}>{row.suffix}</span>
        : <span style={{ color: C.muted, fontSize: 10 }}>—</span>;

    case 'cuttingList':
      return row.cuttingListRequired
        ? <span style={{ fontSize: 13, color: '#60a5fa' }} title="Required">✓</span>
        : <span style={{ color: C.muted, fontSize: 10 }}>—</span>;

    case 'approved':
      return <ApprovedPill value={row.approved} />;

    case 'submittedOn':
      return <span style={{ fontSize: 10, color: C.sec }}>{row.submittedOn ? fmtDate(row.submittedOn) : '—'}</span>;

    default:
      return <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
  }
}

// ── Table row ─────────────────────────────────────────────────────────────────
function FinishRow({ row, odd, visibleCols, activeSpecRef, onSpecClick, fieldOrder }) {
  const [hov, setHov] = useState(false);
  return (
    <tr
      style={{ background: hov ? C.bgPanel : (odd ? '#0b1020' : C.bgCard), borderBottom: `1px solid ${C.grid}`, transition: 'background 0.1s' }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {visibleCols.map(col => (
        <td key={col.key} style={{
          padding: '9px 10px',
          textAlign: col.align ?? 'left',
          width: col.width, maxWidth: col.width,
          overflow: 'hidden',
          whiteSpace: ['finishDesc','items'].includes(col.key) ? 'normal' : 'nowrap',
          verticalAlign: 'top',
        }}>
          <FinishCell row={row} colKey={col.key} activeSpecRef={activeSpecRef} onSpecClick={onSpecClick} fieldOrder={fieldOrder} />
        </td>
      ))}
    </tr>
  );
}

// ── CSV helpers ───────────────────────────────────────────────────────────────
function rawVal(row, key, fieldOrder) {
  switch (key) {
    case 'items':       return (row.itemNames ?? []).join(', ');
    case 'cadRef':      return row.cadRef ?? '';
    case 'specRef':     return (row.specRef ?? []).join(', ');
    case 'finishDesc': {
      if (fieldOrder) {
        return fieldOrder.filter(f => f.visible !== false).map(f => row[f.key]).filter(Boolean).join(' | ');
      }
      return row.finishDescription ?? '';
    }
    case 'sampleRef':   return row.sampleRef ?? '';
    case 'sampleType':  return row.sampleType ?? '';
    case 'suffix':      return row.suffix ?? '';
    case 'cuttingList': return row.cuttingListRequired ? 'Yes' : 'No';
    case 'approved':    return row.approved ?? '';
    case 'submittedOn': return row.submittedOn ?? '';
    default:            return '';
  }
}

function escapeCSV(v) {
  const s = String(v ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportFlatCSV(visibleCols, rows, fieldOrder, filename) {
  const lines = [visibleCols.map(c => escapeCSV(c.label)).join(',')];
  for (const row of rows) {
    lines.push(visibleCols.map(c => escapeCSV(rawVal(row, c.key, fieldOrder))).join(','));
  }
  triggerDownload(lines.join('\n'), filename);
}

function exportGroupedCSV(visibleCols, groups, fieldOrder, filename) {
  const headers = ['Group', ...visibleCols.map(c => c.label)];
  const lines   = [headers.map(escapeCSV).join(',')];
  for (const { label, rows: groupRows } of groups) {
    lines.push([label ?? '', ...visibleCols.map(() => '')].map(escapeCSV).join(','));
    for (const row of groupRows) {
      lines.push(['', ...visibleCols.map(c => rawVal(row, c.key, fieldOrder))].map(escapeCSV).join(','));
    }
  }
  triggerDownload(lines.join('\n'), filename);
}

function triggerDownload(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Table block ───────────────────────────────────────────────────────────────
function FinishTable({ rows, visibleCols, startResize, activeSpecRef, onSpecClick, fieldOrder }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <SharedTableHead visibleCols={visibleCols} onResizeStart={startResize} />
        <tbody>
          {rows.map((row, idx) => (
            <FinishRow
              key={row.id} row={row} odd={idx % 2 !== 0}
              visibleCols={visibleCols}
              activeSpecRef={activeSpecRef}
              onSpecClick={onSpecClick}
              fieldOrder={fieldOrder}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────
function SummaryBar({ items }) {
  const counts = {};
  for (const r of items) {
    const k = r.approved ?? 'Not Submitted';
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const sorted = APPROVED_ORDER.filter(k => counts[k])
    .concat(Object.keys(counts).filter(k => !APPROVED_ORDER.includes(k)));
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18, padding: '10px 14px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, alignItems: 'center' }}>
      {sorted.map(k => {
        const col   = approvedColor(k);
        const label = APPROVED_CFG[k]?.label ?? k;
        return (
          <span key={k} style={{ fontSize: 10, fontWeight: 700, background: hexToRgba(col, 0.1), color: col, border: `1px solid ${hexToRgba(col, 0.25)}`, borderRadius: 4, padding: '3px 9px' }}>
            {label} <span style={{ opacity: 0.7 }}>· {counts[k]}</span>
          </span>
        );
      })}
      <span style={{ marginLeft: 'auto', fontSize: 10, color: C.muted }}>{items.length} finishes</span>
    </div>
  );
}

// ── Group header ──────────────────────────────────────────────────────────────
function GroupHeader({ label, count, color, open, onToggle }) {
  return (
    <div
      onClick={onToggle}
      style={{ padding: '10px 16px', background: C.bgPanel, borderBottom: open ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
    >
      <span style={{ fontSize: 11, color: C.muted, width: 12, flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{label}</span>
      <span style={{ fontSize: 10, color: C.muted }}>{count} {count === 1 ? 'finish' : 'finishes'}</span>
    </div>
  );
}

// ── Not configured notice ─────────────────────────────────────────────────────
function NotConfiguredNotice() {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.sec, marginBottom: 8 }}>Finishes database not configured</div>
      <div style={{ fontSize: 11, color: C.muted, maxWidth: 420, margin: '0 auto' }}>
        Add <code style={{ color: '#60a5fa', background: C.bgDeep, padding: '1px 5px', borderRadius: 3 }}>NOTION_DB_FINISHES</code> to your <code style={{ color: '#60a5fa', background: C.bgDeep, padding: '1px 5px', borderRadius: 3 }}>.env</code> file and restart the server.
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FinishesSchedulePage() {
  const [finishes,      setFinishes]      = useState([]);
  const [projects,      setProjects]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [configured,    setConfigured]    = useState(true);
  const [refreshKey,    setRefreshKey]    = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [filterProject,   setFilterProject]   = useState('all');
  const [filterItem,      setFilterItem]      = useState('all');
  const [filterCadRef,    setFilterCadRef]    = useState('all');
  const [filterSpecRef,   setFilterSpecRef]   = useState('all');
  const [filterSampleRef, setFilterSampleRef] = useState('all');
  const [filterApproved,    setFilterApproved]   = useState(new Set());
  const [filterSampleType,  setFilterSampleType] = useState(new Set());

  // ── Sort ───────────────────────────────────────────────────────────────────
  const [sortBy,  setSortBy]  = useState('cadRef');
  const [sortDir, setSortDir] = useState('asc');

  // ── Group ──────────────────────────────────────────────────────────────────
  const [groupBy,  setGroupBy]  = useState('project');
  const [expanded, setExpanded] = useState({});

  // ── Columns ────────────────────────────────────────────────────────────────
  const [colConfig,    setColConfig]    = useState(() => initColConfig(DEFAULT_COLUMNS, COL_LS_KEY));
  const [showColPanel, setShowColPanel] = useState(false);
  const colConfigRef = useRef(colConfig);
  useEffect(() => { colConfigRef.current = colConfig; persistColConfig(colConfig, COL_LS_KEY); }, [colConfig]);

  // ── Finish field order ─────────────────────────────────────────────────────
  const [fieldOrder,     setFieldOrder]     = useState(() => loadFieldOrder());
  const [showFieldPanel, setShowFieldPanel] = useState(false);

  const handleFieldOrderApply = order => {
    setFieldOrder(order);
    saveFieldOrder(order);
  };

  const today = new Date();

  // ── Auto-refresh ───────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setRefreshKey(k => k + 1), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // ── Fetch projects ─────────────────────────────────────────────────────────
  useEffect(() => {
    const cached = getCached('projects');
    if (cached) { setProjects(cached); return; }
    fetch('/api/projects').then(r => r.json())
      .then(d => { const l = Array.isArray(d) ? d : []; setCached('projects', l); setProjects(l); })
      .catch(() => {});
  }, []);

  // ── Fetch finishes ─────────────────────────────────────────────────────────
  useEffect(() => {
    const cached = getCached(CACHE_KEY);
    if (cached && refreshKey === 0) {
      setFinishes(cached.items ?? []);
      setConfigured(cached.configured ?? true);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch('/api/finishes-schedule')
      .then(r => { if (!r.ok) throw Object.assign(new Error('fetch failed'), { status: r.status }); return r.json(); })
      .then(d => {
        setCached(CACHE_KEY, d);
        setFinishes(d.items ?? []);
        setConfigured(d.configured ?? false);
        setLastRefreshed(new Date());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  // ── Column resize ──────────────────────────────────────────────────────────
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

  // ── Derived filter options ─────────────────────────────────────────────────
  const allItemNames   = [...new Set(finishes.flatMap(r => r.itemNames ?? []))].sort();
  const allCadRefs     = [...new Set(finishes.map(r => r.cadRef).filter(Boolean))].sort();
  const allSpecRefs    = [...new Set(finishes.flatMap(r => r.specRef ?? []))].sort();
  const allSampleRefs  = [...new Set(finishes.map(r => r.sampleRef).filter(Boolean))].sort();

  const rawApprovedVals = [...new Set(finishes.map(r => r.approved ?? 'Not Submitted'))];
  const approvedOptions = APPROVED_ORDER.filter(v => rawApprovedVals.includes(v))
                            .concat(rawApprovedVals.filter(v => !APPROVED_ORDER.includes(v)));

  const rawSampleTypeVals = [...new Set(finishes.map(r => r.sampleType).filter(Boolean))];
  const sampleTypeOptions = SAMPLE_TYPE_ORDER.filter(v => rawSampleTypeVals.includes(v))
                              .concat(rawSampleTypeVals.filter(v => !SAMPLE_TYPE_ORDER.includes(v)));

  // ── Apply filters ──────────────────────────────────────────────────────────
  const filtered = finishes.filter(r => {
    if (filterProject  !== 'all' && r.projectId !== filterProject)              return false;
    if (filterItem     !== 'all' && !(r.itemNames ?? []).includes(filterItem))  return false;
    if (filterCadRef   !== 'all' && r.cadRef !== filterCadRef)                  return false;
    if (filterSpecRef  !== 'all' && !(r.specRef ?? []).includes(filterSpecRef)) return false;
    if (filterSampleRef !== 'all' && r.sampleRef !== filterSampleRef)           return false;
    if (filterApproved.size > 0   && !filterApproved.has(r.approved ?? 'Not Submitted')) return false;
    if (filterSampleType.size > 0 && !filterSampleType.has(r.sampleType ?? ''))          return false;
    return true;
  });

  // ── Apply sort ─────────────────────────────────────────────────────────────
  const sorted = [...filtered].sort((a, b) => {
    let va, vb;
    switch (sortBy) {
      case 'sampleRef':   va = a.sampleRef   ?? ''; vb = b.sampleRef   ?? ''; break;
      case 'submittedOn': va = a.submittedOn ?? ''; vb = b.submittedOn ?? ''; break;
      default:            va = a.cadRef      ?? ''; vb = b.cadRef      ?? '';
    }
    const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
    return sortDir === 'desc' ? -cmp : cmp;
  });

  // ── Project colour map ─────────────────────────────────────────────────────
  const colorMap = assignProjectColors([
    ...projects,
    ...finishes.filter(r => r.projectId).map(r => ({ id: r.projectId })),
  ]);
  const projName = id => projects.find(p => p.id === id)?.name ?? null;

  // ── Build groups ───────────────────────────────────────────────────────────
  const buildGroups = () => {
    if (groupBy === 'none') return [{ key: '__all__', label: null, color: C.muted, rows: sorted }];
    const map  = new Map();
    const list = [];
    const push = (key, row, color) => {
      if (!map.has(key)) { map.set(key, []); list.push({ key, label: key, color, rows: map.get(key) }); }
      map.get(key).push(row);
    };
    for (const row of sorted) {
      const projColor = row.projectId ? (colorMap.get(row.projectId) ?? PROJECT_COLORS[0]) : C.muted;
      switch (groupBy) {
        case 'project': {
          const name = row.projectId ? (projName(row.projectId) ?? `Project ${row.projectId.slice(0,8)}`) : 'No Project';
          push(name, row, projColor);
          break;
        }
        case 'item':
          if (row.itemNames?.length) row.itemNames.forEach(n => push(n, row, projColor));
          else push('No Item', row, C.muted);
          break;
        case 'specRef':
          if (row.specRef?.length) row.specRef.forEach(s => push(s, row, specColor(s)));
          else push('No Spec Ref', row, C.muted);
          break;
        case 'approved': {
          const v = row.approved ?? 'Not Submitted';
          push(APPROVED_CFG[v]?.label ?? v, row, approvedColor(v));
          break;
        }
        case 'sampleType': {
          const v = row.sampleType ?? 'No Sample Type';
          push(v, row, sampleTypeColor(v));
          break;
        }
      }
    }
    if (groupBy === 'approved') {
      const ORDER = ['A — Approved','B — Minor Comments','C — Major Comments','Awaiting Approval','Not Submitted'];
      list.sort((a,b) => {
        const ai = ORDER.indexOf(a.label), bi = ORDER.indexOf(b.label);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1; if (bi !== -1) return 1;
        return a.label.localeCompare(b.label);
      });
    } else if (groupBy === 'sampleType') {
      list.sort((a,b) => {
        const ai = SAMPLE_TYPE_ORDER.indexOf(a.label), bi = SAMPLE_TYPE_ORDER.indexOf(b.label);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1; if (bi !== -1) return 1;
        if (a.label.startsWith('No ')) return 1;
        if (b.label.startsWith('No ')) return -1;
        return a.label.localeCompare(b.label);
      });
    } else {
      list.sort((a,b) => {
        if (a.label.startsWith('No ') && !b.label.startsWith('No ')) return 1;
        if (!a.label.startsWith('No ') && b.label.startsWith('No ')) return -1;
        return a.label.localeCompare(b.label);
      });
    }
    return list;
  };

  const groups       = buildGroups();
  const allGroupKeys = groups.map(g => g.key);
  const expandAll    = () => setExpanded(Object.fromEntries(allGroupKeys.map(k => [k, true])));
  const collapseAll  = () => setExpanded(Object.fromEntries(allGroupKeys.map(k => [k, false])));
  const isExpanded   = key => expanded[key] !== false;

  const visibleCols = mergeVisibleCols(colConfig, DEFAULT_COLUMNS);

  const handleSpecClick = spec => setFilterSpecRef(prev => prev === spec ? 'all' : spec);

  const handleExportCSV = () => {
    const fname = `finishes-schedule-${new Date().toISOString().slice(0,10)}.csv`;
    if (groupBy !== 'none') {
      exportGroupedCSV(visibleCols, groups, fieldOrder, fname);
    } else {
      exportFlatCSV(visibleCols, sorted, fieldOrder, fname);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','ui-monospace',monospace", padding: '24px 32px' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>FINISHES SCHEDULE</h1>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Material &amp; finish specifications</div>
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
            onClick={() => { setCached(CACHE_KEY, null); setRefreshKey(k => k + 1); }}
            title="Refresh data"
            style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontSize: 11, padding: '3px 8px', cursor: 'pointer', lineHeight: 1 }}
          >↻</button>
        </div>
      </div>

      <AppNav />

      {!loading && !configured && <NotConfiguredNotice />}
      {!loading && configured && filtered.length > 0 && <SummaryBar items={filtered} />}

      {/* ── Toolbar ── */}
      {configured && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>

          {/* Single-select filters */}
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={selStyle} title="Filter by Project">
            <option value="all">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <select value={filterItem} onChange={e => setFilterItem(e.target.value)} style={selStyle} title="Filter by Item">
            <option value="all">All Items</option>
            {allItemNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>

          <select value={filterCadRef} onChange={e => setFilterCadRef(e.target.value)} style={selStyle} title="Filter by CAD Ref">
            <option value="all">All CAD Refs</option>
            {allCadRefs.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <select
            value={filterSpecRef}
            onChange={e => setFilterSpecRef(e.target.value)}
            style={{ ...selStyle, borderColor: filterSpecRef !== 'all' ? hexToRgba(specColor(filterSpecRef), 0.55) : C.border, color: filterSpecRef !== 'all' ? specColor(filterSpecRef) : C.sec }}
            title="Filter by Spec Ref"
          >
            <option value="all">All Spec Refs</option>
            {allSpecRefs.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select value={filterSampleRef} onChange={e => setFilterSampleRef(e.target.value)} style={selStyle} title="Filter by Sample Ref">
            <option value="all">All Sample Refs</option>
            {allSampleRefs.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Multi-select filters */}
          <MultiSelectFilter
            label="Approved"
            options={approvedOptions}
            selected={filterApproved}
            onChange={setFilterApproved}
            colorFn={approvedColor}
            labelFn={v => APPROVED_CFG[v]?.label ?? v}
          />
          <MultiSelectFilter
            label="Sample Type"
            options={sampleTypeOptions}
            selected={filterSampleType}
            onChange={setFilterSampleType}
            colorFn={sampleTypeColor}
          />

          <div style={{ width: 1, height: 18, background: C.border, margin: '0 2px' }} />

          {/* Group by */}
          <select value={groupBy} onChange={e => { setGroupBy(e.target.value); setExpanded({}); }} style={toolSel}>
            <option value="project">Group: Project</option>
            <option value="item">Group: Item</option>
            <option value="specRef">Group: Spec Ref</option>
            <option value="approved">Group: Approved</option>
            <option value="sampleType">Group: Sample Type</option>
            <option value="none">No Grouping</option>
          </select>

          {/* Sort */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={toolSel}>
            <option value="cadRef">Sort: CAD Ref</option>
            <option value="sampleRef">Sort: Sample Ref</option>
            <option value="submittedOn">Sort: Submitted On</option>
          </select>
          <button
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd', minWidth: 30 }}
            title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
          >{sortDir === 'asc' ? '↑' : '↓'}</button>

          {/* Expand / Collapse */}
          {groupBy !== 'none' && (
            <>
              <button onClick={expandAll}   style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd' }}>Expand All</button>
              <button onClick={collapseAll} style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd' }}>Collapse All</button>
            </>
          )}

          {/* Columns */}
          <button onClick={() => setShowColPanel(true)} style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd' }}>⚙ Columns</button>

          {/* Finish fields order */}
          <button
            onClick={() => setShowFieldPanel(true)}
            title="Configure Finish Description field order and visibility"
            style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd' }}
          >⚙ Finish Fields</button>

          {/* Count */}
          <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>
            {loading ? 'Loading…' : (
              filtered.length !== finishes.length
                ? `${filtered.length} of ${finishes.length} finishes`
                : `${finishes.length} finish${finishes.length !== 1 ? 'es' : ''}`
            )}
          </span>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            title={groupBy !== 'none' ? 'Export grouped view to CSV' : 'Export to CSV'}
            style={{ ...selStyle, borderColor: '#166534', color: '#4ade80' }}
          >↓ CSV</button>
        </div>
      )}

      {/* Panels */}
      {showColPanel && (
        <ColumnConfigPanel
          colConfig={colConfig}
          defaults={DEFAULT_COLUMNS}
          onClose={() => setShowColPanel(false)}
          onChange={cfg => { setColConfig(cfg); persistColConfig(cfg, COL_LS_KEY); }}
        />
      )}
      {showFieldPanel && (
        <FinishFieldOrderPanel
          fields={fieldOrder}
          onApply={handleFieldOrderApply}
          onClose={() => setShowFieldPanel(false)}
        />
      )}

      {/* ── Content ── */}
      {loading ? (
        <div style={{ color: C.muted, fontSize: 12 }}>Loading finishes…</div>
      ) : !configured ? null : filtered.length === 0 ? (
        <div style={{ padding: '24px', color: C.muted, fontSize: 12, textAlign: 'center', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8 }}>
          No finishes match the current filters.
        </div>
      ) : groupBy === 'none' ? (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <FinishTable rows={sorted} visibleCols={visibleCols} startResize={startResize} activeSpecRef={filterSpecRef} onSpecClick={handleSpecClick} fieldOrder={fieldOrder} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groups.map(({ key, label, color, rows: groupRows }) => {
            const open = isExpanded(key);
            return (
              <div
                key={key}
                style={{
                  background: C.bgCard, border: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${color}`, borderRadius: 10, overflow: 'hidden',
                  boxShadow: `0 2px 10px ${hexToRgba(color, 0.08)}`,
                }}
              >
                <GroupHeader
                  label={label ?? key} count={groupRows.length} color={color}
                  open={open}
                  onToggle={() => setExpanded(prev => ({ ...prev, [key]: !open }))}
                />
                {open && (
                  <FinishTable rows={groupRows} visibleCols={visibleCols} startResize={startResize} activeSpecRef={filterSpecRef} onSpecClick={handleSpecClick} fieldOrder={fieldOrder} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
