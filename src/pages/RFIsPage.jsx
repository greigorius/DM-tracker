import { TrackerPage, fmtDate } from './TrackerPage.jsx';
import { StatusPill } from '../components/ui/table.jsx';
import { Badge } from '../components/ui/index.js';
import { OPEN_RFI_STATUSES, londonToday } from '../../hub-core/derive.js';

const TONE = { Raise: 'accent', Open: 'accent', 'Close Out': 'info', Closed: 'ok' };
const today = londonToday();
const num = r => `RFI-${String(r.number ?? '?').padStart(3, '0')}`;

const columns = ctx => [
  { key: 'number', label: 'RFI', width: 96, sortValue: r => r.number,
    render: r => <a href={r.url} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-info no-underline hover:underline whitespace-nowrap">{num(r)}</a>, csv: num },
  { key: 'title', label: 'Description',
    render: r => (
      <div className="min-w-[240px]">
        <div>{r.title || '—'}</div>
        {r.question && r.question !== r.title && <div className="mt-0.5 text-[12px] text-muted line-clamp-2">{r.question}</div>}
      </div>
    ) },
  { key: 'status', label: 'Status', width: 120, render: r => <StatusPill status={r.status} tone={TONE[r.status]} /> },
  { key: 'tbcBy', label: 'TBC by', width: 170, cellClassName: 'text-text-2 whitespace-nowrap' },
  { key: 'bic', label: 'BIC', width: 110, cellClassName: 'font-mono text-[12px] text-text-2' },
  { key: 'raised', label: 'Raised', width: 110, render: r => <span className="font-mono text-[12px] text-text-2 whitespace-nowrap">{fmtDate(r.raised) || '—'}</span> },
  { key: 'due', label: 'Due', width: 110,
    render: r => (r.due ? <Badge tone={OPEN_RFI_STATUSES.has(r.status) && r.due < today ? 'danger' : 'muted'}>{fmtDate(r.due)}</Badge> : <span className="text-muted">—</span>) },
  { key: 'stopsWork', label: 'Stops work', width: 110, sortValue: r => (r.stopsWork ? 1 : 0),
    render: r => (r.stopsWork ? <Badge tone="danger">Stops work</Badge> : null), csv: r => (r.stopsWork ? 'Yes' : '') },
  { key: 'item', label: 'Item', width: 220, sortValue: r => ctx.itemOf(r)?.title,
    render: r => <span className="text-text-2">{ctx.itemOf(r)?.title || '—'}</span>, csv: r => ctx.itemOf(r)?.title },
  { key: 'project', label: 'Project', width: 180, sortValue: r => ctx.projects.get(ctx.projectOf(r)),
    render: r => <span className="text-text-2">{ctx.projects.get(ctx.projectOf(r)) || '—'}</span>, csv: r => ctx.projects.get(ctx.projectOf(r)) },
];

const searchText = (r, ctx) => [num(r), r.title, r.question, r.tbcBy, ctx.itemOf(r)?.title].filter(Boolean).join(' ');

export default function RFIsPage() {
  return (
    <TrackerPage
      id="rfis"
      title="RFIs"
      subtitle="Requests for information"
      db="rfis"
      statusOf={r => r.status}
      statusTone={s => TONE[s] || 'muted'}
      openStatuses={OPEN_RFI_STATUSES}
      columns={columns}
      searchText={searchText}
      initialSort={{ key: 'number', dir: 'desc' }}
      filename="rfis.csv"
    />
  );
}
