import { RegisterPage } from './registers/RegisterPage.jsx';
import { commonFields } from './registers/common.jsx';
import { fmtDate } from './registers/engine.js';
import { StatusPill } from '../components/ui/table.jsx';
import { Badge } from '../components/ui/index.js';
import { OPEN_RFI_STATUSES, londonToday } from '../../hub-core/derive.js';

const TONE = { Raise: 'accent', Open: 'accent', 'Close Out': 'info', Closed: 'ok' };
const num = r => `RFI-${String(r.number ?? '?').padStart(3, '0')}`;
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 864e5);

const fields = ctx => {
  const today = londonToday();
  const dwg = new Map((ctx.data.drawings || []).map(x => [x.id, x.title]));
  const drawingsOf = r => (r.drawingIds || []).map(id => dwg.get(id)).filter(Boolean);
  return [
    { key: 'number', label: 'RFI', type: 'number', width: 96, get: r => r.number, csv: num,
      render: r => <a href={r.url} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-info no-underline hover:underline whitespace-nowrap">{num(r)}</a> },
    { key: 'title', label: 'Description', type: 'text', get: r => r.title,
      render: r => (
        <div className="min-w-[240px]">
          <div>{r.title || '—'}</div>
          {r.question && r.question !== r.title && <div className="mt-0.5 text-[12px] text-muted line-clamp-2">{r.question}</div>}
        </div>
      ) },
    { key: 'question', label: 'Question', type: 'text', width: 280, get: r => r.question },
    { key: 'status', label: 'Status', type: 'select', width: 120, get: r => r.status, render: r => <StatusPill status={r.status} tone={TONE[r.status]} /> },
    { key: 'tbcBy', label: 'TBC by', type: 'select', width: 170, get: r => r.tbcBy },
    { key: 'bic', label: 'BIC', type: 'select', width: 110, get: r => r.bic },
    { key: 'raised', label: 'Raised', type: 'date', width: 110, get: r => r.raised },
    { key: 'due', label: 'Due', type: 'date', width: 110, get: r => r.due,
      render: r => (r.due ? <Badge tone={OPEN_RFI_STATUSES.has(r.status) && r.due < today ? 'danger' : 'muted'}>{fmtDate(r.due)}</Badge> : <span className="text-muted">—</span>) },
    { key: 'responded', label: 'Responded', type: 'date', width: 110, get: r => r.responded },
    { key: 'closedOn', label: 'Closed', type: 'date', width: 110, get: r => r.closed },
    { key: 'daysOpen', label: 'Days open', type: 'number', width: 90, get: r => (r.raised ? daysBetween(r.raised, r.closed || r.responded || today) : null) },
    { key: 'daysLate', label: 'Days overdue', type: 'number', width: 100, get: r => (OPEN_RFI_STATUSES.has(r.status) && r.due && r.due < today ? daysBetween(r.due, today) : null) },
    { key: 'answered', label: 'Has response', type: 'bool', width: 100, get: r => !!r.answered },
    { key: 'stopsWork', label: 'Stops work', type: 'bool', width: 110, get: r => !!r.stopsWork, render: r => (r.stopsWork ? <Badge tone="danger">Stops work</Badge> : null) },
    { key: 'drawings', label: 'Drawings', type: 'select', width: 200, get: drawingsOf },
    ...commonFields(ctx),
  ];
};

const STARTERS = [
  { id: 'overdue', name: 'Overdue responses', statusMode: 'open', group: 'tbcBy', sort: { key: 'due', dir: 'asc' }, filters: [{ field: 'due', op: 'past', value: null }],
    columns: ['number', 'title', 'tbcBy', 'raised', 'due', 'daysLate', 'stopsWork', 'item', 'project'] },
  { id: 'stops', name: 'Stopping work', statusMode: 'open', group: 'project', filters: [{ field: 'stopsWork', op: 'true', value: null }],
    columns: ['number', 'title', 'status', 'tbcBy', 'due', 'item'] },
  { id: 'month', name: 'Raised in the last 30 days', statusMode: 'all', group: 'none', sort: { key: 'raised', dir: 'desc' }, filters: [{ field: 'raised', op: 'last_n', value: '30' }],
    columns: ['number', 'title', 'status', 'tbcBy', 'raised', 'due', 'responded', 'item', 'project'] },
  { id: 'log', name: 'Full RFI log (all columns for export)', statusMode: 'all', group: 'none', sort: { key: 'number', dir: 'asc' },
    columns: ['number', 'title', 'question', 'status', 'tbcBy', 'bic', 'raised', 'due', 'responded', 'closedOn', 'daysOpen', 'stopsWork', 'drawings', 'item', 'project'] },
];

export default function RFIsPage() {
  return (
    <RegisterPage
      id="rfis"
      title="RFIs"
      subtitle="Requests for information"
      db="rfis"
      extraDbs={['drawings']}
      statusOf={r => r.status}
      statusTone={s => TONE[s] || 'muted'}
      openStatuses={OPEN_RFI_STATUSES}
      fields={fields}
      defaultColumns={['number', 'title', 'status', 'tbcBy', 'bic', 'raised', 'due', 'stopsWork', 'item', 'project']}
      starterViews={STARTERS}
      searchText={(r, ctx) => [num(r), r.title, r.question, r.tbcBy, ctx.itemOf(r)?.title].filter(Boolean).join(' ')}
      initialSort={{ key: 'number', dir: 'desc' }}
      filename="RFIs"
    />
  );
}
