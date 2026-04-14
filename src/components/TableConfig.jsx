/**
 * TableConfig.jsx
 * Shared column configuration utilities: ColumnConfigPanel + SharedTableHead.
 * Each page owns its own DEFAULT_COLUMNS, localStorage key, colConfig state, and resize handler.
 */
import { useState } from 'react';

const TC = {
  bgPanel: '#0d1830',
  border:  '#1e2d45',
  text:    '#e2e8f0',
  sec:     '#94a3b8',
  muted:   '#7b90b0',
  grid:    '#1a2540',
};

// ── initColConfig ─────────────────────────────────────────────────────────────
// Merges stored config (widths, visibility, order) with current defaults.
// defaults: [{ key, label, defaultWidth, minWidth, align }]
export function initColConfig(defaults, lsKey) {
  try {
    const stored = JSON.parse(localStorage.getItem(lsKey) || 'null');
    if (!stored || !Array.isArray(stored)) {
      return defaults.map(c => ({ key: c.key, visible: true, width: c.defaultWidth }));
    }
    const defMap    = new Map(defaults.map(c => [c.key, c]));
    const storedMap = new Map(stored.map(c => [c.key, c]));
    const orderedKeys = [...stored.map(c => c.key).filter(k => defMap.has(k))];
    for (const def of defaults) {
      if (!orderedKeys.includes(def.key)) orderedKeys.push(def.key);
    }
    return orderedKeys.map(k => {
      const def = defMap.get(k);
      const s   = storedMap.get(k);
      return { key: k, visible: s?.visible ?? true, width: s?.width ?? def?.defaultWidth ?? 100 };
    });
  } catch {
    return defaults.map(c => ({ key: c.key, visible: true, width: c.defaultWidth }));
  }
}

// ── persistColConfig ──────────────────────────────────────────────────────────
export function persistColConfig(config, lsKey) {
  try { localStorage.setItem(lsKey, JSON.stringify(config)); } catch {}
}

// ── mergeVisibleCols ──────────────────────────────────────────────────────────
// Returns visible cols with full metadata merged from defaults.
export function mergeVisibleCols(colConfig, defaults) {
  const defMap = new Map(defaults.map(c => [c.key, c]));
  return colConfig
    .filter(c => c.visible)
    .map(c => ({ ...defMap.get(c.key), width: c.width }))
    .filter(Boolean);
}

// ── exportToCSV ───────────────────────────────────────────────────────────────
// Generic CSV export. getRaw(row, colKey) → string value.
export function exportToCSV(visibleCols, rows, getRaw, filename) {
  const headers = visibleCols.map(c => c.label);
  const esc     = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines   = [headers.map(esc).join(',')];
  for (const row of rows) {
    lines.push(visibleCols.map(c => esc(getRaw(row, c.key))).join(','));
  }
  const csv  = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename ?? `export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── ColumnConfigPanel ─────────────────────────────────────────────────────────
export function ColumnConfigPanel({ colConfig, defaults, onClose, onChange }) {
  const [local, setLocal] = useState(colConfig);
  const defMap = new Map(defaults.map(c => [c.key, c]));

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
  const reset = () => setLocal(defaults.map(c => ({ key: c.key, visible: true, width: c.defaultWidth })));

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: TC.bgPanel, border: `1px solid ${TC.border}`, borderRadius: 10,
        padding: 24, width: 320, maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 12,
        fontFamily: "'DM Mono','ui-monospace',monospace" }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: TC.text }}>Configure Columns</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: TC.muted,
            cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {local.map((col, idx) => (
            <div key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 0', borderBottom: `1px solid ${TC.grid}` }}>
              <input type="checkbox" checked={col.visible} onChange={() => toggle(col.key)}
                style={{ cursor: 'pointer', accentColor: '#3b82f6', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11, color: col.visible ? TC.text : TC.muted }}>
                {defMap.get(col.key)?.label ?? col.key}
              </span>
              <button onClick={() => move(col.key, -1)} disabled={idx === 0}
                style={{ background: 'none', border: `1px solid ${TC.border}`, borderRadius: 3,
                  color: TC.muted, cursor: idx === 0 ? 'default' : 'pointer',
                  fontSize: 9, padding: '2px 5px', opacity: idx === 0 ? 0.3 : 1,
                  fontFamily: 'inherit' }}>▲</button>
              <button onClick={() => move(col.key, 1)} disabled={idx === local.length - 1}
                style={{ background: 'none', border: `1px solid ${TC.border}`, borderRadius: 3,
                  color: TC.muted, cursor: idx === local.length - 1 ? 'default' : 'pointer',
                  fontSize: 9, padding: '2px 5px', opacity: idx === local.length - 1 ? 0.3 : 1,
                  fontFamily: 'inherit' }}>▼</button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={reset}
            style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${TC.border}`,
              background: 'transparent', color: TC.sec, fontSize: 11, cursor: 'pointer',
              fontFamily: 'inherit' }}>Reset</button>
          <button onClick={apply}
            style={{ padding: '5px 14px', borderRadius: 5, border: 'none', background: '#1d4ed8',
              color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit' }}>Apply</button>
        </div>
      </div>
    </div>
  );
}

// ── SharedTableHead ───────────────────────────────────────────────────────────
// visibleCols: merged array with { key, label, align, width, minWidth }
export function SharedTableHead({ visibleCols, onResizeStart }) {
  return (
    <thead>
      <tr>
        {visibleCols.map(col => (
          <th key={col.key} style={{
            position: 'relative',
            padding: '7px 10px',
            textAlign: col.align ?? 'center',
            fontSize: 9, fontWeight: 700, color: TC.muted,
            letterSpacing: '0.07em', textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            width: col.width,
            minWidth: col.minWidth ?? 40,
            borderBottom: `1px solid ${TC.border}`,
            background: '#080d17',
            userSelect: 'none',
          }}>
            {col.label}
            <div
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onResizeStart(e, col.key); }}
              style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5,
                cursor: 'col-resize', zIndex: 1 }}
            />
          </th>
        ))}
      </tr>
    </thead>
  );
}
