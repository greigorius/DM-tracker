/**
 * QuickLogBar — static queue panels (no action buttons, always visible)
 * Quick entry is handled via the AppNav [+ QUICK ENTRY] modal.
 */

import { useState } from 'react';
import { useQueue } from '../hooks/useQueue.js';
import { PROJECTS, MOCK_ITEMS, PHASE_ORDER } from '../data/mockData.js';
import { assignProjectColors, PROJECT_COLORS } from '../data/colors.js';

const C = {
  bg:     '#0a0f1a',
  card:   '#0d1525',
  panel:  '#0d1830',
  border: '#1e2d45',
  text:   '#e2e8f0',
  sec:    '#94a3b8',
  muted:  '#7b90b0',
  grid:   '#1a2540',
  input:  '#0b1020',
};

// Distinct from PROJECT_COLORS — these identify entry *type*, not project
const PANEL_CONFIG = [
  { type: 'todo',           label: 'To Dos',          endpoint: '/api/quick-log/todo',           accentColor: '#94a3b8' },
  { type: 'drawing-check',  label: 'Drawing Checks',  endpoint: '/api/quick-log/drawing-check',  accentColor: '#2dd4bf' },
  { type: 'comment-review', label: 'Comment Reviews', endpoint: '/api/quick-log/comment-review', accentColor: '#e879f9' },
  { type: 'rfi',            label: 'RFIs',            endpoint: '/api/quick-log/rfi',            accentColor: '#fb923c' },
  { type: 'production',     label: 'Production',      endpoint: '/api/quick-log/production',     accentColor: '#a3e635' },
];

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function QueuePanel({ getByType, updateItem, removeItem }) {
  const [collapsed,  setCollapsed]  = useState({});
  const [submitting, setSubmitting] = useState({});
  const [errors,     setErrors]     = useState({});

  // Build project color map from all queued items
  const allProjectIds = [...new Set(
    PANEL_CONFIG.flatMap(cfg => getByType(cfg.type)).map(i => i.projectId).filter(Boolean)
  )];
  const colorMap = assignProjectColors(allProjectIds.map(id => ({ id })));
  const projectColor = (projectId) => projectId ? (colorMap.get(projectId) ?? PROJECT_COLORS[0]) : null;

  const togglePanel = (type) => setCollapsed(prev => ({ ...prev, [type]: !prev[type] }));

  const submitPanel = async (cfg) => {
    const items = getByType(cfg.type);
    if (!items.length) return;
    setSubmitting(prev => ({ ...prev, [cfg.type]: true }));
    setErrors(prev => ({ ...prev, [cfg.type]: null }));

    for (const item of items) {
      try {
        const res = await fetch(cfg.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        if (res.ok) {
          removeItem(item.id);
        } else {
          const err = await res.json().catch(() => ({}));
          setErrors(prev => ({ ...prev, [cfg.type]: err.error || `HTTP ${res.status}` }));
        }
      } catch (e) {
        setErrors(prev => ({ ...prev, [cfg.type]: e.message || 'Network error' }));
      }
    }
    setSubmitting(prev => ({ ...prev, [cfg.type]: false }));
  };

  const inlineSelectStyle = {
    background: C.input, border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.sec, fontSize: 10, padding: '2px 4px', cursor: 'pointer', fontFamily: 'inherit',
  };
  const inlineInputStyle = {
    background: C.input, border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.sec, fontSize: 10, padding: '2px 6px', fontFamily: 'inherit',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {PANEL_CONFIG.map(cfg => {
        const items      = getByType(cfg.type);
        const isEmpty    = items.length === 0;
        const isCollapsed  = collapsed[cfg.type] ?? isEmpty;
        const isSubmitting = submitting[cfg.type];
        const err        = errors[cfg.type];

        return (
          <div key={cfg.type} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', opacity: isEmpty ? 0.5 : 1 }}>

            {/* Panel header */}
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', cursor: 'pointer', background: C.panel, borderBottom: isCollapsed ? 'none' : `1px solid ${C.border}` }}
              onClick={() => togglePanel(cfg.type)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.accentColor }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{cfg.label}</span>
                {items.length > 0 && (
                  <span style={{ fontSize: 9, background: '#1e293b', color: cfg.accentColor, padding: '1px 6px', borderRadius: 999, fontWeight: 800 }}>
                    {items.length}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {!isCollapsed && items.length > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); submitPanel(cfg); }}
                    disabled={isSubmitting}
                    style={{ fontSize: 10, fontWeight: 700, background: isSubmitting ? '#1e293b' : '#14532d', color: isSubmitting ? C.muted : '#4ade80', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                  >
                    {isSubmitting ? 'Submitting…' : `Submit ${items.length} to Notion`}
                  </button>
                )}
                <span style={{ fontSize: 11, color: C.muted }}>{isCollapsed ? '▸' : '▾'}</span>
              </div>
            </div>

            {!isCollapsed && (
              <div style={{ padding: isEmpty ? '10px 14px' : '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {isEmpty && (
                  <div style={{ fontSize: 10, color: C.muted, fontStyle: 'italic' }}>No items queued</div>
                )}
                {err && (
                  <div style={{ padding: '6px 10px', background: 'rgba(239,68,68,0.08)', border: `1px solid rgba(239,68,68,0.2)`, borderRadius: 6, fontSize: 10, color: '#f87171' }}>
                    Error: {err}
                  </div>
                )}
                {items.map(item => {
                  const projColor = projectColor(item.projectId);
                  const rowItems  = item.projectId ? MOCK_ITEMS.filter(i => i.projectId === item.projectId) : [];
                  const itemName  = rowItems.find(i => i.id === item.itemId)?.name ?? null;
                  const projName  = PROJECTS.find(p => p.id === item.projectId)?.name ?? null;

                  return (
                    <div
                      key={item.id}
                      style={{
                        background:   C.bg,
                        border:       `1px solid ${C.border}`,
                        borderLeft:   projColor ? `3px solid ${projColor}` : `1px solid ${C.border}`,
                        borderRadius: 7,
                        padding:      '9px 12px',
                        boxShadow:    projColor ? `0 2px 10px ${hexToRgba(projColor, 0.18)}` : 'none',
                        display:      'flex',
                        flexDirection: 'column',
                        gap:          6,
                      }}
                    >
                      {/* Description row */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <input
                          value={item.description || ''}
                          onChange={e => updateItem(item.id, { description: e.target.value })}
                          placeholder="Description…"
                          style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: `1px solid ${C.grid}`, color: C.text, fontSize: 12, fontWeight: 700, padding: '0 0 3px', outline: 'none', fontFamily: 'inherit' }}
                        />
                        <button
                          onClick={() => removeItem(item.id)}
                          style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                          title="Remove"
                        >×</button>
                      </div>

                      {/* Metadata row */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                          value={item.projectId || ''}
                          onChange={e => updateItem(item.id, { projectId: e.target.value || null, itemId: null })}
                          style={inlineSelectStyle}
                        >
                          <option value="">Project —</option>
                          {PROJECTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>

                        <select
                          value={item.itemId || ''}
                          onChange={e => updateItem(item.id, { itemId: e.target.value || null })}
                          style={inlineSelectStyle}
                          disabled={!item.projectId}
                        >
                          <option value="">Item —</option>
                          {rowItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </select>

                        <input
                          value={item.assignee || ''}
                          onChange={e => updateItem(item.id, { assignee: e.target.value })}
                          placeholder="Assignee"
                          style={{ ...inlineInputStyle, width: 64 }}
                        />

                        <select
                          value={item.dmPhase || ''}
                          onChange={e => updateItem(item.id, { dmPhase: e.target.value || null })}
                          style={{ ...inlineSelectStyle, maxWidth: 64 }}
                        >
                          <option value="">Phase —</option>
                          {PHASE_ORDER.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>

                        <input
                          type="date"
                          value={item.date || ''}
                          onChange={e => updateItem(item.id, { date: e.target.value })}
                          style={{ ...inlineInputStyle, width: 110 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function QuickLogBar() {
  const { updateItem, removeItem, getByType } = useQueue();
  return (
    <div style={{ fontFamily: "'DM Mono','ui-monospace',Consolas,monospace" }}>
      <QueuePanel getByType={getByType} updateItem={updateItem} removeItem={removeItem} />
    </div>
  );
}
