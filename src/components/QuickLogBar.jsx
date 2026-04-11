/**
 * QuickLogBar — static queue panels (no action buttons, always visible)
 * Quick entry is handled via the AppNav [+ QUICK ENTRY] modal.
 */

import { useState } from 'react';
import { useQueue } from '../hooks/useQueue.js';
import { PROJECTS, MOCK_ITEMS, PHASE_ORDER } from '../data/mockData.js';

const C = {
  bg:      '#0a0f1a',
  card:    '#0d1525',
  panel:   '#0d1830',
  border:  '#1e2d45',
  text:    '#e2e8f0',
  sec:     '#94a3b8',
  muted:   '#7b90b0',
  grid:    '#1a2540',
  input:   '#0b1020',
};

const PANEL_CONFIG = [
  { type: 'todo',           label: 'To Dos',          endpoint: '/api/quick-log/todo',       accentColor: '#818cf8' },
  { type: 'drawing-check',  label: 'Drawing Checks',  endpoint: '/api/quick-log/todo',       accentColor: '#a78bfa' },
  { type: 'comment-review', label: 'Comment Reviews', endpoint: '/api/quick-log/todo',       accentColor: '#22d3ee' },
  { type: 'rfi',            label: 'RFIs',            endpoint: '/api/quick-log/rfi',        accentColor: '#f87171' },
  { type: 'production',     label: 'Production',      endpoint: '/api/quick-log/production', accentColor: '#34d399' },
];

function QueuePanel({ getByType, updateItem, removeItem }) {
  const [collapsed,  setCollapsed]  = useState({});
  const [submitting, setSubmitting] = useState({});
  const [errors,     setErrors]     = useState({});

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
    color: C.text, fontSize: 10, padding: '3px 4px', maxWidth: 120, cursor: 'pointer',
  };
  const inlineInputStyle = {
    background: C.input, border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.text, fontSize: 10, padding: '3px 6px', width: 64,
  };

  const totalItems = PANEL_CONFIG.reduce((n, p) => n + getByType(p.type).length, 0);

  if (totalItems === 0) {
    return (
      <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic', padding: '8px 0' }}>
        No tasks queued
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {PANEL_CONFIG.map(cfg => {
        const items       = getByType(cfg.type);
        if (!items.length) return null;
        const isCollapsed = collapsed[cfg.type];
        const isSubmitting = submitting[cfg.type];
        const err         = errors[cfg.type];

        return (
          <div key={cfg.type} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {/* Panel header */}
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', cursor: 'pointer', background: C.panel, borderBottom: isCollapsed ? 'none' : `1px solid ${C.border}` }}
              onClick={() => togglePanel(cfg.type)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.accentColor }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{cfg.label}</span>
                <span style={{ fontSize: 9, background: '#1e293b', color: cfg.accentColor, padding: '1px 6px', borderRadius: 999, fontWeight: 800 }}>
                  {items.length}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {!isCollapsed && (
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
              <div>
                {err && (
                  <div style={{ padding: '6px 14px', background: 'rgba(239,68,68,0.08)', borderBottom: `1px solid rgba(239,68,68,0.2)`, fontSize: 10, color: '#f87171' }}>
                    Error: {err}
                  </div>
                )}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: '#0b1020' }}>
                        {['Description', 'Project', 'Item', 'Assignee', 'Phase', 'Date', ''].map((h, i) => (
                          <th key={i} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const rowItems = item.projectId ? MOCK_ITEMS.filter(i => i.projectId === item.projectId) : [];
                        return (
                          <tr key={item.id} style={{ background: idx % 2 === 0 ? C.card : '#0b1020', borderBottom: `1px solid ${C.grid}` }}>
                            <td style={{ padding: '6px 10px', maxWidth: 220 }}>
                              <input value={item.description || ''} onChange={e => updateItem(item.id, { description: e.target.value })} style={{ ...inlineInputStyle, width: '100%', maxWidth: 200 }} />
                            </td>
                            <td style={{ padding: '6px 10px' }}>
                              <select value={item.projectId || ''} onChange={e => updateItem(item.id, { projectId: e.target.value || null, itemId: null })} style={inlineSelectStyle}>
                                <option value="">—</option>
                                {PROJECTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '6px 10px' }}>
                              <select value={item.itemId || ''} onChange={e => updateItem(item.id, { itemId: e.target.value || null })} style={inlineSelectStyle} disabled={!item.projectId}>
                                <option value="">—</option>
                                {rowItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '6px 10px' }}>
                              <input value={item.assignee || ''} onChange={e => updateItem(item.id, { assignee: e.target.value })} placeholder="—" style={{ ...inlineInputStyle, width: 48 }} />
                            </td>
                            <td style={{ padding: '6px 10px' }}>
                              <select value={item.dmPhase || ''} onChange={e => updateItem(item.id, { dmPhase: e.target.value || null })} style={{ ...inlineSelectStyle, maxWidth: 70 }}>
                                <option value="">—</option>
                                {PHASE_ORDER.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontSize: 10, color: C.muted }}>
                              <input type="date" value={item.date || ''} onChange={e => updateItem(item.id, { date: e.target.value })} style={{ ...inlineInputStyle, width: 110 }} />
                            </td>
                            <td style={{ padding: '6px 10px' }}>
                              <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 4px' }} title="Remove">×</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
