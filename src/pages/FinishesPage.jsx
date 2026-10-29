// Finishes: material and finish specifications, with sample approval state.
import { TrackerPage, fmtDate } from './TrackerPage.jsx';
import { StatusPill } from '../components/ui/table.jsx';
import { Badge } from '../components/ui/index.js';

const TONE = { A: 'ok', B: 'accent', C: 'danger', 'Awaiting Approval': 'info', 'Not Submitted': 'muted' };
const OPEN = { has: s => s !== 'A' };
const muted = v => <span className="text-text-2">{v || '—'}</span>;
const desc = r => [r.materialType, r.faceMaterial, r.core, r.finish, r.brand, r.productCode, r.supplier].filter(Boolean).join(' · ');

const columns = ctx => [
  { key: 'title', label: 'CAD ref', width: 120, render: r => <a href={r.url} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-info no-underline hover:underline whitespace-nowrap">{r.title || '—'}</a> },
  { key: 'specRefs', label: 'Spec ref', width: 170, sortValue: r => r.specRefs[0], render: r => <span className="flex flex-wrap gap-1">{r.specRefs.map(x => <Badge key={x}>{x}</Badge>)}</span>, csv: r => r.specRefs.join('; ') },
  { key: 'desc', label: 'Finish', sortValue: desc, render: r => (
    <div className="min-w-[260px]">
      <div>{desc(r) || '—'}</div>
      {(r.fireRating || r.sheen || r.lipping || r.matchingPattern) && <div className="mt-0.5 text-[12px] text-muted">{[r.fireRating && `Fire ${r.fireRating}`, r.sheen && `Sheen ${r.sheen}`, r.lipping && `Lipping ${r.lipping}`, r.matchingPattern].filter(Boolean).join(' · ')}</div>}
    </div>
  ), csv: desc },
  { key: 'approved', label: 'Approved', width: 150, render: r => <StatusPill status={r.approved} tone={TONE[r.approved]} /> },
  { key: 'actionRequired', label: 'Action', width: 160, render: r => (r.actionRequired ? <Badge tone={r.actionRequired === 'OMITTED' ? 'muted' : 'accent'}>{r.actionRequired}</Badge> : null) },
  { key: 'sampleType', label: 'Sample', width: 190, render: r => muted([r.sampleRef, r.sampleType].filter(Boolean).join(' · ')) },
  { key: 'submittedOn', label: 'Submitted', width: 110, render: r => <span className="font-mono text-[12px] text-text-2">{fmtDate(r.submittedOn) || '—'}</span> },
  { key: 'item', label: 'Item', width: 200, sortValue: r => ctx.itemOf(r)?.title, render: r => muted(r.itemIds.map(id => ctx.items.get(id)?.title).filter(Boolean).join(', ')), csv: r => r.itemIds.map(id => ctx.items.get(id)?.title).join('; ') },
  { key: 'project', label: 'Project', width: 170, sortValue: r => ctx.projects.get(ctx.projectOf(r)), render: r => muted(ctx.projects.get(ctx.projectOf(r))), csv: r => ctx.projects.get(ctx.projectOf(r)) },
];

const GROUPINGS = [
  { value: 'spec', label: 'Group: Spec ref', key: r => r.specRefs[0] ?? null, name: k => k || 'No spec ref' },
  { value: 'item', label: 'Group: Item', key: r => r.itemIds?.[0] ?? null, name: (k, ctx) => ctx.items.get(k)?.title || 'No item' },
  { value: 'project', label: 'Group: Project', key: (r, ctx) => ctx.projectOf(r), name: (k, ctx) => ctx.projects.get(k) || 'No project' },
  { value: 'approved', label: 'Group: Approval', key: r => r.approved, name: k => k || 'No approval state' },
];

export default function FinishesPage() {
  return (
    <TrackerPage
      id="finishes"
      title="Finishes"
      subtitle="Material and finish specifications"
      db="finishes"
      projectOf={(r, ctx) => r.projectIds[0] ?? ctx.items.get(r.itemIds[0])?.projectId ?? null}
      statusOf={r => r.approved}
      statusTone={s => TONE[s] || 'muted'}
      openStatuses={OPEN}
      openLabel="Not yet A"
      columns={columns}
      groupings={GROUPINGS}
      defaultGroup="project"
      searchText={r => [r.title, ...r.specRefs, desc(r), r.sampleRef].filter(Boolean).join(' ')}
      initialSort={{ key: 'title', dir: 'asc' }}
      filename="finishes.csv"
    />
  );
}
