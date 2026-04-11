import { useState, useEffect } from 'react';
import { useQueue } from '../hooks/useQueue.js';
import { PHASE_ORDER } from '../data/mockData.js';

const C = {
  bg:     '#0a0f1a',
  card:   '#0d1525',
  panel:  '#0d1830',
  border: '#1e2d45',
  text:   '#e2e8f0',
  sec:    '#94a3b8',
  muted:  '#7b90b0',
  input:  '#0b1020',
};

const TABS = [
  { id: 'todo',           label: 'To Do',         color: '#6366f1', endpoint: '/api/quick-log/todo'       },
  { id: 'rfi',            label: 'RFI',           color: '#dc2626', endpoint: '/api/quick-log/rfi'        },
  { id: 'drawing-check',  label: 'Drawing Check', color: '#7c3aed', endpoint: '/api/quick-log/todo'       },
  { id: 'comment-review', label: 'Comment Review',color: '#0e7490', endpoint: '/api/quick-log/todo'       },
  { id: 'production',     label: 'Production',    color: '#059669', endpoint: '/api/quick-log/production' },
];

const today = () => new Date().toISOString().slice(0, 10);

const inputStyle = {
  width: '100%', background: C.input, border: `1px solid ${C.border}`,
  borderRadius: 6, color: C.text, fontSize: 12, padding: '7px 10px',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};
const labelStyle = {
  fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.06em',
  textTransform: 'uppercase', marginBottom: 5, display: 'block',
};
const fieldStyle = { marginBottom: 14 };

function Field({ label, required, children }) {
  return (
    <div style={fieldStyle}>
      <label style={labelStyle}>{label}{required && <span style={{ color: '#f87171', marginLeft: 3 }}>*</span>}</label>
      {children}
    </div>
  );
}

export default function QuickEntryModal({ onClose }) {
  const { addItem } = useQueue();

  const [activeTab,  setActiveTab]  = useState('todo');
  const [projects,   setProjects]   = useState([]);
  const [items,      setItems]      = useState([]);
  const [loadingProj, setLoadingProj] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);

  // Form fields
  const [projectId,   setProjectId]   = useState('');
  const [itemId,      setItemId]      = useState('');
  const [description, setDescription] = useState('');
  const [assignee,    setAssignee]    = useState('');
  const [dmPhase,     setDmPhase]     = useState('');
  const [date,        setDate]        = useState(today());
  const [targetDate,  setTargetDate]  = useState('');
  const [notes,       setNotes]       = useState('');

  const [saving,  setSaving]  = useState(false);
  const [result,  setResult]  = useState(null); // { success, message }

  // Fetch project list on mount
  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : (d.projects ?? []);
        setProjects(list.filter(p => p.status !== 'Complete' && p.status !== 'Done'));
      })
      .catch(() => {})
      .finally(() => setLoadingProj(false));
  }, []);

  // Fetch items when project changes
  useEffect(() => {
    if (!projectId) { setItems([]); return; }
    setLoadingItems(true);
    setItemId('');
    fetch(`/api/projects/${projectId}/items`)
      .then(r => r.json())
      .then(d => setItems(d.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoadingItems(false));
  }, [projectId]);

  // Reset item when tab changes
  const switchTab = (id) => {
    setActiveTab(id);
    setResult(null);
    // Set sensible description defaults
    if (id === 'drawing-check') setDescription('Check drawing');
    else if (id === 'comment-review') setDescription('Review comments');
    else setDescription('');
  };

  const tab = TABS.find(t => t.id === activeTab);

  const needsProject = activeTab !== 'todo';
  const needsItem    = activeTab !== 'todo';

  const isValid = () => {
    if (activeTab === 'todo') return description.trim().length > 0;
    return projectId && itemId;
  };

  const buildPayload = () => {
    const base = { type: activeTab, date: date || today() };
    if (projectId) base.projectId = projectId;
    if (itemId)    base.itemId    = itemId;

    switch (activeTab) {
      case 'todo':
        return { ...base, description: description.trim(), assignee: assignee || null, dmPhase: dmPhase || null };
      case 'rfi':
        return { ...base, description: description.trim() || 'RFI' };
      case 'drawing-check':
        return { ...base, description: description.trim() || 'Check drawing' };
      case 'comment-review':
        return { ...base, description: description.trim() || 'Review comments' };
      case 'production':
        return { ...base, description: notes.trim() || 'Schedule production', targetDate: targetDate || null, notes: notes.trim() || null };
      default:
        return base;
    }
  };

  const handleSave = async () => {
    if (!isValid()) return;
    setSaving(true);
    setResult(null);

    const payload = buildPayload();

    // Add to local queue immediately for display
    addItem(payload);

    // Post to Notion
    try {
      const res = await fetch(tab.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setResult({ success: true, message: 'Saved to Notion' });
        // Reset form
        setDescription(''); setAssignee(''); setDmPhase('');
        setTargetDate(''); setNotes(''); setItemId('');
      } else {
        const err = await res.json().catch(() => ({}));
        setResult({ success: false, message: err.error || `HTTP ${res.status} — queued locally` });
      }
    } catch (e) {
      setResult({ success: false, message: (e.message || 'Network error') + ' — queued locally' });
    }

    setSaving(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, width: 560, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px 0', marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Quick Entry</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.sec, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 2px' }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, padding: '0 24px', borderBottom: `1px solid ${C.border}`, marginBottom: 20 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              style={{
                padding: '8px 14px',
                border: 'none',
                borderBottom: activeTab === t.id ? `2px solid ${t.color}` : '2px solid transparent',
                background: 'transparent',
                color: activeTab === t.id ? t.color : C.muted,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                transition: 'color 0.12s',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Form */}
        <div style={{ padding: '0 24px 24px', fontFamily: "'DM Mono','ui-monospace',monospace" }}>

          {/* Description / Subject — all tabs except production use it */}
          {activeTab !== 'production' && (
            <Field label={activeTab === 'rfi' ? 'Subject / Description' : 'Description'} required={activeTab === 'todo'}>
              {activeTab === 'todo' ? (
                <textarea
                  autoFocus
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What needs doing?"
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                />
              ) : (
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  style={inputStyle}
                />
              )}
            </Field>
          )}

          {/* Project */}
          <Field label="Project" required={needsProject}>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              style={inputStyle}
              disabled={loadingProj}
            >
              <option value="">{loadingProj ? 'Loading…' : '— select project —'}</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>

          {/* Item */}
          <Field label="Item" required={needsItem}>
            <select
              value={itemId}
              onChange={e => setItemId(e.target.value)}
              style={inputStyle}
              disabled={!projectId || loadingItems}
            >
              <option value="">{
                !projectId       ? '— select project first —' :
                loadingItems     ? 'Loading items…' :
                items.length === 0 ? 'No items found' :
                '— select item —'
              }</option>
              {items.map(i => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </Field>

          {/* Tab-specific extra fields */}
          {activeTab === 'todo' && (
            <div style={{ display: 'flex', gap: 12 }}>
              <Field label="Assignee" style={{ flex: 1 }}>
                <input value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="e.g. JD" style={inputStyle} />
              </Field>
              <Field label="DM Phase" style={{ flex: 1 }}>
                <select value={dmPhase} onChange={e => setDmPhase(e.target.value)} style={inputStyle}>
                  <option value="">—</option>
                  {PHASE_ORDER.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            </div>
          )}

          {(activeTab === 'drawing-check' || activeTab === 'comment-review') && (
            <Field label="Date">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </Field>
          )}

          {activeTab === 'production' && (
            <>
              <Field label="Target Production Date">
                <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Notes">
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Any additional notes…" style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
              </Field>
            </>
          )}

          {/* Result message */}
          {result && (
            <div style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 14, fontSize: 11, background: result.success ? 'rgba(74,222,128,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${result.success ? 'rgba(74,222,128,0.25)' : 'rgba(239,68,68,0.25)'}`, color: result.success ? '#4ade80' : '#f87171' }}>
              {result.message}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 10, color: C.muted }}>⌘/Ctrl+Enter to save</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={onClose}
                style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${C.border}`, cursor: 'pointer', background: 'transparent', color: C.sec, fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}
              >
                Close
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !isValid()}
                style={{ padding: '7px 18px', borderRadius: 6, border: 'none', cursor: saving || !isValid() ? 'not-allowed' : 'pointer', background: isValid() ? tab.color : '#1e293b', color: isValid() ? '#fff' : C.muted, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', opacity: saving ? 0.7 : 1, transition: 'opacity 0.1s' }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
