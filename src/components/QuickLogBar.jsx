/**
 * QuickLogBar — action buttons + modals + queued-notes panel
 *
 * Props:
 *   defaultProjectId  string | null  — pre-selects a project in all modals
 */

import { useState } from 'react';
import { useQueue } from '../hooks/useQueue.js';
import { PROJECTS, MOCK_ITEMS, DM_PHASES, PHASE_ORDER } from '../data/mockData.js';

// ── Palette ───────────────────────────────────────────────────────────────────
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

const today = () => new Date().toISOString().slice(0, 10);

// ── Shared input styles ───────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', background: C.input, border: `1px solid ${C.border}`,
  borderRadius: 6, color: C.text, fontSize: 12, padding: '7px 10px',
  outline: 'none', boxSizing: 'border-box',
};
const labelStyle = { fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5, display: 'block' };
const fieldStyle = { marginBottom: 14 };

// ── Button helpers ────────────────────────────────────────────────────────────
function Btn({ onClick, color = '#3b82f6', children, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '7px 14px', borderRadius: 6, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: disabled ? '#1e293b' : color, color: disabled ? C.muted : '#fff',
        fontSize: 12, fontWeight: 700, fontFamily: 'inherit', transition: 'opacity 0.1s',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function GhostBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${C.border}`, cursor: 'pointer', background: 'transparent', color: C.sec, fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
      {children}
    </button>
  );
}

// ── Modal base ────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, footer }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={onClose}
    >
      <div
        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: 500, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', position: 'relative' }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.sec, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 2px' }}>×</button>
        </div>
        {children}
        {footer && <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{footer}</div>}
      </div>
    </div>
  );
}

// ── Shared sub-components for modals ─────────────────────────────────────────
function ProjectSelect({ value, onChange, required }) {
  return (
    <div style={fieldStyle}>
      <label style={labelStyle}>Project {required && <span style={{ color: '#f87171' }}>*</span>}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
        <option value="">— select project —</option>
        {PROJECTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}

function ItemSelect({ value, onChange, projectId, required }) {
  const items = projectId ? MOCK_ITEMS.filter(i => i.projectId === projectId) : [];
  return (
    <div style={fieldStyle}>
      <label style={labelStyle}>Item {required && <span style={{ color: '#f87171' }}>*</span>}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle} disabled={!projectId}>
        <option value="">— {projectId ? 'select item' : 'select project first'} —</option>
        {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
    </div>
  );
}

function ExternalLink({ href, label }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#818cf8', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '1px solid #2e1f5e', borderRadius: 6 }}>
      {label} ↗
    </a>
  );
}

// ── Modal 1: New To Do ────────────────────────────────────────────────────────
function TodoModal({ onClose, onSave, defaultProjectId }) {
  const [description, setDescription] = useState('');
  const [projectId, setProjectId]     = useState(defaultProjectId || '');
  const [itemId, setItemId]           = useState('');
  const [assignee, setAssignee]       = useState('');
  const [dmPhase, setDmPhase]         = useState('');
  const [showOptional, setShowOptional] = useState(false);

  const save = () => {
    if (!description.trim()) return;
    onSave({ type: 'todo', description: description.trim(), projectId: projectId || null, itemId: itemId || null, assignee: assignee || null, dmPhase: dmPhase || null, date: today() });
  };

  return (
    <Modal title="+ New To Do" onClose={onClose} footer={
      <>
        <GhostBtn onClick={onClose}>Cancel</GhostBtn>
        <Btn onClick={save} disabled={!description.trim()} color="#6366f1">Save To Do</Btn>
      </>
    }>
      <div style={fieldStyle}>
        <label style={labelStyle}>What needs doing? <span style={{ color: '#f87171' }}>*</span></label>
        <textarea
          autoFocus
          value={description}
          onChange={e => setDescription(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }}
          placeholder="Describe the task…"
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
        <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>⌘/Ctrl + Enter to save</div>
      </div>

      <button
        onClick={() => setShowOptional(v => !v)}
        style={{ background: 'none', border: 'none', color: C.sec, fontSize: 11, cursor: 'pointer', padding: 0, marginBottom: showOptional ? 14 : 0, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        {showOptional ? '▾' : '▸'} Optional fields
      </button>

      {showOptional && (
        <>
          <ProjectSelect value={projectId} onChange={v => { setProjectId(v); setItemId(''); }} />
          <ItemSelect value={itemId} onChange={setItemId} projectId={projectId} />
          <div style={fieldStyle}>
            <label style={labelStyle}>Assignee</label>
            <input value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="e.g. JD" style={inputStyle} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>DM Phase</label>
            <select value={dmPhase} onChange={e => setDmPhase(e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {PHASE_ORDER.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Modal 2: Drawing Check ────────────────────────────────────────────────────
function DrawingCheckModal({ onClose, onSave, defaultProjectId }) {
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [itemId, setItemId]       = useState('');
  const [description, setDescription] = useState('Check drawing');
  const [date, setDate]           = useState(today());

  const dtCheckerUrl = typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_DT_CHECKER_URL || '') : '';
  const canSave = projectId && itemId;

  const save = () => {
    if (!canSave) return;
    onSave({ type: 'drawing-check', description: description.trim(), projectId, itemId, date });
  };

  return (
    <Modal title="Drawing Check" onClose={onClose} footer={
      <>
        <ExternalLink href={dtCheckerUrl} label="Open DT Checker" />
        <GhostBtn onClick={onClose}>Cancel</GhostBtn>
        <Btn onClick={save} disabled={!canSave} color="#7c3aed">Log Check</Btn>
      </>
    }>
      <ProjectSelect value={projectId} onChange={v => { setProjectId(v); setItemId(''); }} required />
      <ItemSelect value={itemId} onChange={setItemId} projectId={projectId} required />
      <div style={fieldStyle}>
        <label style={labelStyle}>Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
      </div>
    </Modal>
  );
}

// ── Modal 3: Comment Review ───────────────────────────────────────────────────
function CommentReviewModal({ onClose, onSave, defaultProjectId }) {
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [itemId, setItemId]       = useState('');
  const [description, setDescription] = useState('Review comments');
  const [date, setDate]           = useState(today());

  const reviewerUrl = typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_COMMENT_REVIEWER_URL || 'http://localhost:5174') : 'http://localhost:5174';
  const canSave = projectId && itemId;

  const save = () => {
    if (!canSave) return;
    onSave({ type: 'comment-review', description: description.trim(), projectId, itemId, date });
  };

  return (
    <Modal title="Comment Review" onClose={onClose} footer={
      <>
        <ExternalLink href={reviewerUrl} label="Open Comment Reviewer" />
        <GhostBtn onClick={onClose}>Cancel</GhostBtn>
        <Btn onClick={save} disabled={!canSave} color="#0e7490">Log Review</Btn>
      </>
    }>
      <ProjectSelect value={projectId} onChange={v => { setProjectId(v); setItemId(''); }} required />
      <ItemSelect value={itemId} onChange={setItemId} projectId={projectId} required />
      <div style={fieldStyle}>
        <label style={labelStyle}>Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
      </div>
    </Modal>
  );
}

// ── Modal 4: New RFI ──────────────────────────────────────────────────────────
function RFIModal({ onClose, onSave, defaultProjectId }) {
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [itemId, setItemId]       = useState('');
  const [subject, setSubject]     = useState('');
  const [date, setDate]           = useState(today());

  const canSave = projectId && itemId;

  const save = () => {
    if (!canSave) return;
    onSave({ type: 'rfi', description: subject.trim(), projectId, itemId, date });
  };

  return (
    <Modal title="+ New RFI" onClose={onClose} footer={
      <>
        <GhostBtn onClick={onClose}>Cancel</GhostBtn>
        <Btn onClick={save} disabled={!canSave} color="#dc2626">Log RFI</Btn>
      </>
    }>
      <ProjectSelect value={projectId} onChange={v => { setProjectId(v); setItemId(''); }} required />
      <ItemSelect value={itemId} onChange={setItemId} projectId={projectId} required />
      <div style={fieldStyle}>
        <label style={labelStyle}>Subject / Description</label>
        <textarea value={subject} onChange={e => setSubject(e.target.value)} rows={3} placeholder="What is the RFI about?" style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
      </div>
    </Modal>
  );
}

// ── Modal 5: Schedule Production ─────────────────────────────────────────────
function ProductionModal({ onClose, onSave, defaultProjectId }) {
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [itemId, setItemId]       = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [notes, setNotes]         = useState('');

  const canSave = projectId && itemId;

  const save = () => {
    if (!canSave) return;
    onSave({ type: 'production', description: notes.trim() || 'Schedule production', projectId, itemId, date: today(), targetDate: targetDate || null, notes: notes.trim() || null });
  };

  return (
    <Modal title="Schedule Production" onClose={onClose} footer={
      <>
        <GhostBtn onClick={onClose}>Cancel</GhostBtn>
        <Btn onClick={save} disabled={!canSave} color="#059669">Schedule</Btn>
      </>
    }>
      <ProjectSelect value={projectId} onChange={v => { setProjectId(v); setItemId(''); }} required />
      <ItemSelect value={itemId} onChange={setItemId} projectId={projectId} required />
      <div style={fieldStyle}>
        <label style={labelStyle}>Target Production Date</label>
        <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} style={inputStyle} />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Notes (optional)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Any additional notes…" style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
      </div>
    </Modal>
  );
}

// ── Modal router ──────────────────────────────────────────────────────────────
function ModalRouter({ type, onClose, onSave, defaultProjectId }) {
  const props = { onClose, onSave, defaultProjectId };
  if (type === 'todo')            return <TodoModal {...props} />;
  if (type === 'drawing-check')   return <DrawingCheckModal {...props} />;
  if (type === 'comment-review')  return <CommentReviewModal {...props} />;
  if (type === 'rfi')             return <RFIModal {...props} />;
  if (type === 'production')      return <ProductionModal {...props} />;
  return null;
}

// ── Action buttons ────────────────────────────────────────────────────────────
const ACTIONS = [
  { id: 'todo',           label: '+ New To Do',         color: '#4f46e5' },
  { id: 'rfi',            label: '+ New RFI',           color: '#dc2626' },
  { id: 'drawing-check',  label: 'Drawing Check',       color: '#7c3aed' },
  { id: 'comment-review', label: 'Comment Review',      color: '#0e7490' },
  { id: 'production',     label: 'Schedule Production', color: '#059669' },
];

// ── Queue Panel ───────────────────────────────────────────────────────────────
const PANEL_CONFIG = [
  { type: 'todo',           label: 'To Dos',          endpoint: '/api/quick-log/todo',       accentColor: '#818cf8' },
  { type: 'drawing-check',  label: 'Drawing Checks',  endpoint: '/api/quick-log/todo',       accentColor: '#a78bfa' },
  { type: 'comment-review', label: 'Comment Reviews', endpoint: '/api/quick-log/todo',       accentColor: '#22d3ee' },
  { type: 'rfi',            label: 'RFIs',            endpoint: '/api/quick-log/rfi',        accentColor: '#f87171' },
  { type: 'production',     label: 'Production',      endpoint: '/api/quick-log/production', accentColor: '#34d399' },
];

function QueuePanel({ getByType, updateItem, removeItem }) {
  const [collapsed, setCollapsed] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [errors, setErrors] = useState({});

  const totalItems = PANEL_CONFIG.reduce((n, p) => n + getByType(p.type).length, 0);
  const [panelOpen, setPanelOpen] = useState(false);

  const togglePanel = (type) => setCollapsed(prev => ({ ...prev, [type]: !prev[type] }));

  const submitPanel = async (panelCfg) => {
    const items = getByType(panelCfg.type);
    if (!items.length) return;
    setSubmitting(prev => ({ ...prev, [panelCfg.type]: true }));
    setErrors(prev => ({ ...prev, [panelCfg.type]: null }));

    let successCount = 0;
    for (const item of items) {
      try {
        const res = await fetch(panelCfg.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        if (res.ok) {
          removeItem(item.id);
          successCount++;
        } else {
          const err = await res.json().catch(() => ({}));
          setErrors(prev => ({ ...prev, [panelCfg.type]: err.error || `HTTP ${res.status}` }));
        }
      } catch (e) {
        setErrors(prev => ({ ...prev, [panelCfg.type]: e.message || 'Network error' }));
      }
    }
    setSubmitting(prev => ({ ...prev, [panelCfg.type]: false }));
  };

  const inlineSelectStyle = {
    background: C.input, border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.text, fontSize: 10, padding: '3px 4px', maxWidth: 120, cursor: 'pointer',
  };
  const inlineInputStyle = {
    background: C.input, border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.text, fontSize: 10, padding: '3px 6px', width: 64,
  };

  return (
    <div style={{ marginTop: 12 }}>
      {/* Queue accordion header */}
      <button
        onClick={() => setPanelOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', color: C.sec, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', letterSpacing: '0.06em', textTransform: 'uppercase' }}
      >
        <span style={{ color: C.muted }}>{panelOpen ? '▾' : '▸'}</span>
        Queue
        {totalItems > 0 && (
          <span style={{ background: '#1e3a5f', color: '#60a5fa', fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 999, marginLeft: 2 }}>
            {totalItems}
          </span>
        )}
      </button>

      {panelOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {PANEL_CONFIG.map(cfg => {
            const items = getByType(cfg.type);
            const isCollapsed = collapsed[cfg.type];
            const isSubmitting = submitting[cfg.type];
            const err = errors[cfg.type];

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
                    {items.length > 0 && (
                      <span style={{ fontSize: 9, background: '#1e293b', color: cfg.accentColor, padding: '1px 6px', borderRadius: 999, fontWeight: 800 }}>
                        {items.length}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {items.length > 0 && !isCollapsed && (
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
                        Submit error: {err}
                      </div>
                    )}
                    {items.length === 0 ? (
                      <div style={{ padding: '12px 14px', fontSize: 11, color: C.muted, fontStyle: 'italic' }}>No items queued</div>
                    ) : (
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
                                    <input
                                      value={item.description || ''}
                                      onChange={e => updateItem(item.id, { description: e.target.value })}
                                      style={{ ...inlineInputStyle, width: '100%', maxWidth: 200 }}
                                    />
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
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function QuickLogBar({ defaultProjectId = null }) {
  const { addItem, updateItem, removeItem, getByType } = useQueue();
  const [activeModal, setActiveModal] = useState(null);

  const handleSave = (item) => {
    addItem(item);
    setActiveModal(null);
  };

  return (
    <div style={{ marginBottom: 24, fontFamily: "'DM Mono','ui-monospace', Consolas, monospace" }}>
      {/* Action button row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {ACTIONS.map(a => (
          <button
            key={a.id}
            onClick={() => setActiveModal(a.id)}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              border: `1px solid ${a.color}60`,
              background: `${a.color}14`,
              color: a.color,
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              transition: 'background 0.12s, border-color 0.12s',
              letterSpacing: '0.01em',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = `${a.color}28`; e.currentTarget.style.borderColor = a.color; }}
            onMouseLeave={e => { e.currentTarget.style.background = `${a.color}14`; e.currentTarget.style.borderColor = `${a.color}60`; }}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Queue panel */}
      <QueuePanel getByType={getByType} updateItem={updateItem} removeItem={removeItem} />

      {/* Active modal */}
      {activeModal && (
        <ModalRouter
          type={activeModal}
          onClose={() => setActiveModal(null)}
          onSave={handleSave}
          defaultProjectId={defaultProjectId}
        />
      )}
    </div>
  );
}
