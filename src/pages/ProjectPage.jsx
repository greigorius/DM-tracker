// Project: one project's position — counts, programme, items and recent movement.
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageShell, Card, SectionLabel, Badge, SkeletonRows, cx } from '../components/ui/index.js';
import { DataTable, StatusPill } from '../components/ui/table.jsx';
import { Gantt, inWindow } from '../components/ui/Gantt.jsx';
import { useSnapshots, useBootstrap } from '../hooks/hub.js';
import { DONE_ITEM_STATUSES, isOpenAction, isOpenRfi, isOpenVc, londonToday, addDays } from '../../hub-core/derive.js';
import { fmtDate } from './TrackerPage.jsx';

const TONE_TEXT = { danger: 'text-danger', accent: 'text-accent', info: 'text-info', ok: 'text-ok' };
function Stat({ label, value, sub, tone, to }) {
  const body = (
    <>
      <div className="font-mono text-[12px] uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className={cx('figure mt-3 tabular-nums', value ? TONE_TEXT[tone] || 'text-text' : 'text-muted')}>{value}</div>
      {sub && <div className="mt-2 font-mono text-[12px] text-muted">{sub}</div>}
    </>
  );
  const cls = 'block bg-surface border border-line p-4 min-h-[124px] no-underline text-text';
  return to ? <Link to={to} className={cx(cls, 'hover:bg-surface-hi hover:border-line-strong')}>{body}</Link> : <div className={cls}>{body}</div>;
}

export default function ProjectPage() {
  const { projectId } = useParams();
  const { data: boot } = useBootstrap();
  const today = boot?.today || londonToday();
  const { data: s, isPending } = useSnapshots(['tasks', 'projects', 'clients', 'team', 'actions', 'rfis', 'variations', 'drawings', 'activity']);

  const v = useMemo(() => {
    const project = s.projects.find(p => p.id === projectId);
    const client = s.clients.find(c => c.id === project?.clientIds?.[0]);
    const items = s.tasks.filter(i => !i.archived && i.projectId === projectId);
    const ids = new Set(items.map(i => i.id));
    const mine = r => r.itemIds?.some(id => ids.has(id));
    const active = items.filter(i => !DONE_ITEM_STATUSES.has(i.status));
    const actions = s.actions.filter(a => isOpenAction(a) && mine(a));
    const team = new Map(s.team.map(t => [t.id, t.title]));
    return {
      project, client, items, active, team,
      rfis: s.rfis.filter(r => isOpenRfi(r) && mine(r)),
      vcs: s.variations.filter(x => isOpenVc(x) && mine(x)),
      actions,
      overdue: actions.filter(a => a.due && a.due < today),
      drawings: s.drawings.filter(mine),
      activity: s.activity.filter(a => mine(a) && (a.at || '').slice(0, 10) >= addDays(today, -14)).sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 40),
      itemName: id => items.find(i => i.id === id)?.title || '',
    };
  }, [s, projectId, today]);

  if (isPending) return <PageShell title="Project"><Card className="p-4"><SkeletonRows rows={10} /></Card></PageShell>;
  if (!v.project) return <PageShell title="Project"><Card className="p-4 text-[14px] text-muted">Project not found in the snapshot. Try Sync now.</Card></PageShell>;

  return (
    <PageShell title={v.project.title} subtitle={[v.client?.title, v.project.status].filter(Boolean).join(' · ')}
      toolbar={<>
        <Link to={`/programme/${projectId}`} className="min-h-11 px-3 inline-flex items-center border border-line-strong text-text-2 hover:bg-surface-hi no-underline font-mono text-[12px] uppercase tracking-[0.08em]">Programme</Link>
        <a href={v.project.url} target="_blank" rel="noreferrer" className="min-h-11 px-3 inline-flex items-center border border-line-strong text-text-2 hover:bg-surface-hi no-underline font-mono text-[12px] uppercase tracking-[0.08em]">Open in Notion ↗</a>
      </>}>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Active items" value={v.active.length} sub={`${v.items.length} in total`} />
        <Stat label="With DTs" value={v.active.filter(i => i.bic === 'DT').length} tone="info" />
        <Stat label="BIC = DM" value={v.active.filter(i => i.bic === 'DM').length + v.actions.filter(a => a.bic === 'DM').length} sub="items + actions" tone="accent" />
        <Stat label="Overdue actions" value={v.overdue.length} tone="danger" />
        <Stat label="Open RFIs" value={v.rfis.length} sub={`${v.rfis.filter(r => r.stopsWork).length} stop work`} tone="info" to="/trackers/rfis" />
        <Stat label="Open VCs" value={v.vcs.length} tone="accent" to="/trackers/variations" />
      </div>

      <Card>
        <div className="px-4 pt-4"><SectionLabel as="h2">Programme · next 6 weeks</SectionLabel></div>
        <Gantt items={v.active.filter(i => inWindow(i, today, 6, 1))} today={today} weeks={6} back={1} subOf={i => [i.status, i.dtIds.map(id => v.team.get(id)).filter(Boolean).join(', ')].filter(Boolean).join(' · ')} />
      </Card>

      <Card>
        <div className="px-4 pt-4"><SectionLabel as="h2" right={<span className="font-mono text-[12px] text-muted">{v.active.length}</span>}>Active items</SectionLabel></div>
        <DataTable rows={v.active} initialSort={{ key: 'title', dir: 'asc' }} columns={[
          { key: 'title', label: 'Item', render: r => <a href={r.url} target="_blank" rel="noreferrer" className="text-text no-underline hover:underline">{r.title}</a> },
          { key: 'status', label: 'Status', width: 160, render: r => <StatusPill status={r.status} /> },
          { key: 'bic', label: 'BIC', width: 110, cellClassName: 'font-mono text-[12px] text-text-2' },
          { key: 'dt', label: 'DT', width: 160, sortValue: r => v.team.get(r.dtIds[0]), render: r => <span className="text-text-2">{r.dtIds.map(id => v.team.get(id)).filter(Boolean).join(', ') || '—'}</span> },
          { key: 'next', label: 'Next submission', width: 140, sortValue: r => [r.dates?.sub1, r.dates?.sub2, r.dates?.constrSub].find(d => d && d >= today),
            render: r => { const n = [r.dates?.sub1, r.dates?.sub2, r.dates?.constrSub].find(d => d && d >= today); return <span className="font-mono text-[12px] text-text-2">{fmtDate(n) || '—'}</span>; } },
          { key: 'blocker', label: 'Blocker', width: 220, sortValue: r => r.blocker.join(', '), render: r => (r.blocker.length ? <span className="text-danger text-[13px]">{r.blocker.join(', ')}</span> : null) },
        ]} />
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <div className="px-4 pt-4"><SectionLabel as="h2" right={<span className="font-mono text-[12px] text-muted">{v.actions.length}</span>}>Open actions</SectionLabel></div>
          <DataTable rows={v.actions} initialSort={{ key: 'due', dir: 'asc' }} empty="No open actions." columns={[
            { key: 'title', label: 'Action', render: r => <a href={r.url} target="_blank" rel="noreferrer" className="text-text no-underline hover:underline">{r.title}</a> },
            { key: 'bic', label: 'With', width: 110, render: r => <Badge tone={r.bic === 'DM' ? 'accent' : 'muted'}>{r.bic || '—'}</Badge> },
            { key: 'due', label: 'Due', width: 110, render: r => (r.due ? <Badge tone={r.due < today ? 'danger' : 'muted'}>{fmtDate(r.due)}</Badge> : null) },
          ]} />
        </Card>
        <Card>
          <div className="px-4 pt-4"><SectionLabel as="h2" right={<span className="font-mono text-[12px] text-muted">last 14 days</span>}>Recent movement</SectionLabel></div>
          <DataTable rows={v.activity} empty="No movement in the last 14 days." columns={[
            { key: 'at', label: 'When', width: 110, render: r => <span className="font-mono text-[12px] text-text-2">{fmtDate((r.at || '').slice(0, 10))}</span> },
            { key: 'title', label: 'Entry', render: r => <a href={r.url} target="_blank" rel="noreferrer" className="text-text no-underline hover:underline">{r.title}</a> },
            { key: 'item', label: 'Item', width: 180, sortValue: r => v.itemName(r.itemIds[0]), render: r => <span className="text-text-2">{v.itemName(r.itemIds[0])}</span> },
          ]} />
        </Card>
      </div>
    </PageShell>
  );
}
