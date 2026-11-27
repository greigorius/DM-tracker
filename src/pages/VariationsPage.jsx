import { RegisterPage } from './registers/RegisterPage.jsx';
import { commonFields } from './registers/common.jsx';
import { StatusPill } from '../components/ui/table.jsx';
import { Badge } from '../components/ui/index.js';
import { vcPauses } from '../../hub-core/item-bic.js';

const OPEN = new Set(['Awaiting Design Info', 'Awaiting Instruction', null, undefined, '']);
const TONE = { 'Awaiting Design Info': 'accent', 'Awaiting Instruction': 'accent', 'Instruction Received': 'ok', Declined: 'danger', Withdrawn: 'muted' };

const fields = ctx => [
  { key: 'number', label: 'VC', type: 'number', width: 104, get: r => r.number, csv: r => r.code,
    render: r => <a href={r.url} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-accent no-underline hover:underline whitespace-nowrap">{r.code || 'VC'}</a> },
  { key: 'title', label: 'Description', type: 'text', get: r => r.title, render: r => <div className="min-w-[240px]">{r.title || '—'}</div> },
  { key: 'status', label: 'Status', type: 'select', width: 190, get: r => r.status || null, render: r => <StatusPill status={r.status || 'No status'} tone={TONE[r.status] || 'muted'} /> },
  { key: 'type', label: 'Type', type: 'select', width: 180, get: r => r.type },
  { key: 'raisedBy', label: 'Raised by', type: 'select', width: 120, get: r => r.raisedBy },
  { key: 'tbcBy', label: 'TBC by', type: 'select', width: 180, get: r => r.tbcBy || [] },
  { key: 'bic', label: 'BIC', type: 'select', width: 110, get: r => r.bic },
  { key: 'instructed', label: 'Instructed', type: 'bool', width: 110, get: r => !!r.instructed, render: r => (r.instructed ? <Badge tone="ok">Yes</Badge> : null) },
  { key: 'pauses', label: 'Pauses the item', type: 'bool', width: 110, get: r => !!vcPauses(r),
    render: r => (vcPauses(r) ? <Badge tone="danger">Pauses</Badge> : null) },
  { key: 'requested', label: 'Requested', type: 'date', width: 116, get: r => r.requested },
  { key: 'decision', label: 'Decision', type: 'date', width: 116, get: r => r.decision },
  { key: 'addedDays', label: 'Added days', type: 'number', width: 100, get: r => r.addedDays },
  ...commonFields(ctx),
];

const STARTERS = [
  { id: 'awaiting', name: 'Awaiting instruction', statusMode: 'all', statuses: ['Awaiting Instruction'], group: 'project', sort: { key: 'requested', dir: 'asc' },
    columns: ['number', 'title', 'type', 'tbcBy', 'requested', 'pauses', 'item'] },
  { id: 'pausing', name: 'Pausing items', statusMode: 'open', group: 'project', filters: [{ field: 'pauses', op: 'true', value: null }],
    columns: ['number', 'title', 'status', 'tbcBy', 'requested', 'item', 'itemStatus'] },
  { id: 'instructed', name: 'Instructed changes', statusMode: 'all', group: 'project', filters: [{ field: 'instructed', op: 'true', value: null }], sort: { key: 'decision', dir: 'desc' },
    columns: ['number', 'title', 'type', 'decision', 'addedDays', 'item'] },
  { id: 'log', name: 'Full variation log (all columns for export)', statusMode: 'all', group: 'none', sort: { key: 'number', dir: 'asc' },
    columns: ['number', 'title', 'status', 'type', 'raisedBy', 'tbcBy', 'bic', 'instructed', 'pauses', 'requested', 'decision', 'addedDays', 'item', 'project'] },
];

export default function VariationsPage() {
  return (
    <RegisterPage
      id="variations"
      title="Variations"
      subtitle="Design and scope changes"
      db="variations"
      statusOf={r => r.status || null}
      statusTone={s => TONE[s] || 'muted'}
      openStatuses={OPEN}
      fields={fields}
      defaultColumns={['number', 'title', 'status', 'type', 'raisedBy', 'tbcBy', 'instructed', 'requested', 'decision', 'item', 'project']}
      starterViews={STARTERS}
      searchText={(r, ctx) => [r.code, r.title, r.type, r.raisedBy, ...(r.tbcBy || []), ctx.itemOf(r)?.title].filter(Boolean).join(' ')}
      initialSort={{ key: 'number', dir: 'desc' }}
      filename="Variations"
    />
  );
}
