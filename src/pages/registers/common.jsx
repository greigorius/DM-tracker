// Fields every register shares: item, project, item status / DT, Notion link,
// created and last edited.
import { StatusPill } from '../../components/ui/table.jsx';

const itemsOf = (r, ctx) => (r.itemIds || []).map(id => ctx.items.get(id)).filter(Boolean);

export const commonFields = ctx => [
  { key: 'item', label: 'Item', type: 'select', width: 220, get: r => itemsOf(r, ctx).map(i => i.title).filter(Boolean),
    render: r => <span className="text-text-2">{itemsOf(r, ctx).map(i => i.title).join(', ') || '—'}</span> },
  { key: 'project', label: 'Project', type: 'select', width: 180, get: r => ctx.projects.get(ctx.projectOf(r)) || null },
  { key: 'itemStatus', label: 'Item status', type: 'select', width: 140, get: r => ctx.itemOf(r)?.status || null,
    render: r => <StatusPill status={ctx.itemOf(r)?.status} /> },
  { key: 'itemBic', label: 'Item ball in court', type: 'select', width: 130, get: r => ctx.itemOf(r)?.bic || null },
  { key: 'itemDt', label: 'Item DT', type: 'select', width: 150, get: r => (ctx.itemOf(r)?.dtIds || []).map(id => ctx.team.get(id)).filter(Boolean) },
  { key: 'notion', label: 'Notion link', type: 'text', width: 90, filter: false, group: false, get: r => r.url,
    render: r => (r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-muted hover:text-accent">Open ↗</a> : null) },
  { key: 'createdAt', label: 'Created', type: 'date', width: 110, get: r => r.createdAt?.slice(0, 10) || null },
  { key: 'editedAt', label: 'Last edited', type: 'date', width: 110, get: r => r.editedAt?.slice(0, 10) || null },
];
