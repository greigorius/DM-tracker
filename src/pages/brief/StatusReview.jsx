// Triage → Item status: what the status rules (hub-core/item-status.js, shared
// with the item-status automation) would set, why, and the trigger fields behind
// it, editable in place. Fix an input and the plan recomputes; apply the derived
// status, or override and lock it.
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, Badge, Button, SkeletonRows, useToast, cx } from '../../components/ui/index.js';
import { SearchBox } from '../../components/ui/table.jsx';
import { api } from '../../lib/api.js';
import { keys, useBootstrap, useUpdateRecord } from '../../hooks/hub.js';
import { Sel, DateIn, Mini, Check } from './controls.jsx';
import { PositionSummary, ItemPosition, Move } from './ItemPosition.jsx';
import { PLAN_KEY } from './statusModel.js';

const STATUSES = ['To Do', 'In Progress', 'Blocked', 'In Production', 'Design Complete', 'Omitted'];
const MODE_TEXT = {
  dry: 'Review mode: the Hub writes nothing on its own. Apply ticked rows here, or set ITEM_STATUS_AUTO=on in .env to let every sync apply them (up to 40 per run). The nightly item-status sweep and Make scenarios use the same rules.',
  on: 'Automatic: every sync writes these changes to Notion (up to 40 per run). Tick Lock Status on an item to keep a hand-set status.',
  off: 'Off: the rule is only shown here. Set ITEM_STATUS_AUTO=dry or on in .env.',
};
const VIEWS = [
  { id: 'changes', label: 'To change' },
  { id: 'held', label: 'Blocked' },
  { id: 'locked', label: 'Locked' },
  { id: 'gaps', label: 'Gaps' },
];

const Ext = ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-text no-underline hover:underline">{children}</a>;

// One record's trigger fields. Saves on change, then the plan is recomputed.
function useEdit(db) {
  const update = useUpdateRecord(db);
  const qc = useQueryClient();
  const toast = useToast();
  return set => (id) => update.mutate({ id, set }, {
    onSuccess: () => qc.invalidateQueries({ queryKey: PLAN_KEY }),
    onError: e => toast.show(`Not saved: ${e.message}`, { tone: 'danger' }),
  });
}

function RfiTrigger({ row, t }) {
  const save = useEdit('rfis');
  if (!row) return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Check label="Stops work" checked={row.stopsWork} onChange={v => save({ stopsWork: v })(row.id)} />
      <span className="font-mono text-[11px] text-muted">Responded</span>
      <DateIn label="Date responded" value={row.responded} onChange={v => save({ responded: v || null })(row.id)} />
      {!row.responded && <Mini onClick={() => save({ responded: t })(row.id)}>Today</Mini>}
    </span>
  );
}

function VcTrigger({ row, lookups, t, fields = ['status', 'decision', 'pause'] }) {
  const save = useEdit('variations');
  if (!row) return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {fields.includes('status') && <Sel label="Variation status" value={row.status} onChange={v => save({ status: v || null })(row.id)} blank="No status" options={lookups.vcStatuses || []} />}
      {fields.includes('requested') && <><span className="font-mono text-[11px] text-muted">Requested</span><DateIn label="Change request date" value={row.requested} onChange={v => save({ requested: v || null })(row.id)} /></>}
      {fields.includes('decision') && <><span className="font-mono text-[11px] text-muted">Decided</span><DateIn label="Decision date" value={row.decision} onChange={v => save({ decision: v || null })(row.id)} />
        {!row.decision && <Mini onClick={() => save({ decision: t })(row.id)}>Today</Mini>}</>}
      {fields.includes('pause') && <Sel label="Pause override" value={row.pauseOverride} onChange={v => save({ pauseOverride: v || null })(row.id)} blank={row.type ? `By type (${row.type})` : 'By type (none)'} options={lookups.vcPause || []} />}
    </span>
  );
}

function ItemTrigger({ row, t }) {
  const save = useEdit('tasks');
  if (!row) return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[11px] text-muted">WO raised</span>
      <DateIn label="WO raised" value={row.dates?.woRaised} onChange={v => save({ woRaised: v || null })(row.id)} />
      {!row.dates?.woRaised && <Mini onClick={() => save({ woRaised: t })(row.id)}>Today</Mini>}
      <Check label="Lock Status" checked={row.lockStatus} onChange={v => save({ lockStatus: v })(row.id)} />
    </span>
  );
}

function ItemRow({ r, d, lookups, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-line last:border-b-0">
      <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 hover:bg-surface-hi">
        {onSelect && <input type="checkbox" aria-label={`Select ${r.title}`} checked={selected} onChange={e => onSelect(e.target.checked)} className="w-5 h-5 accent-accent" />}
        <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="min-h-11 min-w-11 -ml-2 flex items-center justify-center bg-transparent border-0 text-muted cursor-pointer" aria-label={open ? 'Hide position' : 'Show position'}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <span className="flex-1 min-w-[200px]">
          <Ext href={r.url}>{r.title || 'Untitled'}</Ext>
          <span className="block font-mono text-[12px] text-muted">{[r.project, r.locked && 'locked', r.drawings.length && `${r.drawings.length} drawing${r.drawings.length === 1 ? '' : 's'} to update`].filter(Boolean).join(' · ')}</span>
        </span>
        <Move from={r.from} to={r.to} />
        <span className="w-full sm:w-auto sm:max-w-[48ch] text-[13px] text-muted">{r.reason}</span>
        <PositionSummary itemId={r.id} d={d} className="w-full pl-14" />
      </div>
      {open && <div className="px-4 pb-3 pl-6 sm:pl-14"><ItemPosition itemId={r.id} d={d} lookups={lookups} /></div>}
    </li>
  );
}

function BatchBar({ rows, busy, onApply, onDone }) {
  const update = useUpdateRecord('tasks');
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = async set => {
    setSaving(true);
    let ok = 0;
    for (const r of rows) { try { await update.mutateAsync({ id: r.id, set }); ok++; } catch { /* counted below */ } }
    setSaving(false);
    toast.show(`${ok} of ${rows.length} items locked${set.status ? ` at ${set.status}` : ''}`, { tone: ok === rows.length ? 'ok' : 'danger' });
    onDone();
  };
  const off = busy || saving;
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 p-3 bg-surface-hi border border-accent">
      <span className="font-semibold mr-1">{rows.length} selected</span>
      {onApply && <Button disabled={off} onClick={onApply}>{busy ? 'Applying…' : 'Apply derived'}</Button>}
      <span className="font-mono text-[12px] text-muted">or override:</span>
      <Sel label="Item status" value={status} onChange={setStatus} blank="Status…" options={STATUSES} />
      <Button variant="secondary" disabled={off || !status} onClick={() => lock({ status, lockStatus: true })}>Set &amp; lock</Button>
      <Button variant="secondary" disabled={off} onClick={() => lock({ lockStatus: true })}>Lock as is</Button>
      <Button variant="secondary" className="ml-auto" disabled={off} onClick={onDone}>Clear</Button>
    </div>
  );
}

function GapRow({ g, x, d, lookups }) {
  const find = db => d.all[db]?.find(r => r.id === x.id);
  return (
    <li className="px-4 py-2.5 border-b border-line last:border-b-0 flex flex-col gap-1">
      <span className="text-[14px]"><Ext href={x.url}>{x.title}</Ext> <span className="font-mono text-[12px] text-muted">{x.sub}</span></span>
      {g.id === 'rfi-open-undecided' && <RfiTrigger row={find('rfis')} t={d.today} />}
      {g.id === 'rfi-closed-held' && <RfiTrigger row={find('rfis')} t={d.today} />}
      {g.id === 'vc-no-date' && <VcTrigger row={find('variations')} lookups={lookups} t={d.today} fields={['requested', 'status']} />}
      {g.id === 'vc-no-type' && <VcTrigger row={find('variations')} lookups={lookups} t={d.today} fields={['pause', 'status']} />}
      {g.id === 'vc-decided-held' && <VcTrigger row={find('variations')} lookups={lookups} t={d.today} fields={['decision', 'status']} />}
      {g.id === 'wo-missing' && <ItemTrigger row={find('tasks')} t={d.today} />}
    </li>
  );
}

function Gaps({ gaps, d, lookups }) {
  const [open, setOpen] = useState(() => new Set());
  if (!gaps.length) return <Card className="p-6 text-center text-[14px] text-muted">No gaps: every trigger field the rules need is filled in.</Card>;
  return gaps.map(g => {
    const isOpen = open.has(g.id);
    return (
      <Card key={g.id}>
        <h3 className="m-0">
          <button type="button" aria-expanded={isOpen} onClick={() => setOpen(s => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })}
            className="w-full min-h-12 px-4 py-2 flex items-center gap-3 bg-transparent border-0 cursor-pointer text-left text-text hover:bg-surface-hi">
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span className="flex-1"><span className="text-[15px] font-semibold">{g.title}</span><span className="block text-[13px] text-muted font-normal">{g.why}</span></span>
            <Badge tone="accent" className="py-1">{g.count}</Badge>
          </button>
        </h3>
        {isOpen && <ul className="m-0 p-0 list-none border-t border-line">{g.rows.slice(0, 100).map(x => <GapRow key={x.id} g={g} x={x} d={d} lookups={lookups} />)}</ul>}
        {isOpen && g.rows.length > 100 && <p className="m-0 px-4 py-2 font-mono text-[12px] text-muted">First 100 of {g.rows.length} shown.</p>}
      </Card>
    );
  });
}

export function StatusReview({ project, d }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: boot } = useBootstrap();
  const lookups = boot?.lookups || {};
  const { data, isPending, error } = useQuery({ queryKey: PLAN_KEY, queryFn: () => api('/api/item-status/plan') });
  const [view, setView] = useState('changes');
  const [to, setTo] = useState('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const inProject = r => !project || r.projectId === project;
  const lists = useMemo(() => {
    if (!data) return {};
    const needle = q.trim().toLowerCase();
    const match = r => inProject(r) && (!needle || [r.title, r.project, r.from, r.to, r.reason, ...r.blockers.map(b => b.name)].filter(Boolean).join(' ').toLowerCase().includes(needle));
    return { changes: data.changes.filter(r => match(r) && (to === 'all' || r.to === to)), held: data.held.filter(match), locked: data.locked.filter(match) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, project, q, to]);
  const gaps = useMemo(() => (data?.gaps || []).map(g => { const rows = g.rows.filter(x => !project || x.projectId === project); return { ...g, rows, count: rows.length }; }).filter(g => g.count), [data, project]);
  const toCounts = useMemo(() => {
    const m = {};
    for (const r of (data?.changes || []).filter(inProject)) m[r.to] = (m[r.to] || 0) + 1;
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, project]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: PLAN_KEY });
    qc.invalidateQueries({ queryKey: keys.snapshot('tasks') });
    qc.invalidateQueries({ queryKey: keys.snapshot('drawings') });
    qc.invalidateQueries({ queryKey: keys.bootstrap });
  };
  const apply = async ids => {
    setBusy(true);
    let done = 0, failed = 0;
    try {
      // The server stops after ~8 s, so loop until everything asked for is written.
      while (ids.length) {
        const r = await api('/api/item-status/apply', { method: 'POST', body: { ids } });
        done += r.done.length; failed += r.failed.length;
        if (!r.done.length) break;
        const gone = new Set([...r.done, ...r.failed].map(x => x.id));
        ids = ids.filter(id => !gone.has(id));
      }
      toast.show(`Status updated on ${done} item${done === 1 ? '' : 's'}${failed ? ` · ${failed} failed` : ''}`, failed ? { tone: 'danger' } : undefined);
    } catch (e) {
      toast.show(`Not applied: ${e.message}`, { tone: 'danger', ms: 8000 });
    } finally {
      setBusy(false);
      setSel(new Set());
      refresh();
    }
  };

  if (isPending) return <Card className="p-4"><SkeletonRows rows={8} /></Card>;
  if (error) return <Card className="p-4 text-[14px] text-danger">Couldn’t work out the plan: {error.message}</Card>;

  const rows = lists[view] || [];
  const selRows = rows.filter(r => sel.has(r.id));
  const selectable = view !== 'gaps';
  const gapCount = gaps.reduce((n, g) => n + g.count, 0);
  const count = { changes: lists.changes.length, held: lists.held.length, locked: lists.locked.length, gaps: gapCount };
  return (
    <div className="flex flex-col gap-3">
      <p className={cx('m-0 px-4 py-3 border border-line border-l-4 text-[13px]', data.mode === 'on' ? 'border-l-ok' : 'border-l-accent')}>{MODE_TEXT[data.mode] || MODE_TEXT.dry}</p>
      <p className="m-0 font-mono text-[12px] text-muted max-w-[110ch]">
        Rule, first match wins: Lock Status or Omitted → leave · pausing variation (Change Request → Decision date), stop-work RFI (Raised → Responded) or a Blocked submission → Blocked, unless Design Complete ·
        works order and every drawing Complete → Design Complete · works order (WO Raised, PRD issued or production scheduled) → In Production · DT started or any submission → In Progress · else To Do.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map(v => (
          <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => { setView(v.id); setSel(new Set()); }}
            className={cx('min-h-11 px-3 border font-mono text-[12px] cursor-pointer', view === v.id ? 'bg-surface-hi border-accent text-accent' : 'bg-transparent border-line-strong text-muted hover:text-text-2')}>
            {v.label} · {count[v.id]}
          </button>
        ))}
      </div>
      {view !== 'gaps' && (
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox value={q} onChange={setQ} />
          {view === 'changes' && <Sel label="New status" value={to === 'all' ? '' : to} onChange={v => setTo(v || 'all')} blank="Any new status" options={Object.entries(toCounts).map(([k, n]) => ({ value: k, label: `${k} · ${n}` }))} />}
          {view === 'changes' && <Button className="ml-auto" disabled={busy || rows.length === 0} onClick={() => apply(rows.map(r => r.id))}>{busy ? 'Applying…' : `Apply all ${rows.length}`}</Button>}
        </div>
      )}
      {selectable && selRows.length > 0 && (
        <BatchBar rows={selRows} busy={busy} onApply={view === 'changes' ? () => apply(selRows.map(r => r.id)) : null} onDone={() => { setSel(new Set()); refresh(); }} />
      )}
      {view === 'gaps' ? <Gaps gaps={gaps} d={d} lookups={lookups} /> : (
        <Card>
          {rows.length === 0 ? <p className="m-0 p-6 text-center text-[14px] text-muted">{{ changes: 'Every item’s status matches the rule.', held: 'Nothing is holding any item.', locked: 'No items are locked.' }[view]}</p> : (
            <ul className="m-0 p-0 list-none">
              <li className="px-4 py-1 border-b border-line"><Check label={`Select all ${rows.length}`} checked={selRows.length === rows.length} onChange={v => setSel(v ? new Set(rows.map(r => r.id)) : new Set())} /></li>
              {rows.map(r => <ItemRow key={r.id} r={r} d={d} lookups={lookups} selected={sel.has(r.id)} onSelect={v => setSel(s => { const n = new Set(s); if (v) n.add(r.id); else n.delete(r.id); return n; })} />)}
            </ul>
          )}
        </Card>
      )}
      {view === 'locked' && <p className="m-0 font-mono text-[12px] text-muted">Locked items keep a hand-set status (e.g. proceeding at risk). Untick Lock Status in a row’s triggers to hand it back to the rule.</p>}
    </div>
  );
}
