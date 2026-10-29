// Tasks — the To Do List DB, grouped by project, person, item, status or design stage.
import { TrackerPage, fmtDate } from './TrackerPage.jsx';
import { StatusPill } from '../components/ui/table.jsx';
import { Badge } from '../components/ui/index.js';
import { londonToday } from '../../hub-core/derive.js';

const today = londonToday();
const statusOf = r => (r.done || r.status === 'Done' ? 'Done' : r.status || 'Not started');
const TONE = { 'Not started': 'muted', 'In progress': 'accent', Done: 'ok' };
const OPEN = new Set(['Not started', 'In progress']);
const isOpen = r => statusOf(r) !== 'Done';
const num = r => (r.number != null ? `TD-${String(r.number).padStart(3, '0')}` : '—');
const people = (r, ctx) => (r.personIds || []).map(id => ctx.team.get(id)).filter(Boolean).join(', ');

const groupings = [
  { value: 'project', label: 'Group: Project', key: (r, ctx) => ctx.projectOf(r), name: (k, ctx) => ctx.projects.get(k) || 'No project' },
  { value: 'person', label: 'Group: Person', key: r => r.personIds?.[0] ?? null, name: (k, ctx) => ctx.team.get(k) || 'Unassigned' },
  { value: 'item', label: 'Group: Item', key: r => r.itemIds?.[0] ?? null, name: (k, ctx) => ctx.items.get(k)?.title || 'No item',
    meta: (k, ctx) => ctx.projects.get(ctx.items.get(k)?.projectId) },
  { value: 'status', label: 'Group: Open / closed', key: r => (isOpen(r) ? 'open' : 'closed'), name: k => (k === 'open' ? 'Open' : 'Closed') },
  { value: 'stage', label: 'Group: Design stage', key: r => r.designStage || null, name: k => k || 'No stage' },
  { value: 'none', label: 'No grouping', key: () => 'all', name: () => 'All tasks' },
];

const columns = ctx => [
  { key: 'number', label: 'ID', width: 90, sortValue: r => r.number ?? -1,
    render: r => <span className="font-mono text-[12px] text-muted whitespace-nowrap">{num(r)}</span>, csv: num },
  { key: 'title', label: 'Task',
    render: r => (
      <div className="min-w-[240px]">
        <a href={r.url} target="_blank" rel="noreferrer" className="text-text no-underline hover:underline">{r.title || 'Untitled'}</a>
        {r.changeTask && <span className="ml-2"><Badge tone="info">Change</Badge></span>}
      </div>
    ), csv: r => r.title },
  { key: 'status', label: 'Status', width: 120, sortValue: statusOf, render: r => <StatusPill status={statusOf(r)} tone={TONE[statusOf(r)]} />, csv: statusOf },
  { key: 'person', label: 'Person', width: 160, sortValue: r => people(r, ctx) || '~',
    render: r => <span className="text-text-2">{people(r, ctx) || '—'}</span>, csv: r => people(r, ctx) },
  { key: 'item', label: 'Item', width: 220, sortValue: r => ctx.itemOf(r)?.title,
    render: r => <span className="text-text-2">{ctx.itemOf(r)?.title || '—'}</span>, csv: r => ctx.itemOf(r)?.title },
  { key: 'start', label: 'Start', width: 100, render: r => <span className="font-mono text-[12px] text-text-2 whitespace-nowrap">{fmtDate(r.start) || '—'}</span> },
  { key: 'end', label: 'End', width: 116,
    render: r => (r.end ? <span className="whitespace-nowrap"><Badge tone={isOpen(r) && r.end < today ? 'danger' : 'muted'}>{fmtDate(r.end)}</Badge></span> : <span className="text-muted">—</span>) },
  { key: 'hours', label: 'Est hrs', width: 80, render: r => <span className="font-mono text-[12px] text-text-2">{r.hours ?? '—'}</span> },
  { key: 'designStage', label: 'Stage', width: 150, cellClassName: 'text-text-2 whitespace-nowrap' },
  { key: 'project', label: 'Project', width: 180, sortValue: r => ctx.projects.get(ctx.projectOf(r)),
    render: r => <span className="text-text-2">{ctx.projects.get(ctx.projectOf(r)) || '—'}</span>, csv: r => ctx.projects.get(ctx.projectOf(r)) },
];

const searchText = (r, ctx) => [num(r), r.title, people(r, ctx), ctx.itemOf(r)?.title, r.designStage].filter(Boolean).join(' ');

export default function TasksPage() {
  return (
    <TrackerPage
      id="tasks"
      title="Tasks"
      subtitle="To Do list by project, person and item"
      db="todo"
      statusOf={statusOf}
      statusTone={s => TONE[s] || 'muted'}
      openStatuses={OPEN}
      columns={columns}
      searchText={searchText}
      initialSort={{ key: 'end', dir: 'asc' }}
      filename="tasks.csv"
      groupings={groupings}
      defaultGroup="project"
    />
  );
}
