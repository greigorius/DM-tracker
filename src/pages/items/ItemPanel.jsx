// The item side panel (spec claude/item-tracker-spec.md §3.2): the item's
// current position, editable on the fly. Every field saves on change
// (optimistic, rolled back with a toast if Notion refuses). Status and Ball in
// Court are derived by the sync, so they are shown with their reason and
// changed by editing the record that drives them.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, ArrowRight } from 'lucide-react';
import { Badge, cx, useToast } from '../../components/ui/index.js';
import { useUpdateRecord, useActionToTask, useCreateAction, useCreateRfi, useCreateVariation, useTaskToAction } from '../../hooks/hub.js';
import { ItemPosition, St } from '../brief/ItemPosition.jsx';
import { statusModel, bare } from '../brief/statusModel.js';
import { Sel, DateIn, Check, ctl } from '../brief/controls.jsx';
import { fmtDay } from '../brief/shared.jsx';
import { StageGrid } from '../programme/parts.jsx';
import { deriveItemBic } from '../../../hub-core/item-bic.js';
import { Responsible } from '../actions/Responsible.jsx';
import { bicSet } from '../actions/party.js';
import { useActiveMeeting } from '../meetings/useMeeting.js';

const TODO_STATUSES = ['Not Started', 'In Progress', 'Blocked', 'Done'];
const has = (ids, id) => (ids || []).some(x => bare(x) === bare(id));

function Section({ title, count, children, right }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="m-0 flex items-center justify-between gap-3 section-label text-[11px] font-normal">
        <span>{title}{count != null && <span className="text-muted"> · {count}</span>}</span>{right}
      </h3>
      {children}
    </section>
  );
}

function useSave(db) {
  const update = useUpdateRecord(db);
  const toast = useToast();
  return (id, set, ok) => update.mutate({ id, set }, {
    onSuccess: () => ok && toast.show(ok),
    onError: e => toast.show(`Not saved: ${e.message}`, { tone: 'danger' }),
  });
}

// Text that saves when you leave the field (or press Enter)
function InlineText({ value, onSave, label, className }) {
  const [v, setV] = useState(value || '');
  const commit = () => { const t = v.trim(); if (!t) { setV(value || ''); return; } if (t !== (value || '')) onSave(t); };
  return (
    <input type="text" aria-label={label} value={v} onChange={e => setV(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setV(value || ''); e.currentTarget.blur(); } }}
      className={cx('min-h-9 px-2 bg-transparent border border-transparent hover:border-line-strong focus:border-accent focus:bg-ground text-text text-[14px] outline-none w-full', className)} />
  );
}

// ── Quick add (§3.2): one line, Enter saves, linked to the item ─────────────
const KINDS = [
  { id: 'Note', label: 'Note', ph: 'Note (info)…' },
  { id: 'Action', label: 'Action', ph: 'Action…' },
  { id: 'rfi', label: 'RFI', ph: 'RFI question…' },
  { id: 'vc', label: 'Variation', ph: 'Variation description…' },
];
function QuickAdd({ itemId }) {
  const [kind, setKind] = useState('Note');
  const [text, setText] = useState('');
  const action = useCreateAction(), rfi = useCreateRfi(), vc = useCreateVariation();
  const { id: meetingId } = useActiveMeeting();
  const m = meetingId ? { meetingId } : {};
  const toast = useToast();
  const fail = e => toast.show(`Not added: ${e.message}`, { tone: 'danger' });
  const add = () => {
    const t = text.trim();
    if (!t) return;
    if (kind === 'rfi') rfi.mutate({ itemId, question: t, bic: 'DM', ...m }, { onError: fail });
    else if (kind === 'vc') vc.mutate({ itemId, description: t, raisedBy: 'DM', ...m }, { onError: fail });
    else action.mutate({ itemId, type: kind, text: t, bic: 'DM', ...m }, { onError: fail });
    setText('');
  };
  const k = KINDS.find(x => x.id === kind);
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-surface border border-line">
      <span role="radiogroup" aria-label="Add" className="flex">
        {KINDS.map(x => (
          <button key={x.id} type="button" role="radio" aria-checked={kind === x.id} onClick={() => setKind(x.id)}
            className={cx('min-h-11 px-3 border -ml-px first:ml-0 font-mono text-[12px] cursor-pointer', kind === x.id ? 'bg-surface-hi text-accent border-accent relative z-10' : 'bg-transparent text-text-2 border-line-strong')}>
            + {x.label}
          </button>
        ))}
      </span>
      <input type="text" aria-label={k.ph} placeholder={k.ph} value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') add(); }} className={cx(ctl, 'flex-1 min-w-[220px]')} />
      <button type="button" onClick={add} disabled={!text.trim()} className="min-h-11 px-4 border border-accent text-accent bg-transparent font-mono text-[12px] uppercase tracking-[0.08em] cursor-pointer disabled:opacity-40 disabled:cursor-default">Add</button>
    </div>
  );
}

// ── Actions & notes (§3.2 item 6) ───────────────────────────────────────────
export function ActionRow({ a, itemId, lookups, today, team, suppliers }) {
  const save = useSave('actions');
  const toTask = useActionToTask();
  const toast = useToast();
  const isNote = a.type === 'Note';
  const overdue = !isNote && !a.done && a.due && a.due < today;
  const flip = () => save(a.id, isNote ? { type: 'Action', ...(!a.bic && { bic: 'DM' }) } : { type: 'Note' }, isNote ? 'Now an action' : 'Now a note');
  // mutateAsync, not mutate(…, callbacks): the row drops out of open-action
  // lists as soon as it's ticked, and mutate's per-call callbacks never fire
  // once the row has unmounted, so a failure reverted silently.
  const move = () => toTask.mutateAsync({ id: a.id, task: { itemId: a.itemIds?.[0] || itemId } })
    .then(r => toast.show(`Moved to Tasks${r?.row?.number != null ? ` (TD-${String(r.row.number).padStart(3, '0')})` : ''} · action closed`))
    .catch(e => toast.show(`Not moved to Tasks: ${e.message}`, { tone: 'danger' }));
  return (
    <li className={cx('flex flex-col gap-1 pl-3 border-l-2', a.blocks && !a.done && !isNote ? 'border-danger' : isNote ? 'border-line' : 'border-accent', a.done && 'opacity-60')}>
      <span className="flex items-center gap-2">
        <button type="button" onClick={flip} title={isNote ? 'Make this an action' : 'Make this a note'}
          className={cx('shrink-0 min-h-7 px-2 border font-mono text-[11px] cursor-pointer bg-transparent', isNote ? 'border-line-strong text-muted' : 'border-accent text-accent')}>
          {isNote ? 'Note' : 'Action'}
        </button>
        <InlineText key={`${a.id}:${a.title}`} value={a.title} label="Text" onSave={t => save(a.id, { title: t })} />
      </span>
      <span className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-muted">
        {!isNote && <>
          <Sel label="Sits with" value={a.bic} onChange={v => save(a.id, bicSet(a, v, team))} blank="Sits with…" options={lookups.actionBic || []} />
          <span className="w-[220px]"><Responsible row={a} team={team} suppliers={suppliers} save={set => save(a.id, set)} compact /></span>
          <DateIn label="Due" value={a.due} onChange={v => save(a.id, { due: v || null })} />
          {overdue && <Badge tone="danger">Overdue</Badge>}
          <Check label="Blocks item" checked={a.blocks} onChange={v => save(a.id, { blocks: v })} />
          <Check label="Done" checked={a.done} onChange={v => save(a.id, { done: v })} />
        </>}
        {!a.done && !a.taskIds?.length && !(a.itemIds?.[0] || itemId) && <span className="text-accent" title="A To Do task has to sit on an item">Link an item to make it a task</span>}
        {!a.done && !a.taskIds?.length && (a.itemIds?.[0] || itemId) && (
          <button type="button" onClick={move} disabled={toTask.isPending} className="min-h-11 px-3 inline-flex items-center gap-1.5 border border-line-strong bg-transparent text-text-2 hover:bg-surface-hi font-mono text-[12px] cursor-pointer">
            <ArrowRight size={13} aria-hidden="true" /> Task
          </button>
        )}
        {a.taskIds?.length > 0 && <Badge tone="ok">In Tasks</Badge>}
        <span>{[a.source, fmtDay(a.received || a.createdAt)].filter(Boolean).join(' · ')}</span>
        {isNote && <Check label="Archive" checked={a.done} onChange={v => save(a.id, { done: v })} />}
      </span>
    </li>
  );
}

// ── To-dos (§3.2 item 7) ────────────────────────────────────────────────────
export function TodoRow({ t, people, actions, lookups }) {
  const save = useSave('todo');
  const toAction = useTaskToAction();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [bic, setBic] = useState('DT');
  const [keep, setKeep] = useState(true);
  const waiting = actions.filter(a => !a.archived && !a.done && (a.forTaskIds || []).includes(t.id));
  const convert = () => toAction.mutateAsync({ id: t.id, bic, keep })
    .then(() => { setOpen(false); toast.show(keep ? 'Chase action raised; the task is Blocked until it closes' : 'Now an action; the To Do is in Notion Trash for 30 days'); })
    .catch(e => toast.show(`Not converted: ${e.message}`, { tone: 'danger' }));
  return (
    <li className={cx('flex flex-col gap-1 pl-3 border-l-2', t.done ? 'border-line opacity-60' : t.status === 'Blocked' ? 'border-danger' : 'border-ok')}>
      <InlineText key={`${t.id}:${t.title}`} value={t.title} label="To-do" onSave={v => save(t.id, { title: v })} />
      <span className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-muted">
        {t.number != null && <span>TD-{String(t.number).padStart(3, '0')}</span>}
        <Sel label="Status" value={t.status} onChange={v => save(t.id, { status: v || 'Not Started' })} blank="Status…" options={TODO_STATUSES} />
        <Sel label="Person" value={t.personIds?.[0] || ''} onChange={v => save(t.id, { personId: v || null })} blank="Unassigned" options={people} />
        <span>End</span><DateIn label="End date" value={t.end} onChange={v => save(t.id, { end: v || null })} />
        <span>Est h</span><input type="number" min="0" step="0.5" aria-label="Estimated hours" defaultValue={t.hours ?? ''} onBlur={e => { if (String(e.target.value) !== String(t.hours ?? '')) save(t.id, { hours: e.target.value }); }} className={cx(ctl, 'w-20')} />
        {waiting.map(a => <span key={a.id} title={a.title}><Badge tone="danger">waiting on {a.bic || 'action'}</Badge></span>)}
        {!t.done && !open && <button type="button" onClick={() => setOpen(true)} className="min-h-11 px-3 inline-flex items-center gap-1.5 border border-line-strong bg-transparent text-text-2 hover:bg-surface-hi font-mono text-[12px] cursor-pointer"><ArrowRight size={13} aria-hidden="true" /> Chase / action</button>}
      </span>
      {open && (
        <span className="flex flex-col gap-1.5 p-2 border border-accent text-[13px] text-text-2">
          <span className="flex flex-wrap items-center gap-2">Chase action sits with <Sel label="Ball in court" value={bic} onChange={v => setBic(v || 'DT')} options={lookups.actionBic || []} /></span>
          <label className="flex items-start gap-2 cursor-pointer"><input type="radio" checked={keep} onChange={() => setKeep(true)} className="mt-1" /><span><b>Keep the task</b>: stays Blocked with its {t.hours ? `${t.hours} h` : 'hours'} estimate until the chase closes.</span></label>
          <label className="flex items-start gap-2 cursor-pointer"><input type="radio" checked={!keep} onChange={() => setKeep(false)} className="mt-1" /><span><b>Replace the task</b>: not DT work; the To Do goes to Notion Trash.</span></label>
          <span className="flex gap-2">
            <button type="button" onClick={convert} disabled={toAction.isPending} className="min-h-11 px-3 border border-accent text-accent bg-transparent font-mono text-[12px] cursor-pointer">{keep ? 'Raise chase action' : 'Replace with action'}</button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 border border-line-strong text-text-2 bg-transparent font-mono text-[12px] cursor-pointer">Cancel</button>
          </span>
        </span>
      )}
    </li>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────
export function ItemPanel({ item, d, prog, todos, lookups, bicCtx, isCoord, onClose }) {
  const today = d.today;
  const save = useSave('tasks');
  const [showDoneActions, setShowDoneActions] = useState(false);
  const [allActivity, setAllActivity] = useState(false);

  const actions = useMemo(() => d.all.actions.filter(a => !a.archived && has(a.itemIds, item.id))
    .sort((a, b) => (a.done - b.done) || String(b.received || b.createdAt).localeCompare(String(a.received || a.createdAt))), [d.all.actions, item.id]);
  const itemTodos = useMemo(() => todos.filter(t => !t.archived && has(t.itemIds, item.id)).sort((a, b) => (a.done - b.done) || String(a.end || '9').localeCompare(String(b.end || '9'))), [todos, item.id]);
  const activity = useMemo(() => d.all.activity.filter(x => !x.archived && has(x.itemIds, item.id)).sort((a, b) => String(b.at).localeCompare(String(a.at))), [d.all.activity, item.id]);
  const suppliers = useMemo(() => (d.all.suppliers || []).filter(x => !x.archived).map(x => ({ value: x.id, label: x.title || 'Untitled' })).sort((a, b) => a.label.localeCompare(b.label)), [d.all.suppliers]);
  const people = useMemo(() => [...d.all.team].filter(p => !p.archived).sort((a, b) => (a.title || '').localeCompare(b.title || '')).map(p => ({ value: p.id, label: p.title })), [d.all.team]);

  const rule = statusModel(d).items.get(bare(item.id));
  const bic = deriveItemBic(item, bicCtx);
  const openActions = actions.filter(a => !a.done);
  const doneActions = actions.length - openActions.length;
  const shown = showDoneActions ? actions : openActions;

  return (
    <section aria-label="Selected item" className="flex-1 min-w-0 w-full flex flex-col gap-6 scroll-mt-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5 min-w-0">
          <span className="font-mono text-[12px] text-muted">{d.projects.get(item.projectId) || 'No project'}{isCoord ? ' · Design Coordination' : ''}</span>
          <h2 className="m-0 text-[24px] font-semibold leading-tight">{item.title || 'Untitled'}</h2>
        </div>
        <span className="flex gap-2">
          {prog && <Link to={`/programme/${item.projectId}?tab=review&item=${item.id}`} className="min-h-11 px-3 inline-flex items-center border border-line-strong text-text-2 no-underline font-mono text-[12px] uppercase tracking-[0.08em] hover:bg-surface-hi">Programme</Link>}
          <a href={item.url} target="_blank" rel="noreferrer" className="min-h-11 px-3 inline-flex items-center gap-2 border border-line-strong text-text-2 no-underline font-mono text-[12px] uppercase tracking-[0.08em] hover:bg-surface-hi">
            Notion <ExternalLink size={13} aria-hidden="true" />
          </a>
          {onClose && <button type="button" onClick={onClose} className="min-h-11 px-3 border border-line-strong bg-transparent text-text-2 cursor-pointer lg:hidden">Back</button>}
        </span>
      </div>

      <div className="grid gap-px bg-line border border-line" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="flex flex-col gap-1.5 p-4 bg-surface">
          <span className="section-label text-[11px]">Status</span>
          <St v={item.status} />
          <span className="text-[12px] text-muted">{rule ? (rule.locked ? 'Locked' : rule.proposed !== rule.current ? `Rule says ${rule.proposed} · next sync` : rule.reason) : 'Set by the sync'}</span>
        </div>
        <div className="flex flex-col gap-1.5 p-4 bg-surface">
          <span className="section-label text-[11px]">Ball in court</span>
          <span className="font-mono text-[16px]">{(bic.skip ? item.bic : bic.bic) || '—'}</span>
          <span className="text-[12px] text-muted">{bic.skip ? `${bic.skip} (manual)` : bic.reason}{!bic.skip && (bic.bic || null) !== (item.bic || null) ? ' · next sync' : ''}</span>
        </div>
        <div className="flex flex-col gap-1.5 p-4 bg-surface">
          <span className="section-label text-[11px]">DT</span>
          <Sel label="Assigned DT" value={item.dtIds?.[0] || ''} onChange={v => save(item.id, { dtId: v || null }, 'DT updated')} blank="Unassigned" options={d.dts.map(x => ({ value: x.id, label: x.name }))} />
          {(() => { const others = d.drawingDts(item.id).filter(id => !item.dtIds?.includes(id)); return others.length ? <span className="text-[12px] text-muted">Also drawing: {others.map(d.personName).filter(Boolean).join(', ')}</span> : null; })()}
        </div>
        {prog?.next && (
          <div className="flex flex-col gap-1.5 p-4 bg-surface">
            <span className="section-label text-[11px]">Next</span>
            <span className="font-mono text-[16px]">{prog.next.label}</span>
            <span className="text-[12px] text-muted">{fmtDay(prog.next.date)}</span>
          </div>
        )}
      </div>

      <QuickAdd itemId={item.id} />

      {!isCoord && (
        <Section title="Programme">
          {prog ? <StageGrid item={prog} today={today} /> : <span className="text-[13px] text-muted">Not on the programme (project not live, or item closed).</span>}
        </Section>
      )}

      <Section title="Actions & notes" count={openActions.length}
        right={doneActions > 0 && <button type="button" onClick={() => setShowDoneActions(s => !s)} className="bg-transparent border-0 p-0 font-mono text-[11px] text-muted cursor-pointer hover:text-text-2 normal-case tracking-normal">{showDoneActions ? 'Hide' : 'Show'} {doneActions} closed</button>}>
        {shown.length ? (
          <ul className="m-0 p-0 list-none flex flex-col gap-3">{shown.map(a => <ActionRow key={a.id} a={a} itemId={item.id} lookups={lookups} today={today} team={d.all.team} suppliers={suppliers} />)}</ul>
        ) : <span className="text-[13px] text-muted">None</span>}
      </Section>

      <Section title="Status, RFIs, variations, drawings">
        <ItemPosition itemId={item.id} d={d} lookups={lookups} />
      </Section>

      <Section title="To-dos" count={itemTodos.filter(t => !t.done).length}>
        {itemTodos.length ? <ul className="m-0 p-0 list-none flex flex-col gap-3">{itemTodos.map(t => <TodoRow key={t.id} t={t} people={people} actions={d.all.actions} lookups={lookups} />)}</ul>
          : <span className="text-[13px] text-muted">None · use → Task on an action to add one</span>}
      </Section>

      <Section title="Activity" count={activity.length}
        right={activity.length > 10 && <button type="button" onClick={() => setAllActivity(s => !s)} className="bg-transparent border-0 p-0 font-mono text-[11px] text-muted cursor-pointer hover:text-text-2 normal-case tracking-normal">{allActivity ? 'Last 10' : 'Show all'}</button>}>
        {activity.length ? (
          <ul className="m-0 p-0 list-none flex flex-col gap-1">
            {(allActivity ? activity : activity.slice(0, 10)).map(x => (
              <li key={x.id} className="flex gap-3 text-[13px]"><span className="shrink-0 w-24 font-mono text-[12px] text-muted">{fmtDay(x.at)}</span><span className="text-text-2">{x.title}</span></li>
            ))}
          </ul>
        ) : <span className="text-[13px] text-muted">None</span>}
      </Section>
    </section>
  );
}
