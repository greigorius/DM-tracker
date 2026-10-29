// Timeline: programme strip for active items, by project.
import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageShell, Card, SkeletonRows, SectionLabel } from '../components/ui/index.js';
import { ToolbarSelect } from '../components/ui/table.jsx';
import { Gantt, inWindow } from '../components/ui/Gantt.jsx';
import { useSnapshots, useBootstrap } from '../hooks/hub.js';
import { DONE_ITEM_STATUSES, londonToday } from '../../hub-core/derive.js';

const RANGES = [{ value: '6', label: '6 weeks' }, { value: '12', label: '12 weeks' }, { value: '26', label: '6 months' }];

export default function TimelinePage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const { data: boot } = useBootstrap();
  const today = boot?.today || londonToday();
  const { data, isPending } = useSnapshots(['tasks', 'projects', 'team']);
  const [weeks, setWeeks] = useState('12');
  const projects = useMemo(() => new Map(data.projects.map(p => [p.id, p.title])), [data.projects]);
  const team = useMemo(() => new Map(data.team.map(t => [t.id, t.title])), [data.team]);
  const w = Number(weeks);

  const groups = useMemo(() => {
    const active = data.tasks.filter(i => !i.archived && !DONE_ITEM_STATUSES.has(i.status) && (!projectId || i.projectId === projectId) && inWindow(i, today, w));
    const by = new Map();
    for (const i of active) { if (!by.has(i.projectId)) by.set(i.projectId, []); by.get(i.projectId).push(i); }
    return [...by].map(([pid, items]) => ({ pid, name: projects.get(pid) || 'No project', items: items.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true })) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.tasks, projectId, today, w, projects]);

  const projectOptions = [{ value: '', label: 'All projects' }, ...[...projects].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))];

  return (
    <PageShell
      title="Timeline"
      subtitle={projectId ? projects.get(projectId) : 'Programme for active items'}
      toolbar={<>
        <ToolbarSelect label="Project" value={projectId} onChange={v => navigate(v ? `/timeline/${v}` : '/timeline')} options={projectOptions} />
        <ToolbarSelect label="Range" value={weeks} onChange={setWeeks} options={RANGES} />
        <span className="ml-auto font-mono text-[12px] text-muted">Dates are set in the Scheduling Tool</span>
      </>}
    >
      {isPending ? <Card className="p-4"><SkeletonRows rows={8} /></Card> : groups.length === 0 ? (
        <Card className="p-4 text-[14px] text-muted">No active items with programme dates in this window.</Card>
      ) : groups.map(g => (
        <Card key={g.pid || 'none'} aria-label={g.name}>
          <div className="px-4 pt-4"><SectionLabel as="h2" right={<span className="font-mono text-[12px] text-muted">{g.items.length} items</span>}>{g.name}</SectionLabel></div>
          <Gantt items={g.items} today={today} weeks={w} subOf={i => [i.status, i.dtIds.map(id => team.get(id)).filter(Boolean).join(', ')].filter(Boolean).join(' · ')} />
        </Card>
      ))}
    </PageShell>
  );
}
