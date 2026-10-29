// Client: that client's projects, with active-item counts.
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageShell, Card, SkeletonRows } from '../components/ui/index.js';
import { DataTable } from '../components/ui/table.jsx';
import { useSnapshots } from '../hooks/hub.js';
import { DONE_ITEM_STATUSES } from '../../hub-core/derive.js';

export default function ClientPage() {
  const { clientId } = useParams();
  const { data: s, isPending } = useSnapshots(['clients', 'projects', 'tasks']);
  const v = useMemo(() => {
    const client = s.clients.find(c => c.id === clientId);
    const rows = s.projects.filter(p => p.clientIds.includes(clientId)).map(p => {
      const items = s.tasks.filter(i => i.projectId === p.id && !i.archived);
      return { ...p, items: items.length, active: items.filter(i => !DONE_ITEM_STATUSES.has(i.status)).length };
    });
    return { client, rows };
  }, [s, clientId]);
  return (
    <PageShell title={v.client?.title || 'Client'} subtitle={`${v.rows.length} projects`}>
      <Card>
        {isPending ? <SkeletonRows rows={6} className="p-4" /> : (
          <DataTable rows={v.rows} initialSort={{ key: 'title', dir: 'asc' }} columns={[
            { key: 'title', label: 'Project', render: r => <Link to={`/project/${r.id}`} className="text-text no-underline hover:underline">{r.title}</Link> },
            { key: 'status', label: 'Status', width: 140, cellClassName: 'text-text-2' },
            { key: 'active', label: 'Active items', width: 130, cellClassName: 'font-mono text-[13px]' },
            { key: 'items', label: 'All items', width: 110, cellClassName: 'font-mono text-[13px] text-text-2' },
          ]} />
        )}
      </Card>
    </PageShell>
  );
}
