// Finishes: material and finish specifications, with sample approval state.
import { RegisterPage } from './registers/RegisterPage.jsx';
import { commonFields } from './registers/common.jsx';
import { StatusPill } from '../components/ui/table.jsx';
import { Badge } from '../components/ui/index.js';

const TONE = { A: 'ok', B: 'accent', C: 'danger', 'Awaiting Approval': 'info', 'Not Submitted': 'muted' };
const OPEN = { has: s => s !== 'A' };
const desc = r => [r.materialType, r.faceMaterial, r.core, r.finish, r.brand, r.productCode, r.supplier].filter(Boolean).join(' · ');
const txt = (key, label, width = 150, type = 'text') => ({ key, label, type, width, get: r => r[key] });

const fields = ctx => [
  { key: 'title', label: 'CAD ref', type: 'text', width: 120, get: r => r.title,
    render: r => <a href={r.url} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-info no-underline hover:underline whitespace-nowrap">{r.title || '—'}</a> },
  { key: 'specRefs', label: 'Spec ref', type: 'select', width: 170, get: r => r.specRefs || [] },
  { key: 'desc', label: 'Finish (summary)', type: 'text', get: desc, render: r => (
    <div className="min-w-[260px]">
      <div>{desc(r) || '—'}</div>
      {(r.fireRating || r.sheen || r.lipping || r.matchingPattern) && <div className="mt-0.5 text-[12px] text-muted">{[r.fireRating && `Fire ${r.fireRating}`, r.sheen && `Sheen ${r.sheen}`, r.lipping && `Lipping ${r.lipping}`, r.matchingPattern].filter(Boolean).join(' · ')}</div>}
    </div>
  ) },
  { key: 'approved', label: 'Approved', type: 'select', width: 150, get: r => r.approved, render: r => <StatusPill status={r.approved} tone={TONE[r.approved]} /> },
  { key: 'actionRequired', label: 'Action', type: 'select', width: 160, get: r => r.actionRequired,
    render: r => (r.actionRequired ? <Badge tone={r.actionRequired === 'OMITTED' ? 'muted' : 'accent'}>{r.actionRequired}</Badge> : null) },
  txt('sampleType', 'Sample type', 150, 'select'), txt('sampleRef', 'Sample ref', 120),
  { key: 'submittedOn', label: 'Submitted', type: 'date', width: 110, get: r => r.submittedOn },
  txt('materialType', 'Material type', 150, 'select'), txt('faceMaterial', 'Face material'), txt('core', 'Core'), txt('finish', 'Finish'),
  txt('brand', 'Brand', 140, 'select'), txt('productCode', 'Product code'), txt('supplier', 'Supplier', 150, 'select'),
  txt('fireRating', 'Fire rating', 110, 'select'), txt('sheen', 'Sheen (%)', 90), txt('lipping', 'Lipping'), txt('matchingPattern', 'Matching pattern'),
  txt('finishInfo', 'Finish info', 220), txt('notes', 'Notes', 220), txt('comments', 'Comments', 220),
  ...commonFields(ctx),
];

const STARTERS = [
  { id: 'awaiting', name: 'Samples awaiting approval', statusMode: 'all', statuses: ['Awaiting Approval'], group: 'project', sort: { key: 'submittedOn', dir: 'asc' },
    columns: ['title', 'specRefs', 'desc', 'sampleRef', 'sampleType', 'submittedOn', 'item'] },
  { id: 'not-submitted', name: 'Not yet submitted', statusMode: 'all', statuses: ['Not Submitted'], group: 'supplier',
    columns: ['title', 'specRefs', 'desc', 'supplier', 'actionRequired', 'item'] },
  { id: 'schedule', name: 'Finishes schedule (export)', statusMode: 'all', group: 'specRefs', sort: { key: 'title', dir: 'asc' },
    columns: ['title', 'specRefs', 'materialType', 'faceMaterial', 'core', 'finish', 'brand', 'productCode', 'supplier', 'fireRating', 'sheen', 'lipping', 'approved', 'project'] },
];

export default function FinishesPage() {
  return (
    <RegisterPage
      id="finishes"
      title="Finishes"
      subtitle="Material and finish specifications"
      db="finishes"
      projectOf={(r, ctx) => r.projectIds[0] ?? ctx.items.get(r.itemIds[0])?.projectId ?? null}
      statusOf={r => r.approved}
      statusTone={s => TONE[s] || 'muted'}
      openStatuses={OPEN}
      openLabel="Not yet A"
      fields={fields}
      defaultColumns={['title', 'specRefs', 'desc', 'approved', 'actionRequired', 'sampleType', 'submittedOn', 'item', 'project']}
      starterViews={STARTERS}
      defaultGroup="project"
      searchText={r => [r.title, ...(r.specRefs || []), desc(r), r.sampleRef].filter(Boolean).join(' ')}
      initialSort={{ key: 'title', dir: 'asc' }}
      filename="Finishes"
    />
  );
}
