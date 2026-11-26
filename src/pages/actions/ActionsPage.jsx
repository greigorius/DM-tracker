// Actions tracker (spec claude/item-tracker-spec.md §10): one chase list over
// A&I actions and To Do tasks, laid out like the Metalwork Close-Out prototype.
// Saved views give the meeting agenda (suppliers, external, internal, DTs, me);
// every field saves on change; Excel out and back in via Reconcile.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight, Download, Plus, Upload } from 'lucide-react';
import { PageShell, Card, Badge, SkeletonRows, cx, useToast } from '../../components/ui/index.js';
import { ToolbarSelect, SearchBox } from '../../components/ui/table.jsx';
import { useBootstrap, useSnapshots, useUpdateRecord, useActionToTask, useCreateAction, useTaskToAction } from '../../hooks/hub.js';
import { useStored } from '../brief/shared.jsx';
import { DateIn } from '../brief/controls.jsx';
import { londonToday } from '../../../hub-core/derive.js';
import { AI_STATUSES, TASK_STATUSES, TRADES, GROUPS, VIEWS, GROUP_BY, SORTS, DEFAULT_FILTER, buildRows, matches, dates, isOver, dueSoon, daysBetween } from './model.js';
import { exportActions } from './excel.js';
import { MeetingBar } from '../meetings/MeetingBar.jsx';
import { useActiveMeeting } from '../meetings/useMeeting.js';
import { ReconcilePanel } from './ReconcilePanel.jsx';
import { Responsible } from './Responsible.jsx';
import { bicSet, partyFor } from './party.js';

const DBS = ['actions', 'todo', 'tasks', 'suppliers', 'team', 'projects'];
const ctl = 'min-h-9 px-2 bg-ground border border-line-strong text-text text-[13px] outline-none focus:border-accent';
const BTN = 'min-h-11 px-3 inline-flex items-center gap-2 border border-line-strong bg-transparent text-text-2 hover:bg-surface-hi font-mono text-[12px] uppercase tracking-[0.08em] cursor-pointer disabled:opacity-40';
const GROUP_TONE = { supplier: 'text-accent', external: 'text-danger', internal: 'text-text-2', dt: 'text-ok', dm: 'text-info', none: 'text-muted' };
const STATUS_TONE = { 'Not issued': 'text-muted', Open: 'text-info', Chasing: 'text-accent', 'Response in': 'text-ok', Closed: 'text-muted', 'Moved to Tasks': 'text-ok', 'Not Started': 'text-muted', 'In Progress': 'text-info', Blocked: 'text-danger', Done: 'text-muted' };
const fmt = iso => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const bicTone = bic => GROUP_TONE[Object.keys(GROUPS).find(k => GROUPS[k].bics.includes(bic)) || 'none'];

function Pill({ value, options, onChange, label, tone, disabled, fallback }) {
  return (
    <select aria-label={label} value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value)}
      className={cx('w-full min-h-9 px-2 bg-surface border border-line-strong font-mono text-[12px] cursor-pointer outline-none focus:border-accent disabled:cursor-default disabled:opacity-80', tone)}>
      {!options.some(o => (typeof o === 'string' ? o : o.value) === (value || '')) && <option value={value || ''}>{fallback || value || '—'}</option>}
      {options.map(o => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}

function Text({ value, onSave, label, area, className }) {
  const [v, setV] = useState(value || '');
  const commit = () => { const t = v.trim(); if (t !== (value || '')) onSave(t); };
  const p = { 'aria-label': label, value: v, onChange: e => setV(e.target.value), onBlur: commit, className: cx(ctl, 'w-full', className) };
  return area ? <textarea rows={2} {...p} className={cx(p.className, 'py-1.5 resize-y')} /> : <input type="text" {...p} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
}

const Lbl = ({ children, className, ...p }) => <label className={cx('flex flex-col gap-1 min-w-0 font-mono text-[11px] uppercase tracking-[0.08em] text-muted', className)} {...p}>{children}</label>;

// ── Row ─────────────────────────────────────────────────────────────────────
function Row({ r, ctx, open, onToggle, groupBy }) {
  const { d, lookups, suppliers, people, items, team, toast } = ctx;
  const upd = useUpdateRecord(r.db);
  const toTask = useActionToTask();
  const toAction = useTaskToAction();
  const [confirm, setConfirm] = useState(false);
  const [convBic, setConvBic] = useState('DT');
  const [keep, setKeep] = useState(true);
  const save = set => upd.mutate({ id: r.id, set }, { onError: e => toast.show(`Not saved: ${e.message}`, { tone: 'danger' }) });
  const isA = r.src === 'Action';
  const setBic = v => save(bicSet(r.raw, v, team));
  const resp = <Responsible row={{ ...r.raw, id: r.id }} team={team} suppliers={suppliers} save={save} compact />;
  const over = isOver(r, d), soon = dueSoon(r, d);
  const stripe = over || (r.impact === 'blocking' && !r.closed) ? 'bg-danger' : soon ? 'bg-accent' : 'bg-transparent';
  const setStatus = s => (isA ? save(s === 'Closed' ? { done: true } : { chaseStatus: s, ...(r.closed && { done: false }) }) : save({ status: s }));
  const dueBadge = over ? <Badge tone="danger">{daysBetween(r.due, d.today)}d late</Badge>
    : soon ? <Badge tone="accent">{r.due === d.today ? 'today' : `in ${daysBetween(d.today, r.due)}d`}</Badge>
      : !r.due && !r.closed ? <Badge tone="muted">no date</Badge> : null;
  // mutateAsync so the toast still shows after the row leaves the filtered list
  const convert = () => toAction.mutateAsync({ id: r.id, bic: convBic, keep })
    .then(() => toast.show(keep ? `Chase action raised (sits with ${convBic}); ${r.ref} kept and set to Blocked until it closes` : `${r.ref} is now an action (sits with ${convBic}); the To Do is in Notion Trash for 30 days`, { ms: 8000 }))
    .catch(e => toast.show(`Not converted: ${e.message}`, { tone: 'danger' }));
  const move = () => toTask.mutateAsync({ id: r.id, task: { itemId: r.itemId } })
    .then(res => toast.show(`Moved to Tasks${res?.row?.number != null ? ` (TD-${String(res.row.number).padStart(3, '0')})` : ''} · action closed`))
    .catch(e => toast.show(`Not moved to Tasks: ${e.message}`, { tone: 'danger', ms: 10000 }));
  // Project comes from the item: changing it means picking an item in the new project
  const [proj, setProj] = useState(r.projectId || '');
  const projItems = items.filter(i => i.projectId === proj);

  return (
    <li className={cx('border-t border-line first:border-t-0', r.closed && 'opacity-60')}>
      <div className="grid items-center gap-x-3 pr-2 min-h-[52px] hover:bg-surface-hi grid-cols-[4px_84px_minmax(0,1fr)_28px] lg:grid-cols-[4px_84px_minmax(0,1fr)_140px_170px_120px_130px_28px]">
        <span className={cx('self-stretch', stripe)} />
        <span className="flex flex-col font-mono text-[11px] min-w-0">
          {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="text-info no-underline hover:underline">{r.ref}</a> : r.ref}
          <span className="text-muted text-[10px]">{r.src}</span>
        </span>
        <span className="flex flex-col gap-1 py-2 min-w-0">
          <button type="button" onClick={onToggle} title={r.title} className="text-left bg-transparent border-0 p-0 text-text text-[14px] font-medium truncate cursor-pointer">{r.title}</button>
          <span className="flex flex-wrap gap-1">
            {groupBy !== 'item' && r.itemName && <Badge tone="info">{r.itemName}</Badge>}
            {!r.itemName && <Badge tone="muted">No item</Badge>}
            {r.impact === 'blocking' && !r.closed && <Badge tone="danger">Blocking</Badge>}
            {groupBy !== 'project' && r.projectName && <Badge tone="muted">{r.projectName.split(' ')[0]}</Badge>}
            {r.trade.map(t => <Badge key={t} tone="muted">{t}</Badge>)}
            {r.moved && <Badge tone="ok">In Tasks</Badge>}
            {r.forTask?.map(ref => <Badge key={ref} tone="accent">for {ref}</Badge>)}
            {r.waitingOn?.map(w => <span key={w.id} title={w.title}><Badge tone="danger">waiting on {w.bic || 'action'}</Badge></span>)}
            {r.nextAction && <span className="font-mono text-[11px] text-text-2 truncate max-w-[360px]" title="Next action">→ {r.nextAction}</span>}
          </span>
        </span>
        <span className="hidden lg:block">
          {isA ? <Pill label="Ball in court" value={r.bic} options={lookups.actionBic || []} tone={bicTone(r.bic)} onChange={setBic} />
            : <span className="font-mono text-[12px] text-ok" title="To Do List tasks are DT drawing work: they always sit with the DT. Change the person on the right.">DT · task</span>}
        </span>
        <span className="hidden lg:flex flex-col min-w-0 text-[13px]">
          {isA ? <>
            {resp}
            {r.contact && partyFor(r.bic).kind === 'company' && <span className="font-mono text-[11px] text-muted truncate mt-0.5">{r.contact}</span>}
          </> : <Pill label="Person" value={r.personId || ''} fallback={r.person || 'Not in Team DB'} options={[{ value: '', label: 'Unassigned' }, ...people]} tone={r.personId ? 'text-text' : 'text-muted'} onChange={v => save({ personId: v || null })} />}
        </span>
        <span className="hidden lg:flex flex-col gap-0.5">
          <DateIn label="Due" value={r.due} onChange={v => save(isA ? { due: v || null } : { end: v || null })}
            className="bg-transparent border-0 p-0 font-mono text-[12px] text-text cursor-pointer outline-none" />
          {dueBadge}
        </span>
        <span className="hidden lg:block">
          <Pill label="Status" value={r.status} options={isA ? AI_STATUSES : TASK_STATUSES} tone={STATUS_TONE[r.status]} disabled={r.moved} onChange={setStatus} />
        </span>
        <button type="button" onClick={onToggle} aria-expanded={open} aria-label="Edit details" className="w-7 h-9 inline-flex items-center justify-center bg-transparent border-0 text-muted cursor-pointer">
          <ChevronRight size={16} className={cx('transition-transform', open && 'rotate-90')} aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div className="grid gap-3 p-4 lg:pl-[104px] bg-ground border-t border-dashed border-line grid-cols-2 lg:grid-cols-4">
          {/* Small screens: the columns above, here */}
          <div className="contents lg:hidden">
            {isA && <Lbl>Ball in court<Pill label="Ball in court" value={r.bic} options={lookups.actionBic || []} onChange={setBic} /></Lbl>}
            <Lbl>Due<DateIn label="Due" value={r.due} onChange={v => save(isA ? { due: v || null } : { end: v || null })} className={ctl} /></Lbl>
            <Lbl>Status<Pill label="Status" value={r.status} options={isA ? AI_STATUSES : TASK_STATUSES} disabled={r.moved} onChange={setStatus} /></Lbl>
            {isA && <Lbl>Responsible{resp}</Lbl>}
          </div>
          <Lbl className="col-span-2 lg:col-span-4">{isA ? 'Action' : 'Task'}<Text area label="Text" value={r.title} onSave={t => t && save({ title: t })} /></Lbl>
          <Lbl>Project
            <select value={proj} onChange={e => setProj(e.target.value)} className={ctl}>
              <option value="">Project…</option>
              {ctx.projects.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              {proj && !ctx.projects.some(p => p.value === proj) && <option value={proj}>{r.projectName || 'Current project'}</option>}
            </select>
          </Lbl>
          <Lbl>Item{proj !== (r.projectId || '') && <span className="text-accent normal-case tracking-normal"> · pick an item in the new project</span>}
            <select value={proj === (r.projectId || '') ? r.itemId || '' : ''} onChange={e => save({ itemIds: e.target.value ? [e.target.value] : [] })} className={ctl} disabled={!proj}>
              <option value="">{proj ? 'Item…' : 'Pick a project'}</option>
              {projItems.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}
            </select>
          </Lbl>
          {isA ? <>
            <Lbl className="col-span-2">Responsible ({r.bic || 'set ball in court'})<Responsible row={{ ...r.raw, id: r.id }} team={team} suppliers={suppliers} save={save} /></Lbl>
            <Lbl>Raised<DateIn label="Raised" value={r.raised} onChange={v => save({ received: v || null })} className={ctl} /></Lbl>
            <Lbl>Chase by<DateIn label="Chase by" value={r.chaseBy} onChange={v => save({ chaseBy: v || null })} className={ctl} /></Lbl>
            <Lbl className="col-span-2">Next action<Text label="Next action" value={r.nextAction} onSave={t => save({ nextAction: t || null })} /></Lbl>
            <Lbl className="col-span-2">Closes when<Text label="Closes when" value={r.closesWhen} onSave={t => save({ closesWhen: t || null })} /></Lbl>
            <Lbl className="col-span-2 lg:col-span-3">Trade
              <span className="flex flex-wrap gap-1.5 normal-case tracking-normal">
                {TRADES.map(t => {
                  const on = r.trade.includes(t);
                  return <button key={t} type="button" aria-pressed={on} onClick={() => save({ trade: on ? r.trade.filter(x => x !== t) : [...r.trade, t] })}
                    className={cx('min-h-9 px-2.5 border font-mono text-[12px] cursor-pointer', on ? 'border-accent text-accent bg-surface-hi' : 'border-line-strong text-muted bg-transparent')}>{t}</button>;
                })}
              </span>
            </Lbl>
            <Lbl>Holds the item
              <label className="min-h-9 inline-flex items-center gap-2 normal-case tracking-normal text-[13px] text-text-2 cursor-pointer">
                <input type="checkbox" checked={!!r.raw.blocks} onChange={e => save({ blocks: e.target.checked })} className="w-[18px] h-[18px] accent-[var(--color-accent)]" /> Blocks item
              </label>
            </Lbl>
            {r.log && <Lbl className="col-span-2 lg:col-span-4">Response log<pre className="m-0 p-2 bg-surface border border-line text-[12px] text-text-2 font-mono whitespace-pre-wrap max-h-28 overflow-y-auto normal-case tracking-normal">{r.log}</pre></Lbl>}
            <div className="col-span-2 lg:col-span-4 flex flex-wrap items-center gap-2">
              {!r.moved && !r.closed && (confirm
                ? <span className="flex flex-wrap items-center gap-2 px-3 py-1.5 border border-accent text-[13px]">Create a To Do for this and close the action?
                    <button type="button" className={BTN} onClick={() => { setConfirm(false); move(); }} disabled={!r.itemId}>Move to Tasks</button>
                    <button type="button" className={BTN} onClick={() => setConfirm(false)}>Cancel</button>
                    {!r.itemId && <span className="text-danger">Link an item first</span>}
                  </span>
                : <button type="button" className={BTN} onClick={() => setConfirm(true)}>Move to Tasks</button>)}
              {r.closed && !r.moved ? <button type="button" className={BTN} onClick={() => save({ done: false })}>Reopen</button>
                : !r.closed && <button type="button" className={BTN} onClick={() => save({ done: true })}>Mark closed</button>}
              <span className="font-mono text-[11px] text-muted">{[r.source, r.from && `from ${r.from}`, r.closedOn && `closed ${fmt(r.closedOn)}`].filter(Boolean).join(' · ')}</span>
            </div>
          </> : <>
            <Lbl>Person<Pill label="Person" value={r.personId || ''} options={[{ value: '', label: 'Unassigned' }, ...people]} onChange={v => save({ personId: v || null })} /></Lbl>
            <Lbl>Start<DateIn label="Start" value={r.start} onChange={v => save({ start: v || null })} className={ctl} /></Lbl>
            <Lbl>Est hours<input type="number" min="0" step="0.5" defaultValue={r.hours ?? ''} onBlur={e => { const n = e.target.value; if (String(n) !== String(r.hours ?? '')) save({ hours: n }); }} className={ctl} /></Lbl>
            <Lbl>Variation work
              <label className="min-h-9 inline-flex items-center gap-2 normal-case tracking-normal text-[13px] text-text-2 cursor-pointer">
                <input type="checkbox" checked={!!r.changeTask} onChange={e => save({ changeTask: e.target.checked })} className="w-[18px] h-[18px] accent-[var(--color-accent)]" /> Change task
              </label>
            </Lbl>
            <div className="col-span-2 lg:col-span-4 flex flex-wrap items-center gap-2">
              {confirm
                ? <span className="flex flex-col gap-2 px-3 py-2 border border-accent text-[13px] normal-case tracking-normal">
                    <span className="flex flex-wrap items-center gap-2">Chase action sits with
                      <select aria-label="Ball in court" value={convBic} onChange={e => setConvBic(e.target.value)} className={ctl}>{(lookups.actionBic || []).map(b => <option key={b}>{b}</option>)}</select>
                    </span>
                    <label className="flex items-start gap-2 cursor-pointer"><input type="radio" name={`keep-${r.id}`} checked={keep} onChange={() => setKeep(true)} className="mt-1 accent-[var(--color-accent)]" />
                      <span><b>Keep the task</b> (recommended): {r.ref} stays with its {r.hours ? `${r.hours} h estimate` : 'estimate (none entered yet; add it below)'}, set to Blocked until the chase action closes, then back to Not Started.</span></label>
                    <label className="flex items-start gap-2 cursor-pointer"><input type="radio" name={`keep-${r.id}`} checked={!keep} onChange={() => setKeep(false)} className="mt-1 accent-[var(--color-accent)]" />
                      <span><b>Replace the task</b>: it isn't DT work. The To Do goes to Notion Trash (30 days){r.hours ? ` and its ${r.hours} h estimate leaves the Team page and hours split` : ''}.</span></label>
                    <span className="flex gap-2">
                      <button type="button" className={BTN} disabled={toAction.isPending} onClick={() => { setConfirm(false); convert(); }}>{keep ? 'Raise chase action' : 'Replace with action'}</button>
                      <button type="button" className={BTN} onClick={() => setConfirm(false)}>Cancel</button>
                    </span>
                  </span>
                : <button type="button" className={BTN} onClick={() => setConfirm(true)}>Chase / convert to action</button>}
              <span className="font-mono text-[11px] text-muted">DT task (To Do List): hours and dates feed the Team page and the contract/variation hours split. Convert it when it's really something to chase.</span>
            </div>
          </>}
        </div>
      )}
    </li>
  );
}

// ── New action ──────────────────────────────────────────────────────────────
function NewAction({ ctx, onClose }) {
  const { lookups, suppliers, items, projects, team, toast } = ctx;
  const create = useCreateAction();
  const { id: meetingId } = useActiveMeeting();
  const [f, setF] = useState({ text: '', project: '', itemId: '', bic: 'Supplier', companyId: '', personId: '', contact: '', due: '', blocks: false, trade: [], closesWhen: '', nextAction: '' });
  const put = k => v => setF(x => ({ ...x, [k]: v }));
  const add = () => {
    if (!f.text.trim()) return;
    create.mutate({ type: 'Action', meetingId: meetingId || undefined, text: f.text.trim(), itemId: f.itemId || null, bic: f.bic, companyId: f.companyId || null, personId: f.personId || null, contact: f.contact || null, due: f.due || null, blocks: f.blocks, trade: f.trade, closesWhen: f.closesWhen || null, nextAction: f.nextAction || null }, {
      onSuccess: () => toast.show('Action added'), onError: e => toast.show(`Not added: ${e.message}`, { tone: 'danger' }),
    });
    setF(x => ({ ...x, text: '', contact: '', closesWhen: '', nextAction: '' }));
  };
  return (
    <Card className="p-4 grid gap-3 grid-cols-2 lg:grid-cols-4 border-accent">
      <Lbl className="col-span-2 lg:col-span-4">New action<input autoFocus type="text" value={f.text} onChange={e => put('text')(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} placeholder="What needs answering or doing" className={ctl} /></Lbl>
      <Lbl>Project<select value={f.project} onChange={e => setF(x => ({ ...x, project: e.target.value, itemId: '' }))} className={ctl}><option value="">Project…</option>{projects.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></Lbl>
      <Lbl>Item<select value={f.itemId} onChange={e => put('itemId')(e.target.value)} className={ctl} disabled={!f.project}><option value="">{f.project ? 'Item…' : 'Pick a project'}</option>{items.filter(i => i.projectId === f.project).map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</select></Lbl>
      <Lbl>Ball in court<select value={f.bic} onChange={e => { const b = e.target.value; setF(x => ({ ...x, bic: b, ...bicSet({ personId: x.personId, companyId: x.companyId }, b, team).dtId === null && { personId: '' }, ...(partyFor(b).kind !== 'company' && { companyId: '' }) })); }} className={ctl}>{(lookups.actionBic || []).map(b => <option key={b}>{b}</option>)}</select></Lbl>
      <Lbl className="col-span-2">Responsible<Responsible row={{ id: 'new', bic: f.bic, personId: f.personId, companyId: f.companyId, contact: f.contact }} team={team} suppliers={suppliers}
        save={set => setF(x => ({ ...x, ...('dtId' in set && { personId: set.dtId || '' }), ...('companyId' in set && { companyId: set.companyId || '' }), ...('contact' in set && { contact: set.contact || '' }) }))} /></Lbl>
      <Lbl>Due<input type="date" value={f.due} onChange={e => put('due')(e.target.value)} className={ctl} /></Lbl>
      <Lbl className="col-span-2">Closes when<input type="text" value={f.closesWhen} onChange={e => put('closesWhen')(e.target.value)} className={ctl} /></Lbl>
      <Lbl className="col-span-2 lg:col-span-3">Trade
        <span className="flex flex-wrap gap-1.5 normal-case tracking-normal">{TRADES.map(t => { const on = f.trade.includes(t); return <button key={t} type="button" aria-pressed={on} onClick={() => put('trade')(on ? f.trade.filter(x => x !== t) : [...f.trade, t])} className={cx('min-h-9 px-2.5 border font-mono text-[12px] cursor-pointer', on ? 'border-accent text-accent bg-surface-hi' : 'border-line-strong text-muted bg-transparent')}>{t}</button>; })}</span>
      </Lbl>
      <Lbl>Holds the item<label className="min-h-9 inline-flex items-center gap-2 normal-case tracking-normal text-[13px] text-text-2"><input type="checkbox" checked={f.blocks} onChange={e => put('blocks')(e.target.checked)} className="w-[18px] h-[18px] accent-[var(--color-accent)]" /> Blocks item</label></Lbl>
      <div className="col-span-2 lg:col-span-4 flex gap-2">
        <button type="button" className={cx(BTN, 'border-accent text-accent')} onClick={add} disabled={!f.text.trim()}>Add</button>
        <button type="button" className={BTN} onClick={onClose}>Close</button>
        <span className="self-center font-mono text-[11px] text-muted">No item? It also shows in the Triage inbox until linked.</span>
      </div>
    </Card>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function ActionsPage() {
  const toast = useToast();
  const { data: s, isPending } = useSnapshots(DBS);
  const { data: boot } = useBootstrap();
  const lookups = boot?.lookups || {};
  const d = useMemo(() => dates(boot?.today || londonToday()), [boot?.today]);
  const [view, setView] = useStored('hub.actions.view', 'open');
  const [stored, setStored] = useStored('hub.actions.filter', JSON.stringify(DEFAULT_FILTER));
  const [groupBy, setGroupBy] = useStored('hub.actions.group', 'company');
  const [sort, setSort] = useStored('hub.actions.sort', 'due');
  const [openIds, setOpenIds] = useState(() => new Set());
  const [adding, setAdding] = useState(false);
  const [reconcile, setReconcile] = useState(null);
  const fileRef = useRef(null);
  const f = useMemo(() => { try { return { ...DEFAULT_FILTER, ...JSON.parse(stored) }; } catch { return DEFAULT_FILTER; } }, [stored]);
  // Opened from the Suppliers lens with ?company=<id>: show everything open with that company
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const c = params.get('company');
    if (!c) return;
    setStored(JSON.stringify({ ...DEFAULT_FILTER, company: c })); setView(''); setGroupBy('item');
    setParams(p => { const n = new URLSearchParams(p); n.delete('company'); return n; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  // Opened from the Brief with ?open=<id>: show just that action / task, expanded
  const focus = params.get('open') || '';
  useEffect(() => { if (focus) setOpenIds(o => (o.has(focus) ? o : new Set(o).add(focus))); }, [focus]);
  const clearFocus = () => setParams(p => { const n = new URLSearchParams(p); n.delete('open'); return n; }, { replace: true });
  const setF = (patch, keepView) => { clearFocus(); setStored(JSON.stringify({ ...f, ...patch })); if (!keepView) setView(''); };

  const rows = useMemo(() => buildRows({ actions: s.actions, todo: s.todo, tasks: s.tasks, suppliers: s.suppliers, team: s.team, projects: s.projects }), [s]);
  const suppliers = useMemo(() => s.suppliers.filter(x => !x.archived).map(x => ({ value: x.id, label: x.title || 'Untitled' })).sort((a, b) => a.label.localeCompare(b.label)), [s.suppliers]);
  const people = useMemo(() => s.team.filter(x => !x.archived).map(x => ({ value: x.id, label: x.role ? `${x.title} (${x.role})` : x.title })).sort((a, b) => a.label.localeCompare(b.label)), [s.team]);
  const items = useMemo(() => s.tasks.filter(t => !t.archived && !['Complete', 'PC Approved', 'Close Out', 'Omitted'].includes(t.status)).sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true })), [s.tasks]);
  const live = useMemo(() => s.projects.filter(p => !p.archived && /^in progress$/i.test(p.status || '')).map(p => ({ value: p.id, label: p.title })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })), [s.projects]);
  const ctx = { d, lookups, suppliers, people, items, team: s.team, projects: live, toast };

  const scope = useMemo(() => rows.filter(r => !f.project || r.projectId === f.project), [rows, f.project]);
  const vis = useMemo(() => (focus ? rows.filter(r => r.id === focus) : scope.filter(r => matches(r, f, d)).sort(SORTS[sort] || SORTS.due)), [focus, rows, scope, f, d, sort]);
  const key = (GROUP_BY.find(g => g.value === groupBy) || GROUP_BY[0]).key;
  const groups = useMemo(() => {
    if (!groupBy || focus) return [['', vis]];
    const m = new Map();
    for (const r of vis) { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return [...m].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [vis, groupBy, key, focus]);

  const pickView = v => { clearFocus(); setView(v.id); setStored(JSON.stringify({ ...DEFAULT_FILTER, project: f.project, ...v.f })); if (v.by !== undefined) setGroupBy(v.by); };
  const open = vis.filter(r => !r.closed);
  const toggle = id => setOpenIds(o => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const projectName = live.find(p => p.value === f.project)?.label || 'All projects';
  const doExport = () => exportActions(vis, { suppliers: s.suppliers.filter(x => !x.archived), bics: lookups.actionBic || [], fileName: `Actions_${projectName.replace(/[^\w-]+/g, '-')}_${d.today}.xlsx` })
    .catch(e => toast.show(`Export failed: ${e.message}`, { tone: 'danger' }));

  return (
    <PageShell
      title="Actions"
      subtitle="Everything to chase: actions and DT tasks, by who holds them"
      toolbar={<>
        <ToolbarSelect label="Project" value={f.project} onChange={v => setF({ project: v }, true)} options={[{ value: '', label: 'All projects' }, ...live]} />
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className={cx(BTN, 'border-accent text-accent')} onClick={() => setAdding(a => !a)}><Plus size={14} aria-hidden="true" /> New action</button>
          <button type="button" className={BTN} onClick={doExport} disabled={!vis.length}><Download size={14} aria-hidden="true" /> Excel</button>
          <button type="button" className={BTN} onClick={() => fileRef.current?.click()}><Upload size={14} aria-hidden="true" /> Reconcile Excel</button>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) setReconcile(file); }} />
        </span>
      </>}
    >
      <MeetingBar />
      {adding && <NewAction ctx={ctx} onClose={() => setAdding(false)} />}
      {reconcile && <ReconcilePanel file={reconcile} rows={rows} snaps={s} bics={lookups.actionBic || []} onClose={() => setReconcile(null)} />}

      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map(v => {
          const n = scope.filter(r => matches(r, { ...DEFAULT_FILTER, ...v.f }, d)).length;
          const on = view === v.id;
          return (
            <button key={v.id} type="button" aria-pressed={on} onClick={() => pickView(v)}
              className={cx('min-h-9 px-3 inline-flex items-center gap-2 border text-[13px] cursor-pointer', on ? 'bg-surface-hi border-accent text-accent' : 'bg-transparent border-line-strong text-text-2 hover:text-text')}>
              {v.label}<span className="font-mono text-[11px] text-muted">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 p-2 bg-surface border border-line">
        <SearchBox value={f.q} onChange={v => setF({ q: v }, true)} placeholder="Action, item, company, contact, ref" />
        <select aria-label="Chase group" value={f.group} onChange={e => setF({ group: e.target.value })} className={ctl}><option value="">Any group</option>{Object.entries(GROUPS).map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}</select>
        <select aria-label="Ball in court" value={f.bic} onChange={e => setF({ bic: e.target.value })} className={ctl}><option value="">Any ball in court</option>{(lookups.actionBic || []).map(b => <option key={b}>{b}</option>)}</select>
        <select aria-label="Company" value={f.company} onChange={e => setF({ company: e.target.value })} className={ctl}><option value="">Any company</option><option value="-">No company</option>{suppliers.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
        <select aria-label="Status" value={f.status} onChange={e => setF({ status: e.target.value })} className={ctl}><option value="open">Open</option><option value="all">All</option><option value="closed">Closed / moved</option><option value="closedWeek">Closed this week</option></select>
        <select aria-label="Due" value={f.due} onChange={e => setF({ due: e.target.value })} className={ctl}><option value="">Any due date</option><option value="overdue">Overdue</option><option value="week">Due this week</option><option value="14">Next 14 days</option><option value="none">No due date</option></select>
        <select aria-label="Impact" value={f.impact} onChange={e => setF({ impact: e.target.value })} className={ctl}><option value="">Any impact</option><option value="blocking">Blocking</option><option value="risk">On an item</option><option value="watch">No item</option></select>
        <select aria-label="Source" value={f.src} onChange={e => setF({ src: e.target.value })} className={ctl}><option value="">Actions and tasks</option><option value="Action">Actions</option><option value="Task">DT tasks</option></select>
        <select aria-label="Trade" value={f.trade} onChange={e => setF({ trade: e.target.value })} className={ctl}><option value="">Any trade</option>{TRADES.map(t => <option key={t}>{t}</option>)}</select>
        <span className="mx-1 w-px h-6 bg-line" />
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Group</span>
        <select aria-label="Group by" value={groupBy} onChange={e => setGroupBy(e.target.value)} className={ctl}>{GROUP_BY.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}</select>
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Sort</span>
        <select aria-label="Sort" value={sort} onChange={e => setSort(e.target.value)} className={ctl}><option value="due">Due date</option><option value="age">Oldest first</option><option value="impact">Impact</option></select>
        <button type="button" onClick={() => { setStored(JSON.stringify({ ...DEFAULT_FILTER, project: f.project })); setView('open'); }} className="min-h-9 px-2 bg-transparent border-0 font-mono text-[12px] text-muted cursor-pointer hover:text-text-2">Clear</button>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[13px] text-muted">
        <span><b className="text-[20px] text-text mr-1 tabular-nums">{vis.length}</b>shown</span>
        <span><b className="text-[20px] text-danger mr-1 tabular-nums">{open.filter(r => isOver(r, d)).length}</b>overdue</span>
        <span><b className="text-[20px] text-danger mr-1 tabular-nums">{new Set(open.filter(r => r.impact === 'blocking' && r.itemId).map(r => r.itemId)).size}</b>items blocked</span>
        <span><b className="text-[20px] text-accent mr-1 tabular-nums">{open.filter(r => r.due && r.due <= d.weekEnd).length}</b>due by Sunday</span>
        <span><b className="text-[20px] text-text mr-1 tabular-nums">{scope.filter(r => r.closed && r.closedOn && r.closedOn >= d.weekAgo).length}</b>closed in the last 7 days</span>
      </div>

      {focus && (
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-surface-hi border border-accent text-[13px] text-text-2">
          <span>Showing the one record you opened from the Brief.</span>
          <button type="button" onClick={clearFocus} className="min-h-9 px-3 border border-line-strong bg-transparent text-text-2 hover:bg-surface font-mono text-[12px] cursor-pointer">Show all actions</button>
        </div>
      )}
      {isPending ? <Card className="p-4"><SkeletonRows rows={10} /></Card> : !vis.length ? (
        <Card className="p-8 text-center text-[14px] text-muted">{focus ? 'That record is no longer in the tracker (archived or a note).' : 'Nothing matches these filters.'}</Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="hidden lg:grid items-center gap-x-3 pr-2 py-2 grid-cols-[4px_84px_minmax(0,1fr)_140px_170px_120px_130px_28px] border-b border-line font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            <span /><span>Ref</span><span>Action</span><span>Ball in court</span><span>Responsible</span><span>Due</span><span>Status</span><span />
          </div>
          {groups.map(([g, list]) => (
            <section key={g || 'all'}>
              {g && (
                <h3 className="m-0 flex flex-wrap items-baseline gap-3 px-3 py-2 bg-surface-hi border-t border-line text-[14px] font-semibold">
                  {g}
                  <span className="font-mono text-[11px] font-normal text-muted">{list.length} · {list.filter(r => isOver(r, d)).length ? <span className="text-danger">{list.filter(r => isOver(r, d)).length} overdue</span> : 'none overdue'}</span>
                </h3>
              )}
              <ul className="m-0 p-0 list-none">
                {list.map(r => <Row key={r.id} r={r} ctx={ctx} open={openIds.has(r.id)} onToggle={() => toggle(r.id)} groupBy={groupBy} />)}
              </ul>
            </section>
          ))}
        </Card>
      )}
      <p className="m-0 font-mono text-[12px] text-muted max-w-[110ch]">
        Actions come from Actions &amp; Info (notes are left out); DT tasks from the To Do List. Every change saves to Notion straight away, and changes to ball in court, status, due and company are added to the action’s Response Log.
        Excel exports the rows shown; edit the amber columns and use Reconcile Excel to bring the changes back.
      </p>
    </PageShell>
  );
}
