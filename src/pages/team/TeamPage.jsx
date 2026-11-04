// Team — every open To Do grouped by DT or by item, with inline status edits
// and the DT summary email (preview first, then send through the webhook).
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Mail } from 'lucide-react';
import { PageShell, Badge, Card, SkeletonRows, useToast, cx } from '../../components/ui/index.js';
import { ToolbarSelect, SearchBox, ToolbarButton, ExportButton, DataTable } from '../../components/ui/table.jsx';
import { useSnapshots, useBootstrap, useUpdateRecord } from '../../hooks/hub.js';
import { londonToday, addDays } from '../../../hub-core/derive.js';
import { TODO_STATUSES, EMAIL_WINDOW_DAYS, todoStatus, isOpenTodo, isDt, isOverdue, fmtTodo } from '../../../hub-core/team.js';
import { fmtDate } from '../TrackerPage.jsx';
import { useStored } from '../brief/shared.jsx';
import { EmailPreview } from './EmailPreview.jsx';

const TONE = { 'Not Started': 'muted', 'In Progress': 'info', Blocked: 'danger', Done: 'ok' };
const ctl = 'min-h-9 px-2 bg-ground border border-line-strong text-[13px] outline-none focus:border-accent cursor-pointer';
const hrs = n => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toString() : '—');

function StatusSelect({ row }) {
  const update = useUpdateRecord('todo');
  const toast = useToast();
  const s = todoStatus(row);
  return (
    <select
      aria-label="Status"
      value={s}
      disabled={update.isPending}
      onChange={e => update.mutate({ id: row.id, set: { status: e.target.value } }, {
        onSuccess: () => toast.show(`${fmtTodo(row) || 'Task'} → ${e.target.value}`),
        onError: err => toast.show(`Not saved: ${err.message}`, { tone: 'danger', ms: 8000 }),
      })}
      className={cx(ctl, { muted: 'text-text-2', info: 'text-info', danger: 'text-danger', ok: 'text-ok' }[TONE[s]])}
    >
      {TODO_STATUSES.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Links({ row, ctx }) {
  const out = [];
  for (const id of row.rfiIds || []) { const r = ctx.rfis.get(id); if (r) out.push(<a key={id} href={r.url} target="_blank" rel="noreferrer" className="text-info no-underline hover:underline">RFI-{String(r.number ?? '?').padStart(3, '0')}</a>); }
  for (const id of row.vcIds || []) { const v = ctx.vcs.get(id); if (v) out.push(<a key={id} href={v.url} target="_blank" rel="noreferrer" className="text-info no-underline hover:underline">{v.code || 'VC'}</a>); }
  for (const id of row.actionIds || []) { const a = ctx.actions.get(id); out.push(<a key={id} href={a?.url} target="_blank" rel="noreferrer" className="text-text-2 no-underline hover:underline">Action</a>); }
  return out.length ? <span className="inline-flex flex-wrap gap-2 font-mono text-[12px] whitespace-nowrap">{out}</span> : <span className="text-muted">—</span>;
}

function Group({ title, sub, open, onToggle, badges, actions, children }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 pr-3 hover:bg-surface-hi">
        <h2 className="m-0 flex-1 min-w-[240px]">
          <button type="button" onClick={onToggle} aria-expanded={open} className="w-full min-h-12 px-4 flex items-center gap-3 bg-transparent border-0 cursor-pointer text-left text-text">
            {open ? <ChevronDown size={16} className="text-muted" aria-hidden="true" /> : <ChevronRight size={16} className="text-muted" aria-hidden="true" />}
            <span className="text-[15px] font-semibold truncate">{title}</span>
            {sub && <span className="hidden sm:inline font-mono text-[12px] text-muted truncate">{sub}</span>}
          </button>
        </h2>
        <span className="flex flex-wrap items-center gap-2">{badges}</span>
        {actions}
      </div>
      {open && <div className="border-t border-line">{children}</div>}
    </Card>
  );
}

export default function TeamPage() {
  const { data: s, isPending } = useSnapshots(['todo', 'team', 'tasks', 'projects', 'rfis', 'variations', 'actions']);
  const { data: boot } = useBootstrap();
  const today = boot?.today || londonToday();
  const windowEnd = addDays(today, EMAIL_WINDOW_DAYS);

  const [groupBy, setGroupBy] = useStored('hub.team.group', 'dt');
  const [project, setProject] = useStored('hub.team.project', 'all');
  const [dtF, setDtF] = useStored('hub.team.dt', 'all');
  const [itemF, setItemF] = useState('all');
  const [status, setStatus] = useStored('hub.team.status', 'open');
  const [range, setRange] = useStored('hub.team.range', 'window');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [q, setQ] = useState('');
  const [closed, setClosed] = useState({});
  const [preview, setPreview] = useState(null); // null | { dtIds: string[] | null }

  const ctx = useMemo(() => {
    const items = new Map(s.tasks.map(i => [i.id, i]));
    const team = new Map(s.team.map(t => [t.id, t]));
    const projects = new Map(s.projects.map(p => [p.id, p.title]));
    return {
      items, team, projects,
      rfis: new Map(s.rfis.map(r => [r.id, r])),
      vcs: new Map(s.variations.map(v => [v.id, v])),
      actions: new Map(s.actions.map(a => [a.id, a])),
      itemOf: r => items.get(r.itemIds?.[0]),
      projectOf: r => items.get(r.itemIds?.[0])?.projectId ?? null,
      personOf: r => team.get(r.personIds?.[0]),
      dts: s.team.filter(isDt).sort((a, b) => (a.title || '').localeCompare(b.title || '')),
    };
  }, [s]);

  const open = useMemo(() => s.todo.filter(isOpenTodo), [s.todo]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return open.filter(r => {
      if (project !== 'all' && ctx.projectOf(r) !== project) return false;
      if (dtF === 'none' ? r.personIds?.length : dtF !== 'all' && !r.personIds?.includes(dtF)) return false;
      if (itemF !== 'all' && r.itemIds?.[0] !== itemF) return false;
      if (status !== 'open' && todoStatus(r) !== status) return false;
      if (overdueOnly && !isOverdue(r, today)) return false;
      if (range === 'window' && !(r.end && r.end <= windowEnd)) return false;
      if (needle && ![fmtTodo(r), r.title, ctx.itemOf(r)?.title, ctx.personOf(r)?.title].filter(Boolean).join(' ').toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [open, project, dtF, itemF, status, overdueOnly, range, windowEnd, q, ctx, today]);

  const projectOptions = useMemo(() => {
    const ids = new Set(open.map(ctx.projectOf).filter(Boolean));
    return [...ids].map(id => ({ value: id, label: ctx.projects.get(id) || 'Unknown project' })).sort((a, b) => a.label.localeCompare(b.label));
  }, [open, ctx]);
  const itemOptions = useMemo(() => {
    const ids = new Set(open.filter(r => project === 'all' || ctx.projectOf(r) === project).map(r => r.itemIds?.[0]).filter(Boolean));
    return [...ids].map(id => ({ value: id, label: ctx.items.get(id)?.title || 'Unknown item' })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [open, project, ctx]);

  const groups = useMemo(() => {
    const map = new Map();
    const keyOf = groupBy === 'item' ? r => r.itemIds?.[0] || '—' : r => r.personIds?.[0] || '—';
    for (const r of rows) { const k = keyOf(r); if (!map.has(k)) map.set(k, []); map.get(k).push(r); }
    const out = [...map.entries()].map(([key, rs]) => {
      const overdue = rs.filter(r => isOverdue(r, today)).length;
      const est = rs.some(r => Number.isFinite(r.hours)) ? rs.reduce((n, r) => n + (Number.isFinite(r.hours) ? r.hours : 0), 0) : null;
      if (groupBy === 'item') {
        const item = ctx.items.get(key);
        const people = [...new Set(rs.flatMap(r => r.personIds || []))].map(id => ctx.team.get(id)?.title).filter(Boolean);
        return { key, title: item?.title || 'No item', sub: [ctx.projects.get(item?.projectId), people.join(', ')].filter(Boolean).join(' · '), rows: rs, overdue, est };
      }
      const p = ctx.team.get(key);
      return { key, person: p, title: p?.title || 'Unassigned', sub: p && p.role !== 'DT' ? p.role || 'No role' : (p?.email || (p ? 'No email' : null)), rows: rs, overdue, est };
    });
    return out.sort((a, b) => (a.key === '—') - (b.key === '—') || a.title.localeCompare(b.title, undefined, { numeric: true }));
  }, [rows, groupBy, ctx, today]);

  const columns = [
    { key: 'title', label: 'Task',
      render: r => (
        <div className="min-w-[220px]">
          <a href={r.url} target="_blank" rel="noreferrer" className="text-text no-underline hover:underline">{r.title || 'Untitled'}</a>
          <span className="ml-2 font-mono text-[11px] text-muted">{fmtTodo(r)}</span>
          {r.changeTask && <span className="ml-2"><Badge tone="info">Change</Badge></span>}
        </div>
      ), csv: r => r.title },
    groupBy === 'item'
      ? { key: 'person', label: 'DT', width: 160, sortValue: r => ctx.personOf(r)?.title || '~', render: r => <span className="text-text-2">{ctx.personOf(r)?.title || '—'}</span>, csv: r => ctx.personOf(r)?.title }
      : { key: 'item', label: 'Item', width: 220, sortValue: r => ctx.itemOf(r)?.title, render: r => <span className="text-text-2">{ctx.itemOf(r)?.title || '—'}</span>, csv: r => ctx.itemOf(r)?.title },
    { key: 'project', label: 'Project', width: 170, sortValue: r => ctx.projects.get(ctx.projectOf(r)), render: r => <span className="text-text-2">{ctx.projects.get(ctx.projectOf(r)) || '—'}</span>, csv: r => ctx.projects.get(ctx.projectOf(r)) },
    { key: 'status', label: 'Status', width: 150, sortValue: todoStatus, render: r => <StatusSelect row={r} />, csv: todoStatus },
    { key: 'end', label: 'End', width: 116, sortValue: r => r.end || '9999',
      render: r => (r.end ? <span className="whitespace-nowrap"><Badge tone={isOverdue(r, today) ? 'danger' : 'muted'}>{fmtDate(r.end)}</Badge></span> : <span className="text-muted">—</span>), csv: r => r.end },
    { key: 'hours', label: 'Est hrs', width: 80, sortValue: r => r.hours ?? -1, render: r => <span className="font-mono text-[12px] text-text-2">{hrs(r.hours)}</span>, csv: r => r.hours },
    { key: 'links', label: 'Links', width: 130, sortValue: r => (r.rfiIds?.length || 0) + (r.vcIds?.length || 0), render: r => <Links row={r} ctx={ctx} />, csv: () => '' },
  ];

  const toolbar = (
    <>
      <SearchBox value={q} onChange={setQ} />
      <ToolbarSelect label="Group by" value={groupBy} onChange={setGroupBy} options={[{ value: 'dt', label: 'Group: DT' }, { value: 'item', label: 'Group: Item' }]} />
      <ToolbarSelect label="Project" value={project} onChange={v => { setProject(v); setItemF('all'); }} options={[{ value: 'all', label: 'All projects' }, ...projectOptions]} />
      <ToolbarSelect label="DT" value={dtF} onChange={setDtF} options={[{ value: 'all', label: 'All DTs' }, ...ctx.dts.map(d => ({ value: d.id, label: d.title })), { value: 'none', label: 'Unassigned' }]} />
      <ToolbarSelect label="Item" value={itemF} onChange={setItemF} options={[{ value: 'all', label: 'All items' }, ...itemOptions]} />
      <ToolbarSelect label="Status" value={status} onChange={setStatus} options={[{ value: 'open', label: 'All open' }, ...TODO_STATUSES.filter(x => x !== 'Done')]} />
      <ToolbarSelect label="Date window" value={range} onChange={setRange} options={[{ value: 'window', label: 'Overdue + 2 wks' }, { value: 'all', label: 'All open (any date)' }]} />
      <ToolbarButton aria-pressed={overdueOnly} onClick={() => setOverdueOnly(v => !v)} className={overdueOnly ? 'border-danger text-danger' : ''}>Overdue only</ToolbarButton>
      <span className="ml-auto font-mono text-[12px] text-muted">{rows.length} shown</span>
      <ExportButton filename="team-todos.csv" columns={columns} rows={rows} />
      <ToolbarButton onClick={() => setPreview({ dtIds: null })} className="border-accent text-accent"><Mail size={14} aria-hidden="true" /> Preview &amp; send all</ToolbarButton>
    </>
  );

  const undatedOpen = open.filter(r => !r.end).length;

  return (
    <PageShell title="Team" subtitle="Open to-dos and who they sit with" toolbar={toolbar}>
      {range === 'window' && undatedOpen > 0 && (
        <p className="m-0 font-mono text-[12px] text-muted">
          {undatedOpen} open to-do{undatedOpen === 1 ? ' has' : 's have'} no end date and {undatedOpen === 1 ? 'is' : 'are'} hidden here and left out of emails — switch to “All open”, or fix them in Triage → Team.
        </p>
      )}
      {isPending ? <Card className="p-4"><SkeletonRows rows={10} /></Card>
        : groups.length === 0 ? <Card className="p-4 text-[14px] text-muted">Nothing matches these filters.</Card>
        : groups.map(g => {
          const isOpenG = !closed[g.key];
          const cap = g.person?.capacity;
          return (
            <Group
              key={g.key}
              title={g.title}
              sub={g.sub}
              open={isOpenG}
              onToggle={() => setClosed(c => ({ ...c, [g.key]: !c[g.key] }))}
              badges={<>
                <Badge tone="accent">{g.rows.length} open</Badge>
                {g.overdue > 0 && <Badge tone="danger">{g.overdue} overdue</Badge>}
                {groupBy === 'dt' && g.person && <Badge tone="muted">{hrs(g.est)} h{Number.isFinite(cap) ? ` / ${cap} h wk` : ''}</Badge>}
              </>}
              actions={groupBy === 'dt' && g.person && isDt(g.person) && (
                <ToolbarButton onClick={() => setPreview({ dtIds: [g.key] })} className="min-h-9"><Mail size={13} aria-hidden="true" /> Preview &amp; send</ToolbarButton>
              )}
            >
              <DataTable columns={columns} rows={g.rows} initialSort={{ key: 'end', dir: 'asc' }} />
            </Group>
          );
        })}
      {preview && <EmailPreview dtIds={preview.dtIds} onClose={() => setPreview(null)} />}
    </PageShell>
  );
}
