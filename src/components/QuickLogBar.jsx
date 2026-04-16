/**
 * QuickLogBar — static queue panels (no action buttons, always visible)
 * Quick entry is handled via the AppNav [+ QUICK ENTRY] modal.
 */

import { useState } from 'react';
import { useQueue } from '../hooks/useQueue.js';
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
                  const projColor  = projectColor(item.projectId);
                  const isAssigned = !!(item.assignee);
                  const isDone     = !!(item.taskDone);

                  return (
                    <div
                      key={item.id}
                      style={{
                        background:    C.bg,
                        border:        `1px solid ${C.border}`,
                        borderLeft:    projColor ? `3px solid ${projColor}` : `1px solid ${C.border}`,
                        borderRadius:  7,
                        padding:       '8px 12px',
                        boxShadow:     projColor ? `0 2px 10px ${hexToRgba(projColor, 0.18)}` : 'none',
                        display:       'flex',
                        alignItems:    'center',
                        gap:           10,
                        opacity:       isDone ? 0.55 : 1,
                      }}
                    >
                      {/* Done checkbox */}
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={e => updateItem(item.id, { taskDone: e.target.checked })}
                        style={{ cursor: 'pointer', accentColor: '#4ade80', flexShrink: 0 }}
                        title="Mark done"
                      />

                      {/* Description */}
                      <span style={{
                        flex: 1, fontSize: 12, fontWeight: 600,
                        color: isDone ? C.muted : C.text,
                        textDecoration: isDone ? 'line-through' : 'none',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {item.description || <span style={{ color: C.muted, fontStyle: 'italic' }}>No description</span>}
                      </span>

                      {/* Assigned / Unassigned badge */}
                      <span style={{
                        fontSize: 9, fontWeight: 700, flexShrink: 0,
                        padding: '2px 7px', borderRadius: 999,
                        background: isAssigned ? 'rgba(96,165,250,0.12)' : 'rgba(123,144,176,0.1)',
                        color: isAssigned ? '#60a5fa' : C.muted,
                        border: `1px solid ${isAssigned ? 'rgba(96,165,250,0.25)' : 'rgba(123,144,176,0.2)'}`,
                      }}>
                        {isAssigned ? item.assignee : 'Unassigned'}
                      </span>

                      {/* Date raised badge */}
                      {item.date && (
                        <span style={{
                          fontSize: 9, fontWeight: 600, flexShrink: 0,
                          padding: '2px 7px', borderRadius: 999,
                          background: 'rgba(30,45,69,0.8)',
                          color: C.muted,
                          border: `1px solid ${C.border}`,
                        }}>
                          {new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                        </span>
                      )}

                      {/* Remove */}
                      <button
                        onClick={() => removeItem(item.id)}
                        style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                        title="Remove"
                      >×</button>
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
