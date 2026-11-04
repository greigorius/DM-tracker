// Drawings: the Master Drawing Schedule, with each issue's submit date and grade.
import { TrackerPage, fmtDate } from './TrackerPage.jsx';
import { StatusPill } from '../components/ui/table.jsx';
import { Badge } from '../components/ui/index.js';

const TONE = {
  'First Issue': 'info', 'DT Review': 'muted', 'DM Review': 'accent', 'Client Review': 'accent', 'Approval Updates': 'info',
  'Production Updates': 'info', 'As Built Updates': 'info', 'On Hold': 'danger', 'With Supplier': 'muted', Complete: 'ok',
  Schedule: 'accent', 'In Production': 'ok',
};
const OPEN = { has: s => s !== 'Complete' };
const gradeTone = g => (g === 'A' || g === 'Approved' ? 'ok' : g === 'B' ? 'accent' : g === 'C' || g === 'Rejected' ? 'danger' : 'muted');
const stage = (submitted, grade, gradeDate) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
    <span className="font-mono text-[12px] text-text-2">{fmtDate(submitted) || '—'}</span>
    {grade && <Badge tone={gradeTone(grade)} title={gradeDate ? `Graded ${fmtDate(gradeDate)}` : undefined}>{grade}</Badge>}
  </span>
);

const columns = ctx => [
  { key: 'title', label: 'Dwg no', width: 200, render: r => <a href={r.url} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-info no-underline hover:underline whitespace-nowrap">{r.title || '—'}</a> },
  { key: 'name', label: 'Title', render: r => <span className="min-w-[200px] inline-block">{r.name || '—'}</span> },
  { key: 'status', label: 'Status', width: 160, render: r => <StatusPill status={r.status} tone={TONE[r.status]} /> },
  { key: 'stage', label: 'Stage', width: 120, sortValue: r => r.stage, render: r => <span className="font-mono text-[12px] text-text-2">{r.stage?.split(' - ')[0] || '—'}</span> },
  { key: 'rev', label: 'Rev', width: 70, cellClassName: 'font-mono text-[12px] text-text-2' },
  { key: 'type', label: 'Type', width: 100, cellClassName: 'text-text-2' },
  { key: 's4', label: 'S4', width: 150, sortValue: r => r.s4.submitted, render: r => stage(r.s4.submitted, r.s4.status, r.s4.statusDate), csv: r => [r.s4.submitted, r.s4.status].filter(Boolean).join(' ') },
  { key: 's5', label: 'S5', width: 150, sortValue: r => r.s5.submitted, render: r => stage(r.s5.submitted, r.s5.status, r.s5.statusDate), csv: r => [r.s5.submitted, r.s5.status].filter(Boolean).join(' ') },
  { key: 'c01', label: 'C01 / A4.5', width: 150, sortValue: r => r.c01.submitted, render: r => stage(r.c01.submitted, r.c01.signOff && 'Signed', r.c01.signOff), csv: r => [r.c01.submitted, r.c01.signOff && `signed ${r.c01.signOff}`].filter(Boolean).join(' ') },
  { key: 'prd', label: 'PRD', width: 130, sortValue: r => r.prd.scheduled, render: r => stage(r.prd.scheduled, r.prd.status, r.prd.statusDate), csv: r => [r.prd.scheduled, r.prd.status].filter(Boolean).join(' ') },
  { key: 'item', label: 'Item', width: 200, sortValue: r => ctx.itemOf(r)?.title, render: r => <span className="text-text-2">{ctx.itemOf(r)?.title || '—'}</span>, csv: r => ctx.itemOf(r)?.title },
  { key: 'project', label: 'Project', width: 170, sortValue: r => ctx.projects.get(ctx.projectOf(r)), render: r => <span className="text-text-2">{ctx.projects.get(ctx.projectOf(r)) || '—'}</span>, csv: r => ctx.projects.get(ctx.projectOf(r)) },
];

const GROUPINGS = [
  { value: 'item', label: 'Group: Item', key: r => r.itemIds?.[0] ?? null, name: (k, ctx) => ctx.items.get(k)?.title || 'No item', meta: (k, ctx) => ctx.projects.get(ctx.items.get(k)?.projectId) },
  { value: 'project', label: 'Group: Project', key: (r, ctx) => ctx.projectOf(r), name: (k, ctx) => ctx.projects.get(k) || 'No project' },
  { value: 'status', label: 'Group: Status', key: r => r.status, name: k => k || 'No status' },
  { value: 'type', label: 'Group: Type', key: r => r.type, name: k => k || 'No type' },
];

export default function DrawingsPage() {
  return (
    <TrackerPage
      id="drawings"
      title="Drawings"
      subtitle="Master Drawing Schedule"
      db="drawings"
      statusOf={r => r.status}
      statusTone={s => TONE[s] || 'muted'}
      openStatuses={OPEN}
      openLabel="Not complete"
      columns={columns}
      groupings={GROUPINGS}
      searchText={(r, ctx) => [r.title, r.name, r.status, r.rev, ctx.itemOf(r)?.title].filter(Boolean).join(' ')}
      initialSort={{ key: 'title', dir: 'asc' }}
      filename="drawings.csv"
    />
  );
}
