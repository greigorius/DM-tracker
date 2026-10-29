import { TrackerPage, fmtDate } from './TrackerPage.jsx';
import { StatusPill } from '../components/ui/table.jsx';
import { Badge } from '../components/ui/index.js';

const OPEN = new Set(['Awaiting Design Info', 'Awaiting Instruction', null, undefined, '']);
const TONE = { 'Awaiting Design Info': 'accent', 'Awaiting Instruction': 'accent', 'Instruction Received': 'ok', Declined: 'danger', Withdrawn: 'muted' };

const columns = ctx => [
  { key: 'number', label: 'VC', width: 104, sortValue: r => r.number,
    render: r => <a href={r.url} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-accent no-underline hover:underline whitespace-nowrap">{r.code || 'VC'}</a>, csv: r => r.code },
  { key: 'title', label: 'Description', render: r => <div className="min-w-[240px]">{r.title || '—'}</div> },
  { key: 'status', label: 'Status', width: 190, render: r => <StatusPill status={r.status || 'No status'} tone={TONE[r.status] || 'muted'} /> },
  { key: 'type', label: 'Type', width: 180, cellClassName: 'text-text-2' },
  { key: 'raisedBy', label: 'Raised by', width: 120, cellClassName: 'text-text-2' },
  { key: 'tbcBy', label: 'TBC by', width: 180, render: r => <span className="text-text-2">{r.tbcBy?.join(', ') || '—'}</span> },
  { key: 'instructed', label: 'Instructed', width: 110, sortValue: r => (r.instructed ? 1 : 0),
    render: r => (r.instructed ? <Badge tone="ok">Yes</Badge> : null), csv: r => (r.instructed ? 'Yes' : '') },
  { key: 'requested', label: 'Requested', width: 116, render: r => <span className="font-mono text-[12px] text-text-2 whitespace-nowrap">{fmtDate(r.requested) || '—'}</span> },
  { key: 'decision', label: 'Decision', width: 116, render: r => <span className="font-mono text-[12px] text-text-2 whitespace-nowrap">{fmtDate(r.decision) || '—'}</span> },
  { key: 'item', label: 'Item', width: 220, sortValue: r => ctx.itemOf(r)?.title,
    render: r => <span className="text-text-2">{ctx.itemOf(r)?.title || '—'}</span>, csv: r => ctx.itemOf(r)?.title },
  { key: 'project', label: 'Project', width: 180, sortValue: r => ctx.projects.get(ctx.projectOf(r)),
    render: r => <span className="text-text-2">{ctx.projects.get(ctx.projectOf(r)) || '—'}</span>, csv: r => ctx.projects.get(ctx.projectOf(r)) },
];

const searchText = (r, ctx) => [r.code, r.title, r.type, r.raisedBy, ...(r.tbcBy || []), ctx.itemOf(r)?.title].filter(Boolean).join(' ');

export default function VariationsPage() {
  return (
    <TrackerPage
      id="variations"
      title="Variations"
      subtitle="Design and scope changes"
      db="variations"
      statusOf={r => r.status || null}
      statusTone={s => TONE[s] || 'muted'}
      openStatuses={OPEN}
      columns={columns}
      searchText={searchText}
      initialSort={{ key: 'number', dir: 'desc' }}
      filename="variations.csv"
    />
  );
}
