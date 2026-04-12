import { useState, useEffect, useRef } from 'react';
import AppNav from '../components/AppNav.jsx';
import { assignProjectColors, PROJECT_COLORS } from '../data/colors.js';
import { getCached, setCached } from '../hooks/usePageCache.js';

const C = {
  bg:      '#0a0f1a',
  bgCard:  '#0d1525',
  bgPanel: '#0d1830',
  border:  '#1e2d45',
  text:    '#e2e8f0',
  sec:     '#94a3b8',
  muted:   '#7b90b0',
  grid:    '#1a2540',
  input:   '#0b1020',
};

const DONE_STORE = 'dm-task-done-dates';
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

function getDoneDates() {
  try { return JSON.parse(localStorage.getItem(DONE_STORE) || '{}'); } catch { return {}; }
}
function setDoneDate(taskId, date) {
  const map = getDoneDates();
  if (date) map[taskId] = date;
  else delete map[taskId];
  localStorage.setItem(DONE_STORE, JSON.stringify(map));
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function TaskEditModal({ task, projects, categories, onSave, onClose }) {
  const [description,   setDescription]   = useState(task.description ?? '');
  const [subTaskHours,  setSubTaskHours]  = useState(task.subTaskHours ?? '');
  const [taskCategory,  setTaskCategory]  = useState(task.taskCategory ?? '');
  const [changeTask,    setChangeTask]    = useState(task.changeTask ?? false);
  const [taskDone,      setTaskDone]      = useState(task.taskDone ?? false);
  const [projectId,     setProjectId]     = useState(task.projectId ?? '');
  const [itemId,        setItemId]        = useState(task.itemId ?? '');
  const [items,         setItems]         = useState([]);
  const [loadingItems,  setLoadingItems]  = useState(false);
  const [saveStatus,    setSaveStatus]    = useState('saved'); // 'saved' | 'unsaved' | 'saving' | 'error'
  const [error,         setError]         = useState(null);
  const autoSaveTimer   = useRef(null);
  const latestValues    = useRef({});

  // Keep a ref to the latest field values so the debounced fn always reads fresh data
  latestValues.current = { description, subTaskHours, taskCategory, changeTask, taskDone, itemId };

  useEffect(() => {
    if (!projectId) { setItems([]); return; }
    setLoadingItems(true);
    fetch(`/api/projects/${projectId}/items`)
      .then(r => r.json())
      .then(d => setItems(d.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoadingItems(false));
  }, [projectId]);

  // Mark unsaved whenever any field changes and schedule auto-save
  const markDirty = () => {
    setSaveStatus('unsaved');
    setError(null);
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveToNotion(), 1500);
  };

  // Cleanup debounce on unmount
  useEffect(() => () => clearTimeout(autoSaveTimer.current), []);

  const saveToNotion = async (andClose = false) => {
    const v = latestValues.current;
    setSaveStatus('saving');
    setError(null);
    try {
      const res = await fetch('/api/tasks/update', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:           task.id,
          description:  (v.description ?? '').trim(),
          subTaskHours: v.subTaskHours !== '' ? Number(v.subTaskHours) : null,
          taskCategory: v.taskCategory || null,
          changeTask:   v.changeTask,
          taskDone:     v.taskDone,
          itemId:       v.itemId || null,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }

      // Track done date locally for 7-day retention
      if (v.taskDone && !task.taskDone) setDoneDate(task.id, new Date().toISOString());
      else if (!v.taskDone && task.taskDone) setDoneDate(task.id, null);

      setSaveStatus('saved');
      const updated = { ...task, description: v.description, subTaskHours: v.subTaskHours !== '' ? Number(v.subTaskHours) : null, taskCategory: v.taskCategory, changeTask: v.changeTask, taskDone: v.taskDone, projectId, itemId: v.itemId };
      onSave(updated, /* close */ andClose);
    } catch (e) {
      setSaveStatus('error');
      setError(e.message);
    }
  };

  const handleSaveAndClose = () => {
    clearTimeout(autoSaveTimer.current);
    saveToNotion(true);
  };

  // Wrapped setters that mark dirty
  const set = (setter) => (val) => { setter(val); markDirty(); };
  const setD = set(setDescription);
  const setSTH = set(setSubTaskHours);
  const setTC = set(setTaskCategory);
  const setCT = () => { setChangeTask(v => !v); markDirty(); };
  const setTD = () => { setTaskDone(v => !v); markDirty(); };
  const setItem = (v) => { setItemId(v); markDirty(); };
  const setProject = (v) => { setProjectId(v); setItemId(''); markDirty(); };

  const inputStyle = { width: '100%', background: C.input, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12, padding: '7px 10px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle = { fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5, display: 'block' };
  const F = ({ label, children }) => (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={onClose}>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, width: 540, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }} onMouseDown={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '18px 24px 14px' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{task.tdlId ?? 'Task'}</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{task.itemName ?? ''}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {{
              saving:  <span style={{ fontSize: 10, color: '#60a5fa' }}>Saving…</span>,
              unsaved: <span style={{ fontSize: 10, color: '#f59e0b' }}>Unsaved changes</span>,
              saved:   <span style={{ fontSize: 10, color: '#34d399' }}>Saved ✓</span>,
              error:   <span style={{ fontSize: 10, color: '#f87171' }}>Save failed</span>,
            }[saveStatus]}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.sec, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 2px' }}>×</button>
          </div>
        </div>

        <div style={{ padding: '0 24px 24px', fontFamily: "'DM Mono','ui-monospace',monospace" }}>

          <F label="Project">
            <select value={projectId} onChange={e => setProject(e.target.value)} style={inputStyle}>
              <option value="">— select project —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </F>

          <F label="Item">
            <select value={itemId} onChange={e => setItem(e.target.value)} style={inputStyle} disabled={!projectId || loadingItems}>
              <option value="">{!projectId ? '— select project first —' : loadingItems ? 'Loading…' : '— select item —'}</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </F>

          <F label="Item Description">
            <input value={description} onChange={e => setD(e.target.value)} style={inputStyle} />
          </F>

          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Sub Task Hours</label>
              <input type="number" min="0" step="0.5" value={subTaskHours} onChange={e => setSTH(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Task Category</label>
              <select value={taskCategory} onChange={e => setTC(e.target.value)} style={inputStyle}>
                <option value="">—</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
            {[
              { label: 'Change Task', value: changeTask, toggle: setCT, color: '#6366f1' },
              { label: 'Task Done',   value: taskDone,   toggle: setTD, color: '#34d399' },
            ].map(({ label, value, toggle, color }) => (
              <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 11, color: value ? color : C.sec, fontWeight: 700 }}>
                <div
                  onClick={toggle}
                  style={{ width: 16, height: 16, borderRadius: 3, border: `2px solid ${value ? color : C.border}`, background: value ? color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  {value && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1, fontWeight: 900 }}>✓</span>}
                </div>
                {label}
              </label>
            ))}
          </div>

          {error && (
            <div style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 14, fontSize: 11, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${C.border}`, cursor: 'pointer', background: 'transparent', color: C.sec, fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>Close</button>
            <button
              onClick={handleSaveAndClose}
              disabled={saveStatus === 'saving'}
              style={{ padding: '7px 20px', borderRadius: 6, border: 'none', cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer', background: saveStatus === 'saved' ? '#14532d' : '#6366f1', color: saveStatus === 'saved' ? '#4ade80' : '#fff', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', opacity: saveStatus === 'saving' ? 0.7 : 1, transition: 'background 0.2s, color 0.2s' }}
            >
              {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Task Row ──────────────────────────────────────────────────────────────────
function TaskRow({ task, projectColor, onClick, odd }) {
  const done = task.taskDone;
  const textStyle = done ? { textDecoration: 'line-through', color: C.muted } : {};

  return (
    <tr
      onClick={onClick}
      style={{ background: odd ? '#0b1020' : C.bgCard, borderBottom: `1px solid ${C.grid}`, cursor: 'pointer', transition: 'background 0.1s' }}
      onMouseEnter={e => { e.currentTarget.style.background = C.bgPanel; }}
      onMouseLeave={e => { e.currentTarget.style.background = odd ? '#0b1020' : C.bgCard; }}
    >
      <td style={{ padding: '7px 10px', width: 80 }}>
        <span style={{ fontSize: 10, color: C.muted, ...textStyle }}>{task.tdlId}</span>
      </td>
      <td style={{ padding: '7px 12px', maxWidth: 320 }}>
        <span style={{ fontSize: 12, color: done ? C.muted : C.text, fontWeight: 500, ...textStyle }}>
          {task.description ?? '—'}
        </span>
      </td>
      <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 11, color: C.sec, ...textStyle }}>{task.assignedTo ?? '—'}</span>
      </td>
      <td style={{ padding: '7px 12px', textAlign: 'center' }}>
        <span style={{ fontSize: 11, color: done ? C.muted : C.text, ...textStyle }}>{task.subTaskHours ?? '—'}</span>
      </td>
      <td style={{ padding: '7px 12px' }}>
        {task.taskCategory && (
          <span style={{ fontSize: 10, fontWeight: 700, background: '#1e2d45', color: C.sec, padding: '2px 7px', borderRadius: 4 }}>
            {task.taskCategory}
          </span>
        )}
      </td>
      <td style={{ padding: '7px 12px', textAlign: 'center' }}>
        {task.changeTask && <span style={{ fontSize: 10, color: '#818cf8', fontWeight: 700 }}>✓</span>}
      </td>
      <td style={{ padding: '7px 12px', textAlign: 'center' }}>
        <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${done ? '#34d399' : C.border}`, background: done ? '#34d399' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          {done && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1, fontWeight: 900 }}>✓</span>}
        </div>
      </td>
    </tr>
  );
}

// ── Column headers ─────────────────────────────────────────────────────────────
const COL_HEADERS = ['TDL ID', 'Description', 'Assigned To', 'Hours', 'Category', 'Change', 'Done'];

function TableHead() {
  return (
    <thead>
      <tr style={{ background: '#0b1020', borderBottom: `1px solid ${C.border}` }}>
        {COL_HEADERS.map(h => (
          <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
        ))}
      </tr>
    </thead>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const selStyle = { background: C.input, border: `1px solid ${C.border}`, color: C.sec, fontSize: 10, borderRadius: 4, padding: '3px 6px', cursor: 'pointer', fontFamily: 'inherit' };
const btnStyle = active => ({ background: active ? '#1e3a5f' : C.input, border: `1px solid ${active ? '#60a5fa' : C.border}`, color: active ? '#60a5fa' : C.sec, fontSize: 10, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontWeight: active ? 700 : 400, fontFamily: 'inherit' });

export default function TasksPage() {
  const [tasks,         setTasks]         = useState([]);
  const [projects,      setProjects]      = useState([]);
  const [schemaCategories, setSchemaCategories] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshKey,    setRefreshKey]    = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [editTask,      setEditTask]      = useState(null);
  const [expanded,      setExpanded]      = useState({});

  const [filterProject,  setFilterProject]  = useState('all');
  const [filterItem,     setFilterItem]     = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showDone,       setShowDone]       = useState(false);

  const today = new Date();
  const doneDates = useRef(getDoneDates());

  useEffect(() => { const id = setInterval(() => setRefreshKey(k => k + 1), 5 * 60 * 1000); return () => clearInterval(id); }, []);

  useEffect(() => {
    const cachedProjects = getCached('projects');
    if (cachedProjects) {
      setProjects(cachedProjects);
    } else {
      fetch('/api/projects')
        .then(r => r.json())
        .then(d => { const list = Array.isArray(d) ? d : []; setCached('projects', list); setProjects(list); })
        .catch(() => {});
    }
    const cachedCats = getCached('task-categories');
    if (cachedCats) {
      setSchemaCategories(cachedCats);
    } else {
      fetch('/api/task-categories')
        .then(r => r.json())
        .then(d => { const list = Array.isArray(d) ? d : []; setCached('task-categories', list); setSchemaCategories(list); })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const cached = getCached('tasks');
    if (cached) { setTasks(cached); setLoading(false); return; }
    setLoading(true);
    fetch('/api/tasks?showDone=true')
      .then(r => r.json())
      .then(d => { const list = Array.isArray(d) ? d : []; setCached('tasks', list); setTasks(list); setLastRefreshed(new Date()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  // Build color map from projects + tasks project IDs
  const allProjectIds = [...new Set([
    ...projects.map(p => p.id),
    ...tasks.map(t => t.projectId).filter(Boolean),
  ])];
  const colorMap = assignProjectColors(allProjectIds.map(id => ({ id })));

  // PCSA items are excluded globally
  const isPCSA = n => (n ?? '').toUpperCase().includes('PCSA');

  // Filter options
  const itemOptions     = [...new Set(tasks.filter(t => !isPCSA(t.itemName)).map(t => t.itemName).filter(Boolean))].sort();
  const assigneeOptions = [...new Set(tasks.map(t => t.assignedTo).filter(Boolean))].sort();
  const categoryOptions = [...new Set([...schemaCategories, ...tasks.map(t => t.taskCategory).filter(Boolean)])].sort();

  // Apply filters
  const visible = tasks.filter(t => {
    if (isPCSA(t.itemName)) return false;
    if (filterProject  !== 'all' && t.projectId   !== filterProject)  return false;
    if (filterItem     !== 'all' && t.itemName     !== filterItem)     return false;
    if (filterAssignee !== 'all' && t.assignedTo   !== filterAssignee) return false;
    if (filterCategory !== 'all' && t.taskCategory !== filterCategory) return false;

    // 7-day done retention
    if (t.taskDone) {
      if (!showDone) return false;
      const doneAt = doneDates.current[t.id];
      if (doneAt && Date.now() - new Date(doneAt).getTime() > SEVEN_DAYS) return false;
    }
    return true;
  });

  // Group by item name
  const grouped = [];
  const seen    = new Map();
  for (const task of visible) {
    const key = task.itemName ?? 'No Item';
    if (!seen.has(key)) { seen.set(key, []); grouped.push({ key, projectId: task.projectId, tasks: seen.get(key) }); }
    seen.get(key).push(task);
  }

  const handleSaved = (updated, andClose = false) => {
    doneDates.current = getDoneDates();
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    if (andClose) setEditTask(null);
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','ui-monospace',monospace", padding: '24px 32px' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>TASKS</h1>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>To-do list · grouped by item</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 11, color: C.muted }}>
            {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          {lastRefreshed && <span style={{ fontSize: 10, color: C.muted }}>updated {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={() => setRefreshKey(k => k + 1)} title="Refresh" style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontSize: 11, padding: '3px 8px', cursor: 'pointer', lineHeight: 1 }}>↻</button>
        </div>
      </div>

      <AppNav />

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={selStyle}>
          <option value="all">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterItem} onChange={e => setFilterItem(e.target.value)} style={selStyle}>
          <option value="all">All Items</option>
          {itemOptions.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={selStyle}>
          <option value="all">All Assignees</option>
          {assigneeOptions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={selStyle}>
          <option value="all">All Categories</option>
          {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button style={btnStyle(showDone)} onClick={() => setShowDone(v => !v)}>
          {showDone ? 'Showing done (7d)' : 'Hide done'}
        </button>
        <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>
          {loading ? 'Loading…' : `${visible.length} tasks`}
        </span>
      </div>

      {/* Grouped task table */}
      {loading && tasks.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 12 }}>Loading tasks…</div>
      ) : visible.length === 0 && !loading ? (
        <div style={{ color: C.muted, fontSize: 12 }}>No tasks match filters</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {grouped.map(({ key, projectId, tasks: groupTasks }) => {
            const projColor = colorMap.get(projectId) ?? PROJECT_COLORS[0];
            const isExpanded = !!expanded[key];
            return (
              <div
                key={key}
                style={{
                  background: C.bgCard,
                  border:     `1px solid ${C.border}`,
                  borderLeft: `3px solid ${projColor}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                  boxShadow: `0 2px 12px ${hexToRgba(projColor, 0.12)}`,
                }}
              >
                {/* Group header */}
                <div
                  onClick={() => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))}
                  style={{ padding: '9px 16px', background: C.bgPanel, borderBottom: isExpanded ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                >
                  <span style={{ fontSize: 11, color: C.muted, lineHeight: 1, width: 12, flexShrink: 0 }}>{isExpanded ? '▾' : '▸'}</span>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: projColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{key}</span>
                  <span style={{ fontSize: 10, color: C.muted }}>{groupTasks.length} task{groupTasks.length !== 1 ? 's' : ''}</span>
                </div>

                {/* Task table */}
                {isExpanded && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <TableHead />
                      <tbody>
                        {groupTasks.map((task, idx) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            projectColor={projColor}
                            odd={idx % 2 !== 0}
                            onClick={(e) => { e.stopPropagation(); setEditTask(task); }}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit modal */}
      {editTask && (
        <TaskEditModal
          task={editTask}
          projects={projects}
          categories={categoryOptions}
          onSave={handleSaved}
          onClose={() => setEditTask(null)}
        />
      )}
    </div>
  );
}
