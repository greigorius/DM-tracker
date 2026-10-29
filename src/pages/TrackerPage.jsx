// Shared layout for snapshot-backed tracker pages (RFIs, Variations…):
// filters, status summary, grouping by item / project, sortable tables, CSV.

import { useCallback, useMemo, useState } from 'react';
import { PageShell, Badge, Card, SkeletonRows } from '../components/ui/index.js';
import {
  ToolbarSelect, SearchBox, ToolbarButton, ExportButton, DataTable, TableGroup, useGroups,
} from '../components/ui/table.jsx';
import { useSnapshots } from '../hooks/hub.js';

const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
function useStored(key, initial) {
  const [v, setV] = useState(() => store.get(key, initial));
  return [v, x => { setV(x); store.set(key, x); }];
}

export function TrackerPage({
  id, title, subtitle, db, statusOf, statusTone, openStatuses, columns, searchText, initialSort, filename,
}) {
  const { data, isPending } = useSnapshots([db, 'tasks', 'projects']);
  const [project, setProject] = useStored(`hub.${id}.project`, 'all');
  const [status, setStatus] = useStored(`hub.${id}.status`, 'open');
  const [groupKey, setGroupKey] = useStored(`hub.${id}.group`, 'item');
  const [q, setQ] = useState('');

  const ctx = useMemo(() => {
    const items = new Map(data.tasks.map(i => [i.id, i]));
    const projects = new Map(data.projects.map(p => [p.id, p.title]));
    return {
      items,
      projects,
      itemOf: r => items.get(r.itemIds?.[0]),
      projectOf: r => items.get(r.itemIds?.[0])?.projectId ?? null,
    };
  }, [data.tasks, data.projects]);

  const all = data[db];
  const statuses = useMemo(() => [...new Set(all.map(statusOf).filter(Boolean))].sort(), [all, statusOf]);
  const projectOptions = useMemo(() => {
    const ids = new Set(all.map(ctx.projectOf).filter(Boolean));
    return [...ids].map(pid => ({ value: pid, label: ctx.projects.get(pid) || 'Unknown project' })).sort((a, b) => a.label.localeCompare(b.label));
  }, [all, ctx]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(r => {
      if (project !== 'all' && ctx.projectOf(r) !== project) return false;
      const s = statusOf(r);
      if (status === 'open' && !openStatuses.has(s)) return false;
      if (status !== 'open' && status !== 'all' && s !== status) return false;
      if (needle && !searchText(r, ctx).toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [all, project, status, q, ctx, statusOf, openStatuses, searchText]);

  const counts = useMemo(() => {
    const m = new Map();
    for (const r of all.filter(r => project === 'all' || ctx.projectOf(r) === project)) {
      const s = statusOf(r) || 'No status';
      m.set(s, (m.get(s) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all, project, ctx, statusOf]);

  const groupBy = groupKey === 'item' ? r => r.itemIds?.[0] ?? null : groupKey === 'project' ? ctx.projectOf : null;
  const labelOf = useCallback(k => (groupKey === 'item'
    ? (ctx.items.get(k)?.title || 'No item')
    : (ctx.projects.get(k) || 'No project')), [groupKey, ctx]);
  const { groups, isOpen, toggle, expandAll, collapseAll } = useGroups(rows, groupBy, labelOf);

  const cols = columns(ctx).filter(c => !(c.key === 'item' && groupKey === 'item') && !(c.key === 'project' && groupKey !== 'none'));

  const toolbar = (
    <>
      <SearchBox value={q} onChange={setQ} />
      <ToolbarSelect label="Project" value={project} onChange={setProject} options={[{ value: 'all', label: 'All projects' }, ...projectOptions]} />
      <ToolbarSelect label="Status" value={status} onChange={setStatus} options={[{ value: 'open', label: 'Open only' }, { value: 'all', label: 'All statuses' }, ...statuses]} />
      <ToolbarSelect label="Group by" value={groupKey} onChange={setGroupKey} options={[{ value: 'item', label: 'Group: Item' }, { value: 'project', label: 'Group: Project' }, { value: 'none', label: 'No grouping' }]} />
      {groupKey !== 'none' && <>
        <ToolbarButton onClick={expandAll}>Expand all</ToolbarButton>
        <ToolbarButton onClick={collapseAll}>Collapse all</ToolbarButton>
      </>}
      <span className="ml-auto font-mono text-[12px] text-muted">{rows.length} shown</span>
      <ExportButton filename={filename} columns={cols} rows={rows} />
    </>
  );

  return (
    <PageShell title={title} subtitle={subtitle} toolbar={toolbar}>
      {counts.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Status summary">
          {counts.map(([s, n]) => (
            <button key={s} type="button" onClick={() => setStatus(s)} className="bg-transparent border-0 p-0 cursor-pointer">
              <Badge tone={statusTone(s)} className="py-1.5 px-2">{s} · {n}</Badge>
            </button>
          ))}
        </div>
      )}

      {isPending ? <Card className="p-4"><SkeletonRows rows={10} /></Card> : groupKey === 'none' ? (
        <Card><DataTable columns={cols} rows={rows} initialSort={initialSort} /></Card>
      ) : groups.length === 0 ? (
        <Card className="p-4 text-[14px] text-muted">Nothing matches these filters.</Card>
      ) : groups.map(g => {
        const open = g.rows.filter(r => openStatuses.has(statusOf(r))).length;
        return (
          <TableGroup
            key={g.key}
            title={g.label}
            count={`${g.rows.length}`}
            open={isOpen(g.key)}
            onToggle={() => toggle(g.key)}
            meta={<>
              {groupKey === 'item' && <span className="hidden sm:inline font-mono text-[12px] text-muted">{ctx.projects.get(ctx.items.get(g.key)?.projectId)}</span>}
              {open > 0 && <Badge tone="accent">{open} open</Badge>}
            </>}
          >
            <DataTable columns={cols} rows={g.rows} initialSort={initialSort} />
          </TableGroup>
        );
      })}
    </PageShell>
  );
}

export const fmtDate = d => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : null);
