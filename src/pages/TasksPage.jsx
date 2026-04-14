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

// ── Column definitions ────────────────────────────────────────────────────────
const DEFAULT_COLUMNS = [
  { key: 'tdlId',       label: 'TDL ID',      defaultWidth: 90,  minWidth: 60,  align: 'left'   },
  { key: 'description', label: 'Description', defaultWidth: 300, minWidth: 120, align: 'left'   },
  { key: 'assignedTo',  label: 'Assigned To', defaultWidth: 130, minWidth: 80,  align: 'center' },
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
    case 'hours':       return task.subTaskHours ?? '';
    case 'category':    return task.taskCategory ?? '';
    case 'change':      return task.changeTask ? 'Yes' : '';
    case 'done':        return task.taskDone ? 'Done' : '';
    default:            return '';
  }
}

// ── Task row (read-only) ──────────────────────────────────────────────────────
function TaskRow({ task, odd, visibleCols }) {
  const done = task.taskDone;
  return (
    <tr style={{ background: odd ? '#0b1020' : C.bgCard, borderBottom: `1px solid ${C.grid}` }}>
      {visibleCols.map(col => {
        const isLeft = col.align === 'left';
        let content;
        switch (col.key) {
          case 'tdlId':
            content = <span style={{ fontSize: 10, color: done ? C.muted : C.muted,
              textDecoration: done ? 'line-through' : 'none' }}>{task.tdlId ?? '—'}</span>;
            break;
          case 'description':
            content = <span style={{ fontSize: 12, color: done ? C.muted : C.text, fontWeight: 500,
              textDecoration: done ? 'line-through' : 'none' }}>{task.description ?? '—'}</span>;
            break;
          case 'assignedTo':
            content = <span style={{ fontSize: 11, color: C.sec }}>{task.assignedTo ?? '—'}</span>;
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
              <div style={{ width: 14, height: 14, borderRadius: 3,
                border: `2px solid ${done ? '#34d399' : C.border}`,
                background: done ? '#34d399' : 'transparent',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {done && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1, fontWeight: 900 }}>✓</span>}
              </div>
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

// ── Filter bar style ──────────────────────────────────────────────────────────
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
  const [tasks,             setTasks]             = useState([]);
  const [projects,          setProjects]          = useState([]);
  const [schemaCategories,  setSchemaCategories]  = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [refreshKey,        setRefreshKey]        = useState(0);
  const [lastRefreshed,     setLastRefreshed]     = useState(null);
  const [expanded,          setExpanded]          = useState({});
  const [showColPanel,      setShowColPanel]      = useState(false);
  const [colConfig,         setColConfig]         = useState(() => initColConfig(DEFAULT_COLUMNS, COL_LS_KEY));

  const [filterProject,     setFilterProject]     = useState('all');
  const [filterItem,        setFilterItem]        = useState('all');
  const [filterAssignee,    setFilterAssignee]    = useState('all');
  const [filterCategory,    setFilterCategory]    = useState('all');
  const [showDone,          setShowDone]          = useState(false);
  const [groupBy,           setGroupBy]           = useState('item');

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

  useEffect(() => { const id = setInterval(() => setRefreshKey(k => k + 1), 5 * 60 * 1000); return () => clearInterval(id); }, []);

  useEffect(() => {
    const cp = getCached('projects');
    if (cp) { setProjects(cp); return; }
    fetch('/api/projects').then(r => r.json())
      .then(d => { const l = Array.isArray(d) ? d : []; setCached('projects', l); setProjects(l); })
      .catch(() => {});
    const cc = getCached('task-categories');
    if (cc) { setSchemaCategories(cc); return; }
    fetch('/api/task-categories').then(r => r.json())
      .then(d => { const l = Array.isArray(d) ? d : []; setCached('task-categories', l); setSchemaCategories(l); })
      .catch(() => {});
  }, []);

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

  // Color map
  const allProjectIds = [...new Set([...projects.map(p => p.id), ...tasks.map(t => t.projectId).filter(Boolean)])];
  const colorMap      = assignProjectColors(allProjectIds.map(id => ({ id })));

  // Filter options
  const itemOptions     = [...new Set(tasks.filter(t => !isPCSA(t.itemName)).map(t => t.itemName).filter(Boolean))].sort();
  const assigneeOptions = [...new Set(tasks.map(t => t.assignedTo).filter(Boolean))].sort();
  const categoryOptions = [...new Set([...schemaCategories, ...tasks.map(t => t.taskCategory).filter(Boolean)])].sort();

  // Apply filters
  const filtered = tasks.filter(t => {
    if (isPCSA(t.itemName)) return false;
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

  // Sort tasks by tdlId
  const sorted = [...filtered].sort((a, b) => (a.tdlId ?? '').localeCompare(b.tdlId ?? ''));

  // Group
  const grouped = (() => {
    if (groupBy === 'none') {
      return [{ key: '__none__', projectId: null, tasks: sorted }];
    }
    const map = new Map();
    for (const task of sorted) {
      const key = groupBy === 'project'
        ? (projects.find(p => p.id === task.projectId)?.name ?? 'No Project')
        : (task.itemName ?? 'No Item');
      const pid = groupBy === 'project' ? task.projectId : task.projectId;
      if (!map.has(key)) map.set(key, { key, projectId: pid, tasks: [] });
      map.get(key).tasks.push(task);
    }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  })();

  const visibleCols = mergeVisibleCols(colConfig, DEFAULT_COLUMNS);

  const expandAll   = () => { const s = {}; for (const g of grouped) s[g.key] = true; setExpanded(s); };
  const collapseAll = () => setExpanded({});

  // CSV rows: flatten all grouped tasks
  const allRows      = grouped.flatMap(g => g.tasks);
  const handleExport = () => exportToCSV(visibleCols, allRows, taskRaw, `tasks-${new Date().toISOString().slice(0,10)}.csv`);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','ui-monospace',monospace", padding: '24px 32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>TASKS</h1>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            To-do list · {groupBy === 'none' ? 'no grouping' : `grouped by ${groupBy}`}
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

      {/* Filter / toolbar */}
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

        {/* Group by */}
        <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
          style={{ ...selStyle, marginLeft: 4, borderColor: '#2d4a6e', color: '#93c5fd' }}>
          <option value="item">Group: Item</option>
          <option value="project">Group: Project</option>
          <option value="none">No Grouping</option>
        </select>

        <button onClick={expandAll}   style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd' }}>Expand All</button>
        <button onClick={collapseAll} style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd' }}>Collapse All</button>
        <button onClick={() => setShowColPanel(true)} style={{ ...selStyle, borderColor: '#2d4a6e', color: '#93c5fd' }}>⚙ Columns</button>
        <button onClick={handleExport} style={{ ...selStyle, borderColor: '#166534', color: '#4ade80' }}>↓ Export CSV</button>

        <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>
          {loading ? 'Loading…' : `${filtered.length} task${filtered.length !== 1 ? 's' : ''}`}
        </span>
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
                      <TaskRow key={task.id} task={task} odd={idx % 2 !== 0} visibleCols={visibleCols} />
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
