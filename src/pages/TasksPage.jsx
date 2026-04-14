import { useState, useEffect, useRef, useCallback } from 'react';
import AppNav from '../components/AppNav.jsx';
import { assignProjectColors, PROJECT_COLORS } from '../data/colors.js';
import { getCached, setCached } from '../hooks/usePageCache.js';
import {
  initColConfig, persistColConfig, mergeVisibleCols,
  exportToCSV, ColumnConfigPanel, SharedTableHead,
} from '../components/TableConfig.jsx';

const C = {
  bg: '#0a0f1a', bgCard: '#0d1525', bgPanel: '#0d1830',
  border: '#1e2d45', text: '#e2e8f0', sec: '#94a3b8',
  muted: '#7b90b0', grid: '#1a2540', input: '#0b1020',
};

const DONE_STORE  = 'dm-task-done-dates';
const SEVEN_DAYS  = 7 * 24 * 60 * 60 * 1000;
const COL_LS_KEY  = 'dmtracker:tasks-col-config';

function getDoneDates() {
  try { return JSON.parse(localStorage.getItem(DONE_STORE) || '{}'); } catch { return {}; }
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function fmtDate(str) {
  if (!str) return null;
  return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

// ── Column definitions ────────────────────────────────────────────────────────
const DEFAULT_COLUMNS = [
  { key: 'tdlId',       label: 'TDL ID',      defaultWidth: 90,  minWidth: 60,  align: 'left'   },
  { key: 'description', label: 'Description', defaultWidth: 300, minWidth: 120, align: 'left'   },
  { key: 'assignedTo',  label: 'Assigned To', defaultWidth: 130, minWidth: 80,  align: 'center' },
  { key: 'startDate',   label: 'Start Date',  defaultWidth: 90,  minWidth: 70,  align: 'center' },
  { key: 'endDate',     label: 'End Date',    defaultWidth: 90,  minWidth: 70,  align: 'center' },
  { key: 'hours',       label: 'Hours',       defaultWidth: 70,  minWidth: 50,  align: 'center' },
  { key: 'category',    label: 'Category',    defaultWidth: 130, minWidth: 60,  align: 'center' },
  { key: 'change',      label: 'Change',      defaultWidth: 70,  minWidth: 50,  align: 'center' },
  { key: 'done',        label: 'Done',        defaultWidth: 60,  minWidth: 40,  align: 'center' },
];

// ── CSV raw value getter ──────────────────────────────────────────────────────
function taskRaw(task, key) {
  switch (key) {
    case 'tdlId':       return task.tdlId ?? '';
    case 'description': return task.description ?? '';
    case 'assignedTo':  return task.assignedTo ?? '';
    case 'startDate':   return task.startDate ?? '';
    case 'endDate':     return task.endDate ?? '';
    case 'hours':       return task.subTaskHours ?? '';
    case 'category':    return task.taskCategory ?? '';
    case 'change':      return task.changeTask ? 'Yes' : '';
    case 'done':        return task.taskDone ? 'Done' : '';
    default:            return '';
  }
}

// ── Task row (Assigned table) ─────────────────────────────────────────────────
function TaskRow({ task, odd, visibleCols, onToggleDone }) {
  const [busy, setBusy] = useState(false);
  const done = task.taskDone;
  return (
    <tr style={{ background: odd ? '#0b1020' : C.bgCard, borderBottom: `1px solid ${C.grid}` }}>
      {visibleCols.map(col => {
        const isLeft = col.align === 'left';
        let content;
        switch (col.key) {
          case 'tdlId':
            content = <span style={{ fontSize: 10, color: C.muted,
              textDecoration: done ? 'line-through' : 'none' }}>{task.tdlId ?? '—'}</span>;
            break;
          case 'description':
            content = <span style={{ fontSize: 12, color: done ? C.muted : C.text, fontWeight: 500,
              textDecoration: done ? 'line-through' : 'none' }}>{task.description ?? '—'}</span>;
            break;
          case 'assignedTo':
            content = <span style={{ fontSize: 11, color: C.sec }}>{task.assignedTo ?? '—'}</span>;
            break;
          case 'startDate':
            content = <span style={{ fontSize: 11, color: task.startDate ? C.sec : C.muted }}>
              {task.startDate ? fmtDate(task.startDate) : '—'}</span>;
            break;
          case 'endDate':
            content = <span style={{ fontSize: 11, color: task.endDate ? C.sec : C.muted }}>
              {task.endDate ? fmtDate(task.endDate) : '—'}</span>;
            break;
          case 'hours':
            content = <span style={{ fontSize: 11, color: done ? C.muted : C.text }}>
              {task.subTaskHours ?? '—'}</span>;
            break;
          case 'category':
            content = task.taskCategory
              ? <span style={{ fontSize: 10, fontWeight: 700, background: '#1e2d45',
                  color: C.sec, padding: '2px 7px', borderRadius: 4 }}>{task.taskCategory}</span>
              : <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
            break;
          case 'change':
            content = task.changeTask
              ? <span style={{ fontSize: 10, color: '#818cf8', fontWeight: 700 }}>✓</span>
              : <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
            break;
          case 'done':
            content = (
              <button
                onClick={() => { if (!busy) { setBusy(true); onToggleDone(task).finally(() => setBusy(false)); } }}
                disabled={busy}
                title={done ? 'Mark not done' : 'Mark done'}
                style={{ background: 'none', border: 'none', cursor: busy ? 'wait' : 'pointer', padding: 2 }}
              >
                <div style={{ width: 14, height: 14, borderRadius: 3,
                  border: `2px solid ${done ? '#34d399' : C.border}`,
                  background: done ? '#34d399' : 'transparent',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  opacity: busy ? 0.5 : 1 }}>
                  {done && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1, fontWeight: 900 }}>✓</span>}
                </div>
              </button>
            );
            break;
          default:
            content = <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
        }
        return (
          <td key={col.key} style={{ padding: '7px 10px', textAlign: col.align,
            verticalAlign: isLeft ? 'top' : 'middle', overflow: 'hidden' }}>
            {content}
          </td>
        );
      })}
    </tr>
  );
}

// ── Unassigned task card ──────────────────────────────────────────────────────
function UnassignedTaskCard({ task, projects, allTasks, categories, onSaved }) {
  const [projectId,  setProjectId]  = useState('');
  const [itemId,     setItemId]     = useState('');
  const [category,   setCategory]   = useState(task.taskCategory ?? '');
  const [assignedTo, setAssignedTo] = useState(task.assignedTo   ?? '');
  const [hours,      setHours]      = useState(task.subTaskHours != null ? String(task.subTaskHours) : '');
  const [startDate,  setStartDate]  = useState(task.startDate    ?? '');
  const [endDate,    setEndDate]    = useState(task.endDate      ?? '');
  const [changeTask, setChangeTask] = useState(task.changeTask   ?? false);
  const [taskDone,   setTaskDone]   = useState(task.taskDone     ?? false);

  const [projectItems, setProjectItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [saveResult,   setSaveResult]   = useState(null); // 'ok' | 'error'

  // Load items when project changes
  useEffect(() => {
    if (!projectId) { setProjectItems([]); setItemId(''); return; }
    setLoadingItems(true);
    fetch(`/api/projects/${projectId}/items`)
      .then(r => r.json())
      .then(d => setProjectItems(Array.isArray(d) ? d : (d.items ?? [])))
      .catch(() => setProjectItems([]))
      .finally(() => setLoadingItems(false));
  }, [projectId]);

  // Derive assignee options from all tasks
  const assigneeOptions = [...new Set(allTasks.map(t => t.assignedTo).filter(Boolean))].sort();

  const canSave = !!projectId && !!itemId && !!assignedTo;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const body = { id: task.id };
      body.itemId      = itemId;
      body.assignedTo  = assignedTo;
      if (category)     body.taskCategory  = category;
      if (hours !== '')  body.subTaskHours  = Number(hours);
      body.changeTask  = changeTask;
      body.taskDone    = taskDone;
      if (startDate)    body.startDate     = startDate;
      if (endDate)      body.endDate       = endDate;

      const r = await fetch('/api/tasks/update', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      setSaveResult('ok');
      setCached('tasks', null);
      setTimeout(() => onSaved(task.id), 900);
    } catch {
      setSaveResult('error');
    } finally {
      setSaving(false);
    }
  };

  const inp = {
    background: C.input, border: `1px solid ${C.border}`, color: C.text,
    fontSize: 11, borderRadius: 4, padding: '4px 7px', fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box',
  };
  const lbl = {
    fontSize: 9, color: C.muted, marginBottom: 2, display: 'block',
    fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
  };

  // Non-editable populated fields to show
  const chips = [];
  if (task.tdlId)        chips.push({ label: task.tdlId,                          color: C.muted });
  if (task.assignedTo)   chips.push({ label: `👤 ${task.assignedTo}`,              color: '#60a5fa' });
  if (task.taskCategory) chips.push({ label: task.taskCategory,                   color: C.sec });
  if (task.subTaskHours) chips.push({ label: `${task.subTaskHours}h`,             color: C.sec });
  if (task.startDate)    chips.push({ label: `Start: ${fmtDate(task.startDate)}`, color: C.muted });
  if (task.endDate)      chips.push({ label: `End: ${fmtDate(task.endDate)}`,     color: C.muted });
  if (task.changeTask)   chips.push({ label: 'Change Task',                       color: '#818cf8' });

  return (
    <div style={{
      background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Description + TDL ID */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.4 }}>
          {task.description ?? '(no description)'}
        </div>
        {chips.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {chips.map((ch, i) => (
              <span key={i} style={{
                fontSize: 10, color: ch.color,
                background: hexToRgba(ch.color.startsWith('#') ? ch.color : '#94a3b8', 0.08),
                border: `1px solid ${hexToRgba(ch.color.startsWith('#') ? ch.color : '#94a3b8', 0.2)}`,
                borderRadius: 4, padding: '1px 6px',
              }}>{ch.label}</span>
            ))}
          </div>
        )}
      </div>

      {/* Editable form */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
        {/* Project */}
        <div>
          <label style={lbl}>Project</label>
          <select value={projectId} onChange={e => { setProjectId(e.target.value); setItemId(''); }}
            style={{ ...inp, width: '100%' }}>
            <option value="">— Select project —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Item */}
        <div>
          <label style={lbl}>Item</label>
          <select value={itemId} onChange={e => setItemId(e.target.value)}
            style={{ ...inp, width: '100%' }} disabled={!projectId || loadingItems}>
            <option value="">— {loadingItems ? 'Loading…' : 'Select item —'} —</option>
            {projectItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>

        {/* Category */}
        <div>
          <label style={lbl}>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            style={{ ...inp, width: '100%' }}>
            <option value="">— None —</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Assignee */}
        <div>
          <label style={lbl}>Assigned To</label>
          <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
            style={{ ...inp, width: '100%' }}>
            <option value="">— None —</option>
            {assigneeOptions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {/* Hours */}
        <div>
          <label style={lbl}>Hours</label>
          <input type="number" min="0" step="0.5" value={hours}
            onChange={e => setHours(e.target.value)}
            placeholder="0.0" style={{ ...inp, width: '100%' }} />
        </div>

        {/* Start Date */}
        <div>
          <label style={lbl}>Start Date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            style={{ ...inp, width: '100%' }} />
        </div>

        {/* End Date */}
        <div>
          <label style={lbl}>End Date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            style={{ ...inp, width: '100%' }} />
        </div>
      </div>

      {/* Checkboxes + Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {/* Change Task checkbox */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: changeTask ? '#818cf8' : C.muted }}>
          <div
            onClick={() => setChangeTask(v => !v)}
            style={{
              width: 14, height: 14, borderRadius: 3, cursor: 'pointer',
              border: `2px solid ${changeTask ? '#818cf8' : C.border}`,
              background: changeTask ? '#818cf8' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
            {changeTask && <span style={{ color: '#fff', fontSize: 9, fontWeight: 900 }}>✓</span>}
          </div>
          Change Task
        </label>

        {/* Task Done checkbox */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: taskDone ? '#34d399' : C.muted }}>
          <div
            onClick={() => setTaskDone(v => !v)}
            style={{
              width: 14, height: 14, borderRadius: 3, cursor: 'pointer',
              border: `2px solid ${taskDone ? '#34d399' : C.border}`,
              background: taskDone ? '#34d399' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
            {taskDone && <span style={{ color: '#fff', fontSize: 9, fontWeight: 900 }}>✓</span>}
          </div>
          Task Done
        </label>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Feedback / hint */}
        {!canSave && !saving && (
          <span style={{ fontSize: 10, color: C.muted, fontStyle: 'italic' }}>
            {!projectId ? 'Select a project' : !itemId ? 'Select an item' : 'Select an assignee'}
          </span>
        )}
        {saveResult === 'ok'    && <span style={{ fontSize: 11, color: '#34d399' }}>✓ Saved to Notion</span>}
        {saveResult === 'error' && <span style={{ fontSize: 11, color: '#f87171' }}>✗ Save failed — check console</span>}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          title={!canSave ? 'Fill Project, Item and Assignee first' : 'Save and move to Assigned'}
          style={{
            padding: '6px 18px', borderRadius: 5, border: 'none',
            background: canSave && !saving ? '#1d4ed8' : '#1e2d45',
            color: canSave && !saving ? '#fff' : C.muted,
            fontSize: 12, fontWeight: 700,
            cursor: canSave && !saving ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
          }}>
          {saving ? 'Saving…' : 'Save & Assign'}
        </button>
      </div>
    </div>
  );
}

// ── Filter bar styles ──────────────────────────────────────────────────────────
const selStyle = {
  background: '#0b1020', border: '1px solid #1e2d45', color: '#94a3b8',
  fontSize: 10, borderRadius: 4, padding: '3px 6px', cursor: 'pointer', fontFamily: 'inherit',
};
const btnStyle = active => ({
  background: active ? '#1e3a5f' : '#0b1020',
  border: `1px solid ${active ? '#60a5fa' : '#1e2d45'}`,
  color: active ? '#60a5fa' : '#94a3b8',
  fontSize: 10, borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
  fontWeight: active ? 700 : 400, fontFamily: 'inherit',
});

const isPCSA = n => (n ?? '').toUpperCase().includes('PCSA');

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const [tasks,            setTasks]            = useState([]);
  const [projects,         setProjects]         = useState([]);
  const [schemaCategories, setSchemaCategories] = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [refreshKey,       setRefreshKey]       = useState(0);
  const [lastRefreshed,    setLastRefreshed]    = useState(null);
  const [expanded,         setExpanded]         = useState({});
  const [showColPanel,     setShowColPanel]     = useState(false);
  const [colConfig,        setColConfig]        = useState(() => initColConfig(DEFAULT_COLUMNS, COL_LS_KEY));

  const [filterProject,    setFilterProject]    = useState('all');
  const [filterItem,       setFilterItem]       = useState('all');
  const [filterAssignee,   setFilterAssignee]   = useState('all');
  const [filterCategory,   setFilterCategory]   = useState('all');
  const [showDone,         setShowDone]         = useState(false);
  const [groupBy,          setGroupBy]          = useState('item');
  const [sortBy,           setSortBy]           = useState('tdlId');   // 'tdlId' | 'startDate'
  const [sortDir,          setSortDir]          = useState('asc');     // 'asc' | 'desc'
  const [activeTab,        setActiveTab]        = useState('assigned'); // 'assigned' | 'unassigned'

  const colConfigRef = useRef(colConfig);
  useEffect(() => { colConfigRef.current = colConfig; }, [colConfig]);

  const doneDates = useRef(getDoneDates());
  const today     = new Date();

  // Persist column config
  useEffect(() => {
    const t = setTimeout(() => persistColConfig(colConfig, COL_LS_KEY), 400);
    return () => clearTimeout(t);
  }, [colConfig]);

  // Column resize
  const startResize = useCallback((e, colKey) => {
    const startX = e.clientX;
    const def    = DEFAULT_COLUMNS.find(c => c.key === colKey);
    const minW   = def?.minWidth ?? 40;
    const startW = colConfigRef.current.find(c => c.key === colKey)?.width ?? 100;
    const onMove = me => {
      const newW = Math.max(minW, startW + (me.clientX - startX));
      setColConfig(prev => prev.map(c => c.key === colKey ? { ...c, width: newW } : c));
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // Auto-refresh timer
  useEffect(() => { const id = setInterval(() => setRefreshKey(k => k + 1), 5 * 60 * 1000); return () => clearInterval(id); }, []);

  // Load projects + categories
  useEffect(() => {
    const cp = getCached('projects');
    if (cp) { setProjects(cp); }
    else {
      fetch('/api/projects').then(r => r.json())
        .then(d => { const l = Array.isArray(d) ? d : []; setCached('projects', l); setProjects(l); })
        .catch(() => {});
    }
    const cc = getCached('task-categories');
    if (cc) { setSchemaCategories(cc); }
    else {
      fetch('/api/task-categories').then(r => r.json())
        .then(d => { const l = Array.isArray(d) ? d : []; setCached('task-categories', l); setSchemaCategories(l); })
        .catch(() => {});
    }
  }, []);

  // Load tasks
  useEffect(() => {
    const cached = getCached('tasks');
    if (cached) { setTasks(cached); setLoading(false); return; }
    setLoading(true);
    fetch('/api/tasks?showDone=true')
      .then(r => r.json())
      .then(d => { const l = Array.isArray(d) ? d : []; setCached('tasks', l); setTasks(l); setLastRefreshed(new Date()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  // Toggle Done in Notion + update local state optimistically
  const handleToggleDone = useCallback(async (task) => {
    const newDone = !task.taskDone;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, taskDone: newDone } : t));
    setCached('tasks', null);
    try {
      await fetch('/api/tasks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, taskDone: newDone }),
      });
    } catch {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, taskDone: task.taskDone } : t));
    }
  }, []);

  // Remove saved task from unassigned list (optimistic — it'll move to assigned on next refresh)
  const handleUnassignedSaved = useCallback((taskId) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setRefreshKey(k => k + 1);
  }, []);

  // Color map
  const allProjectIds = [...new Set([...projects.map(p => p.id), ...tasks.map(t => t.projectId).filter(Boolean)])];
  const colorMap      = assignProjectColors(allProjectIds.map(id => ({ id })));

  // Split into assigned / unassigned
  const assignedTasks   = tasks.filter(t => !isPCSA(t.itemName) && (t.itemId || t.projectId));
  const unassignedTasks = tasks.filter(t => !isPCSA(t.itemName) && !t.itemId && !t.projectId);

  // Filter options (from assigned tasks)
  const itemOptions     = [...new Set(assignedTasks.map(t => t.itemName).filter(Boolean))].sort();
  const assigneeOptions = [...new Set(tasks.map(t => t.assignedTo).filter(Boolean))].sort();
  const categoryOptions = [...new Set([...schemaCategories, ...tasks.map(t => t.taskCategory).filter(Boolean)])].sort();

  // Apply filters to assigned tasks
  const filtered = assignedTasks.filter(t => {
    if (filterProject  !== 'all' && t.projectId   !== filterProject)  return false;
    if (filterItem     !== 'all' && t.itemName     !== filterItem)     return false;
    if (filterAssignee !== 'all' && t.assignedTo   !== filterAssignee) return false;
    if (filterCategory !== 'all' && t.taskCategory !== filterCategory) return false;
    if (t.taskDone) {
      if (!showDone) return false;
      const doneAt = doneDates.current[t.id];
      if (doneAt && Date.now() - new Date(doneAt).getTime() > SEVEN_DAYS) return false;
    }
    return true;
  });

  // Sort assigned tasks
  const sorted = [...filtered].sort((a, b) => {
    let va, vb;
    if (sortBy === 'startDate') {
      va = a.startDate ?? '';
      vb = b.startDate ?? '';
    } else {
      va = a.tdlId ?? '';
      vb = b.tdlId ?? '';
    }
    const cmp = va.localeCompare(vb);
    return sortDir === 'desc' ? -cmp : cmp;
  });

  // Group assigned tasks
  const grouped = (() => {
    if (groupBy === 'none') {
      return [{ key: '__none__', projectId: null, tasks: sorted }];
    }
    const map = new Map();
    for (const task of sorted) {
      const key = groupBy === 'project'
        ? (projects.find(p => p.id === task.projectId)?.name ?? 'No Project')
        : (task.itemName ?? 'No Item');
      const pid = task.projectId;
      if (!map.has(key)) map.set(key, { key, projectId: pid, tasks: [] });
      map.get(key).tasks.push(task);
    }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  })();

  const visibleCols = mergeVisibleCols(colConfig, DEFAULT_COLUMNS);

  const expandAll   = () => { const s = {}; for (const g of grouped) s[g.key] = true; setExpanded(s); };
  const collapseAll = () => setExpanded({});

  const allRows      = grouped.flatMap(g => g.tasks);
  const handleExport = () => exportToCSV(visibleCols, allRows, taskRaw, `tasks-${new Date().toISOString().slice(0,10)}.csv`);

  const tabBtnStyle = active => ({
    padding: '6px 18px', borderRadius: '6px 6px 0 0', border: `1px solid ${active ? '#2d4a6e' : C.border}`,
    borderBottom: active ? `1px solid ${C.bgCard}` : `1px solid ${C.border}`,
    background: active ? C.bgCard : C.bgPanel,
    color: active ? '#93c5fd' : C.muted, fontSize: 11, fontWeight: active ? 700 : 400,
    cursor: 'pointer', fontFamily: 'inherit', marginBottom: -1,
  });

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','ui-monospace',monospace", padding: '24px 32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>TASKS</h1>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            {activeTab === 'assigned'
              ? `To-do list · ${groupBy === 'none' ? 'no grouping' : `grouped by ${groupBy}`}`
              : `${unassignedTasks.length} task${unassignedTasks.length !== 1 ? 's' : ''} without project / item`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 11, color: C.muted }}>
            {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          {lastRefreshed && <span style={{ fontSize: 10, color: C.muted }}>updated {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={() => { setCached('tasks', null); setRefreshKey(k => k + 1); }} title="Refresh"
            style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontSize: 11, padding: '3px 8px', cursor: 'pointer', lineHeight: 1, fontFamily: 'inherit' }}>↻</button>
        </div>
      </div>

      <AppNav />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 0, borderBottom: `1px solid ${C.border}`, marginTop: 8 }}>
        <button style={tabBtnStyle(activeTab === 'assigned')}   onClick={() => setActiveTab('assigned')}>
          Assigned
          {assignedTasks.length > 0 && (
            <span style={{ marginLeft: 6, fontSize: 9, background: '#1e3a5f', color: '#60a5fa', padding: '1px 5px', borderRadius: 999 }}>{assignedTasks.length}</span>
          )}
        </button>
        <button style={tabBtnStyle(activeTab === 'unassigned')} onClick={() => setActiveTab('unassigned')}>
          Unassigned
          {unassignedTasks.length > 0 && (
            <span style={{ marginLeft: 6, fontSize: 9, background: '#2d1a1a', color: '#f87171', padding: '1px 5px', borderRadius: 999 }}>{unassignedTasks.length}</span>
          )}
        </button>
      </div>

      {/* ── UNASSIGNED TAB ── */}
      {activeTab === 'unassigned' && (
        <div style={{ paddingTop: 20 }}>
          {loading && unassignedTasks.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 12 }}>Loading tasks…</div>
          ) : unassignedTasks.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 12, padding: '24px 0' }}>
              All tasks are assigned to a project / item ✓
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {unassignedTasks.map(task => (
                <UnassignedTaskCard
                  key={task.id}
                  task={task}
                  projects={projects}
                  allTasks={tasks}
                  categories={categoryOptions}
                  onSaved={handleUnassignedSaved}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ASSIGNED TAB ── */}
      {activeTab === 'assigned' && (
        <>
          {/* Filter / toolbar */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', paddingTop: 16 }}>
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

            {/* Group by */}
            <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
              style={{ ...selStyle, marginLeft: 4, borderColor: '#2d4a6e', color: '#93c5fd' }}>
              <option value="item">Group: Item</option>
              <option value="project">Group: Project</option>
              <option value="none">No Grouping</option>
            </select>

            {/* Sort */}
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd' }}>
              <option value="tdlId">Sort: TDL ID</option>
              <option value="startDate">Sort: Date</option>
            </select>
            <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd', minWidth: 32 }}
              title={sortDir === 'asc' ? 'Ascending' : 'Descending'}>
              {sortDir === 'asc' ? '↑' : '↓'}
            </button>

            <button onClick={expandAll}   style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd' }}>Expand All</button>
            <button onClick={collapseAll} style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd' }}>Collapse All</button>
            <button onClick={() => setShowColPanel(true)} style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd' }}>⚙ Columns</button>

            {/* Right side */}
            <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>
              {loading ? 'Loading…' : `${filtered.length} task${filtered.length !== 1 ? 's' : ''}`}
            </span>
            <button onClick={handleExport} title="Export current view to CSV"
              style={{ ...selStyle, borderColor: '#166534', color: '#4ade80' }}>↓ Export CSV (current view)</button>
          </div>

          {/* Content */}
          {loading && tasks.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 12 }}>Loading tasks…</div>
          ) : filtered.length === 0 && !loading ? (
            <div style={{ color: C.muted, fontSize: 12 }}>No tasks match filters</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {grouped.map(({ key, projectId, tasks: groupTasks }) => {
                const projColor  = colorMap.get(projectId) ?? PROJECT_COLORS[0];
                const isExpanded = groupBy === 'none' ? true : !!expanded[key];
                const noGrouping = groupBy === 'none';

                const table = groupTasks.length === 0 ? null : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed',
                      width: visibleCols.reduce((s, c) => s + c.width, 0) }}>
                      <SharedTableHead visibleCols={visibleCols} onResizeStart={startResize} />
                      <tbody>
                        {groupTasks.map((task, idx) => (
                          <TaskRow key={task.id} task={task} odd={idx % 2 !== 0}
                            visibleCols={visibleCols} onToggleDone={handleToggleDone} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                );

                if (noGrouping) {
                  return (
                    <div key={key} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                      {table}
                    </div>
                  );
                }

                return (
                  <div key={key} style={{
                    background: C.bgCard, border: `1px solid ${C.border}`,
                    borderLeft: `3px solid ${projColor}`, borderRadius: 10, overflow: 'hidden',
                    boxShadow: `0 2px 12px ${hexToRgba(projColor, 0.12)}`,
                  }}>
                    <div
                      onClick={() => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))}
                      style={{ padding: '9px 16px', background: C.bgPanel,
                        borderBottom: isExpanded ? `1px solid ${C.border}` : 'none',
                        display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                    >
                      <span style={{ fontSize: 11, color: C.muted, lineHeight: 1, width: 12, flexShrink: 0 }}>
                        {isExpanded ? '▾' : '▸'}
                      </span>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: projColor, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{key}</span>
                      <span style={{ fontSize: 10, color: C.muted }}>
                        {groupTasks.length} task{groupTasks.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {isExpanded && table}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {showColPanel && (
        <ColumnConfigPanel
          colConfig={colConfig}
          defaults={DEFAULT_COLUMNS}
          onClose={() => setShowColPanel(false)}
          onChange={cfg => { setColConfig(cfg); persistColConfig(cfg, COL_LS_KEY); }}
        />
      )}
    </div>
  );
}
