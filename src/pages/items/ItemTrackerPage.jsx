// Item Tracker (spec claude/item-tracker-spec.md): a scrollable list of items
// on the left, the selected item's current position on the right, editable on
// the fly. Same layout as the Programme page's Review tab. Replaces the old
// Items table.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Card, Badge, SkeletonRows, cx } from '../../components/ui/index.js';
import { WorkspaceShell } from '../workspace/WorkspaceShell.jsx';
import { useActiveMeeting } from '../meetings/useMeeting.js';
import { ToolbarSelect, SearchBox, StatusPill } from '../../components/ui/table.jsx';
import { useBootstrap, useSnapshots, useCreateCoordinationItem } from '../../hooks/hub.js';
import { useToast } from '../../components/ui/index.js';
import { useProgramme } from '../../hooks/programme.js';
import { useBriefData } from '../brief/shared.jsx';
import { bare } from '../brief/statusModel.js';
import { ItemPanel } from './ItemPanel.jsx';
import { coordIndex } from './coordination.js';
import { ITEM_STATUS_COLORS } from '../../data/colors.js';
import { bicContext } from '../../../hub-core/item-bic.js';
import { isOpenAction, isOpenRfi } from '../../../hub-core/derive.js';
import { variationHolds } from '../../../netlify/functions/_statusRules.js';
import { fmt } from '../../../hub-core/programme/view.js';

const CLOSED = new Set(['Complete', 'PC Approved', 'Close Out']);
const OPEN_VC = new Set(['Awaiting Design Info', 'Awaiting Instruction']);
const HAS = [
  { value: '', label: 'Has open: any' },
  { value: 'rfis', label: 'Open RFIs' },
  { value: 'pausing', label: 'Pausing variations' },
  { value: 'actions', label: 'Open actions' },
  { value: 'overdue', label: 'Overdue' },
];
const toneOf = s => {
  const c = ITEM_STATUS_COLORS[s]?.text || '';
  return c.includes('danger') ? 'danger' : c.includes('accent') ? 'accent' : c.includes('ok') ? 'ok' : c.includes('info') ? 'info' : 'muted';
};
const byName = (a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true });

// Per-item counts and last-change, built once per snapshot set
function useIndex(d, todos) {
  return useMemo(() => {
    const today = d.today;
    const m = new Map();
    const get = id => { const k = bare(id); if (!m.has(k)) m.set(k, { rfis: 0, vcs: 0, pausing: 0, actions: 0, overdue: 0, changed: '' }); return m.get(k); };
    const touch = (ids, at) => { for (const i of ids || []) { const x = get(i); if (at && at > x.changed) x.changed = at; } };
    for (const a of d.all.actions) {
      if (a.archived) continue;
      touch(a.itemIds, a.editedAt);
      if (isOpenAction(a)) for (const i of a.itemIds || []) { const x = get(i); x.actions++; if (a.due && a.due < today) x.overdue++; }
    }
    for (const r of d.all.rfis) {
      if (r.archived) continue;
      touch(r.itemIds, r.editedAt);
      if (isOpenRfi(r)) for (const i of r.itemIds || []) { const x = get(i); x.rfis++; if (r.due && r.due < today) x.overdue++; }
    }
    for (const v of d.all.variations) {
      if (v.archived) continue;
      touch(v.itemIds, v.editedAt);
      const hold = variationHolds({ type: v.type, override: v.pauseOverride, status: v.status, requestDate: v.requested, decisionDate: v.decision }, today);
      if (OPEN_VC.has(v.status) || hold) for (const i of v.itemIds || []) { const x = get(i); x.vcs++; if (hold) x.pausing++; }
    }
    for (const t of todos) if (!t.archived) touch(t.itemIds, t.editedAt);
    for (const a of d.all.activity) if (!a.archived) touch(a.itemIds, a.at);
    return id => m.get(bare(id)) || { rfis: 0, vcs: 0, pausing: 0, actions: 0, overdue: 0, changed: '' };
  }, [d, todos]);
}

function CoordWarning({ projectId, count }) {
  const create = useCreateCoordinationItem();
  const toast = useToast();
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-accent"><AlertTriangle size={13} aria-hidden="true" />
      {count > 1 ? `${count} Design Coordination items: keep one starting 000-` : <>No Design Coordination item ·
        <button type="button" disabled={create.isPending} onClick={() => create.mutate({ projectId }, { onSuccess: ({ row }) => toast.show(`Created ${row.title}`), onError: e => toast.show(`Not created: ${e.message}`, { tone: 'danger' }) })}
          className="bg-transparent border-0 p-0 text-[12px] text-accent underline cursor-pointer">{create.isPending ? 'creating…' : 'create it'}</button></>}
    </span>
  );
}

export default function ItemTrackerPage() {
  const [params, setParams] = useSearchParams();
  const p = k => params.get(k) || '';
  const setP = useCallback((k, v, replace) => setParams(cur => { const n = new URLSearchParams(cur); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: !!replace }), [setParams]);
  const project = p('project'), dt = p('dt'), hasOpen = p('has'), since = p('since'), showClosed = p('closed') === '1', selected = p('item');
  const [q, setQ] = useState('');

  const d = useBriefData('');
  const { data: snaps } = useSnapshots(['todo']);
  const todos = snaps.todo;
  const { data: boot } = useBootstrap();
  const lookups = boot?.lookups || {};
  const prog = useProgramme(project);
  const progOf = useMemo(() => new Map(prog.items.map(i => [bare(i.id), i])), [prog.items]);
  const bicCtx = useMemo(() => bicContext(d.all), [d.all]);
  const coord = useMemo(() => coordIndex(d.all.tasks), [d.all.tasks]);
  const coordIds = useMemo(() => new Set([...coord.values()].map(c => c.item?.id).filter(Boolean)), [coord]);
  const idx = useIndex(d, todos);

  const needle = q.trim().toLowerCase();
  const rows = useMemo(() => d.all.tasks.filter(i => {
    if (i.archived || !i.projectId) return false;
    if (project && i.projectId !== project) return false;
    if (!project && !prog.live.has(i.projectId)) return false;
    if (!showClosed && CLOSED.has(i.status) && !coordIds.has(i.id)) return false;
    if (dt && !(i.dtIds || []).includes(dt)) return false;
    const x = idx(i.id);
    if (hasOpen === 'rfis' && !x.rfis) return false;
    if (hasOpen === 'pausing' && !x.pausing) return false;
    if (hasOpen === 'actions' && !x.actions) return false;
    if (hasOpen === 'overdue' && !x.overdue) return false;
    if (since && !(x.changed && x.changed.slice(0, 10) >= since)) return false;
    if (needle && !(i.title || '').toLowerCase().includes(needle)) return false;
    return true;
  }), [d.all.tasks, project, prog.live, showClosed, coordIds, dt, hasOpen, since, needle, idx]);

  // Group by project; the Design Coordination item is pinned first
  const groups = useMemo(() => {
    const by = new Map();
    for (const r of rows) { if (!by.has(r.projectId)) by.set(r.projectId, []); by.get(r.projectId).push(r); }
    return [...by].map(([pid, list]) => ({
      pid, title: d.projects.get(pid) || 'No project', coord: coord.get(pid) || { item: null, count: 0 },
      items: list.sort((a, b) => (coordIds.has(b.id) - coordIds.has(a.id)) || byName(a, b)),
    })).sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  }, [rows, d.projects, coord, coordIds]);
  const flat = useMemo(() => groups.flatMap(g => g.items), [groups]);
  const sel = flat.find(i => i.id === selected) || flat[0] || null;

  useEffect(() => { if (sel && sel.id !== selected) setP('item', sel.id, true); }, [sel, selected, setP]);
  // In a meeting, every item you open is recorded as discussed (after 2 s, so arrowing past doesn't count)
  const { meeting, discuss } = useActiveMeeting();
  useEffect(() => {
    if (!meeting || !sel) return undefined;
    const tm = setTimeout(() => discuss(sel.id), 2000);
    return () => clearTimeout(tm);
  }, [meeting, sel, discuss]);

  // ↑/↓ move the selection; the panel follows
  const listRef = useRef(null);
  const onKey = e => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key) || !flat.length) return;
    e.preventDefault();
    const at = Math.max(0, flat.findIndex(i => i.id === sel?.id));
    const next = flat[Math.min(flat.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))];
    setP('item', next.id, true);
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-id="${next.id}"]`)?.focus());
  };

  const projectOptions = useMemo(() => [{ value: '', label: 'All live projects' },
    ...[...prog.live].map(id => ({ value: id, label: d.projects.get(id) || 'Unknown' })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))], [prog.live, d.projects]);
  const filterCount = !!dt + !!hasOpen + !!since + showClosed;

  return (
    <WorkspaceShell
      lens="items"
      subtitle="Every item's current position, editable on the fly"
      toolbar={<>
        <ToolbarSelect label="Project" value={project} onChange={v => setP('project', v)} options={projectOptions} />
        <ToolbarSelect label="DT" value={dt} onChange={v => setP('dt', v)} options={[{ value: '', label: 'Any DT' }, ...d.dts.map(x => ({ value: x.id, label: x.name }))]} />
        <ToolbarSelect label="Has open" value={hasOpen} onChange={v => setP('has', v)} options={HAS} />
        <label className="min-h-11 px-3 inline-flex items-center gap-2 border border-line-strong text-[13px] text-text-2">
          Changed since
          <input type="date" aria-label="Changed since" value={since} onChange={e => setP('since', e.target.value)} className="bg-transparent border-0 text-text text-[13px] outline-none" />
        </label>
        <label className="min-h-11 px-3 inline-flex items-center gap-2 border border-line-strong text-[13px] text-text-2 cursor-pointer">
          <input type="checkbox" checked={showClosed} onChange={e => setP('closed', e.target.checked ? '1' : '')} className="w-[18px] h-[18px] accent-[var(--color-accent)]" /> Show closed
        </label>
        <span className="ml-auto flex items-center gap-2">
          {filterCount > 0 && <button type="button" onClick={() => setParams(cur => { const n = new URLSearchParams(); if (cur.get('project')) n.set('project', cur.get('project')); return n; })} className="min-h-11 px-3 bg-transparent border-0 font-mono text-[12px] text-muted cursor-pointer hover:text-text-2">Clear filters</button>}
          <SearchBox value={q} onChange={setQ} placeholder="Item name or suffix" />
        </span>
      </>}
    >
      {d.isPending || prog.isPending ? <Card className="p-4"><SkeletonRows rows={8} /></Card> : !flat.length ? (
        <Card className="p-4 text-[14px] text-muted">No items match these filters.</Card>
      ) : (
        <div className="flex flex-col lg:flex-row items-start gap-6">
          <nav ref={listRef} aria-label="Items" onKeyDown={onKey} className="w-full lg:w-[380px] lg:shrink-0 flex flex-col gap-5 lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto lg:pr-1">
            <span className="font-mono text-[12px] text-muted -mb-2">{flat.length} item{flat.length === 1 ? '' : 's'} · ↑↓ to move</span>
            {groups.map(g => (
              <section key={g.pid} className="flex flex-col gap-2">
                <h2 className="m-0 flex items-center justify-between font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-text-2">{g.title}<span className="text-muted">{g.items.length}</span></h2>
                {!g.coord.item && <CoordWarning projectId={g.pid} count={g.coord.count} />}
                {g.items.map(i => {
                  const on = sel?.id === i.id, x = idx(i.id), pr = progOf.get(bare(i.id)), isC = coordIds.has(i.id);
                  return (
                    <button key={i.id} data-id={i.id} type="button" onClick={() => setP('item', i.id, true)} aria-pressed={on}
                      className={cx('flex flex-col gap-1.5 px-4 py-3 border text-left cursor-pointer text-text outline-none focus-visible:border-accent',
                        on ? 'bg-surface-hi border-accent' : isC ? 'bg-surface border-line-strong border-dashed hover:border-line-strong' : 'bg-surface border-line hover:border-line-strong',
                        CLOSED.has(i.status) && 'opacity-60')}>
                      <span className="flex justify-between gap-3 w-full">
                        <span className="text-[15px] font-semibold leading-snug">{i.title || 'Untitled'}</span>
                        {since && x.changed?.slice(0, 10) >= since && <span className="w-2 h-2 mt-1.5 shrink-0 rounded-full bg-accent" title="Changed since" />}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {isC ? <Badge tone="muted">Coordination</Badge> : <StatusPill status={i.status} tone={toneOf(i.status)} />}
                        {i.bic && !isC && <Badge tone="muted">{i.bic}</Badge>}
                        {x.rfis > 0 && <Badge tone="info">{x.rfis} RFI</Badge>}
                        {x.vcs > 0 && <Badge tone={x.pausing ? 'danger' : 'accent'}>{x.vcs} VC{x.pausing ? ' · pausing' : ''}</Badge>}
                        {x.actions > 0 && <Badge tone={x.overdue ? 'danger' : 'muted'}>{x.actions} action{x.actions === 1 ? '' : 's'}</Badge>}
                        {pr?.next && <span className="ml-auto font-mono text-[12px] text-text-2 whitespace-nowrap">{pr.next.label} {fmt(pr.next.date)}</span>}
                      </span>
                    </button>
                  );
                })}
              </section>
            ))}
          </nav>
          {sel && <ItemPanel key={sel.id} item={sel} d={d} prog={progOf.get(bare(sel.id)) || null} todos={todos} lookups={lookups} bicCtx={bicCtx} isCoord={coordIds.has(sel.id)} />}
        </div>
      )}
    </WorkspaceShell>
  );
}
