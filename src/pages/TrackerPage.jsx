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
// Multi-select of status badges, kept per tracker like the other filters.
function useStoredList(key) {
  const [v, setV] = useState(() => {
    try { const a = JSON.parse(store.get(key, '[]')); return Array.isArray(a) ? a : []; } catch { return []; }
  });
  return [v, x => { setV(x); store.set(key, JSON.stringify(x)); }];
}
const NO_STATUS = 'No status';
const PICKED = '__picked';

const DEFAULT_GROUPINGS = [
  { value: 'item', label: 'Group: Item', key: r => r.itemIds?.[0] ?? null, name: (k, ctx) => ctx.items.get(k)?.title || 'No item',
    meta: (k, ctx) => ctx.projects.get(ctx.items.get(k)?.projectId) },
  { value: 'project', label: 'Group: Project', key: (r, ctx) => ctx.projectOf(r), name: (k, ctx) => ctx.projects.get(k) || 'No project' },
];

export function TrackerPage({
  id, title, subtitle, db, statusOf, statusTone, openStatuses, columns, searchText, initialSort, filename,
  extraDbs = [], projectOf, groupings = DEFAULT_GROUPINGS, defaultGroup = 'item', openLabel = 'Open only', headerExtra,
}) {
  const { data, isPending } = useSnapshots([db, 'tasks', 'projects', 'team', ...extraDbs]);
  const [project, setProject] = useStored(`hub.${id}.project`, 'all');
  const [status, setStatus] = useStored(`hub.${id}.status`, 'open');
  const [picked, setPicked] = useStoredList(`hub.${id}.picked`);
  const [groupKey, setGroupKey] = useStored(`hub.${id}.group`, defaultGroup);
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const togglePicked = s => setPicked(pickedSet.has(s) ? picked.filter(x => x !== s) : [...picked, s]);
  const clearPicked = () => setPicked([]);
  // Choosing from the Status dropdown replaces any badge selection.
  const onStatusSelect = v => { if (v === PICKED) return; setPicked([]); setStatus(v); };
  const [q, setQ] = useState('');

  const ctx = useMemo(() => {
    const items = new Map(data.tasks.map(i => [i.id, i]));
    const projects = new Map(data.projects.map(p => [p.id, p.title]));
    const team = new Map(data.team.map(p => [p.id, p.title]));
    const c = {
      data,
      items,
      projects,
      team,
      itemOf: r => items.get(r.itemIds?.[0]),
      vcs: new Map((data.variations || []).map(v => [v.id, v])),
    };
    c.projectOf = projectOf ? r => projectOf(r, c) : r => items.get(r.itemIds?.[0])?.projectId ?? null;
    return c;
  }, [data, projectOf]);

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
      if (pickedSet.size > 0) {
        if (!pickedSet.has(s || NO_STATUS)) return false;
      } else {
        if (status === 'open' && !openStatuses.has(s)) return false;
        if (status !== 'open' && status !== 'all' && s !== status) return false;
      }
      if (needle && !searchText(r, ctx).toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [all, project, status, pickedSet, q, ctx, statusOf, openStatuses, searchText]);

  const counts = useMemo(() => {
    const m = new Map();
    for (const r of all.filter(r => project === 'all' || ctx.projectOf(r) === project)) {
      const s = statusOf(r) || NO_STATUS;
      m.set(s, (m.get(s) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all, project, ctx, statusOf]);

  const grouping = groupings.find(g => g.value === groupKey) || null;
  const groupBy = useMemo(() => (grouping ? r => grouping.key(r, ctx) : null), [grouping, ctx]);
  const labelOf = useCallback(k => grouping?.name(k, ctx), [grouping, ctx]);
  const { groups, isOpen, toggle, expandAll, collapseAll } = useGroups(rows, groupBy, labelOf);

  const cols = columns(ctx).filter(c => c.key !== groupKey && !(c.key === 'project' && groupKey === 'item'));

  const toolbar = (
    <>
      <SearchBox value={q} onChange={setQ} />
      <ToolbarSelect label="Project" value={project} onChange={setProject} options={[{ value: 'all', label: 'All projects' }, ...projectOptions]} />
      <ToolbarSelect label="Status" value={picked.length ? PICKED : status} onChange={onStatusSelect} options={[
        ...(picked.length ? [{ value: PICKED, label: picked.length === 1 ? picked[0] : `${picked.length} statuses` }] : []),
        { value: 'open', label: openLabel }, { value: 'all', label: 'All statuses' }, ...statuses,
      ]} />
      <ToolbarSelect label="Group by" value={groupKey} onChange={setGroupKey} options={[...groupings.map(g => ({ value: g.value, label: g.label })), { value: 'none', label: 'No grouping' }]} />
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
      {headerExtra?.(rows, ctx)}
      {counts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
          {counts.map(([s, n]) => {
            const on = pickedSet.has(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => togglePicked(s)}
                className={`bg-transparent border-0 p-0 cursor-pointer transition-opacity ${picked.length && !on ? 'opacity-45 hover:opacity-80' : ''}`}
              >
                <Badge tone={statusTone(s)} className={`py-2 px-2.5 sm:py-1.5 sm:px-2 ${on ? 'bg-surface-hi border-current outline outline-1 outline-current' : ''}`}>
                  {on && <span aria-hidden="true" className="mr-1">✓</span>}{s} · {n}
                </Badge>
              </button>
            );
          })}
          {picked.length > 0 && (
            <button
              type="button"
              onClick={clearPicked}
              className="bg-transparent border-0 px-1 py-2 sm:py-1 cursor-pointer font-mono text-[11px] uppercase tracking-[0.08em] text-muted hover:text-text underline underline-offset-2"
            >
              Clear selection
            </button>
          )}
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
              {grouping?.meta && <span className="hidden sm:inline font-mono text-[12px] text-muted">{grouping.meta(g.key, ctx)}</span>}
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
