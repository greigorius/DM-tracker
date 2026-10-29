// Triage: act on the Brief's lists. Each row opens an edit strip; changes are
// held as a draft until Save, then go to Notion in one update. Delete moves the
// page to Notion Trash (restorable for 30 days, with Undo here).
import { useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, Badge, Button, Tabs, SkeletonRows, useToast, cx } from '../../components/ui/index.js';
import { SearchBox } from '../../components/ui/table.jsx';
import { useUpdateRecord, useTrashRecord, useBootstrap } from '../../hooks/hub.js';
import { addDays, OPEN_RFI_STATUSES } from '../../../hub-core/derive.js';
import { groupOf, ageDays, fmtDay, bicTone, extendDue, BICS, ACTIVE_ITEM_STATUSES, latestSubmissions } from './shared.jsx';

const TABS = [
  { id: 'mine', label: 'My moves', kind: 'action' },
  { id: 'ext', label: 'External', kind: 'action' },
  { id: 'int', label: 'Internal', kind: 'action' },
  { id: 'dt', label: 'DT team', kind: 'action' },
  { id: 'unfiled', label: 'Unfiled', kind: 'action' },
  { id: 'all', label: 'All actions', kind: 'action' },
  { id: 'items', label: 'Items', kind: 'item' },
  { id: 'rfis', label: 'RFIs', kind: 'rfi' },
  { id: 'vars', label: 'Variations', kind: 'var' },
  { id: 'fixes', label: 'Data fixes', kind: 'fixes' },
];
const DB_OF = { action: 'actions', item: 'tasks', rfi: 'rfis', var: 'variations' };
// Cockpit count cards land here with ?filter=<key>
const FROM_FILTER = {
  overdue: { tab: 'all', due: 'overdue' }, 'due-week': { tab: 'all', due: 'week' }, 'with-dts': { tab: 'items', bic: 'DT' },
  'bic-dm': { tab: 'mine' }, 'rfis-open': { tab: 'rfis' }, 'vcs-open': { tab: 'vars' },
};

// ── Small controls ───────────────────────────────────────────────────────────
const ctl = 'min-h-11 px-3 bg-ground border border-line-strong text-text text-[14px] outline-none focus:border-accent';
function Sel({ value, onChange, options, blank = '—', label }) {
  return (
    <select aria-label={label} value={value ?? ''} onChange={e => onChange(e.target.value)} className={cx(ctl, 'cursor-pointer max-w-[260px]')}>
      <option value="">{blank}</option>
      {options.map(o => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}
const DateIn = ({ value, onChange, label }) => <input type="date" aria-label={label} value={value || ''} onChange={e => onChange(e.target.value)} className={ctl} />;
const Check = ({ checked, onChange, label }) => (
  <label className="inline-flex items-center gap-2 min-h-11 text-[14px] text-text-2 cursor-pointer">
    <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} className="w-5 h-5 accent-accent" /> {label}
  </label>
);
const Mini = ({ children, ...p }) => <button type="button" className="min-h-11 px-3 border border-line-strong bg-transparent text-text-2 hover:bg-surface-hi font-mono text-[12px] cursor-pointer" {...p}>{children}</button>;

function Field({ label, changed, children }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cx('w-32 shrink-0 font-mono text-[11px] uppercase tracking-[0.1em]', changed ? 'text-accent' : 'text-muted')}>{label}{changed ? ' •' : ''}</span>
      {children}
    </div>
  );
}

function ItemPicker({ d, value, onChange }) {
  const current = d.items_.get(value?.[0]);
  const [proj, setProj] = useState(current?.projectId || '');
  const items = d.all.tasks.filter(i => i.projectId === proj && !i.archived).sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true }));
  return (
    <div className="flex flex-wrap gap-2">
      <Sel label="Project" value={proj} onChange={setProj} blank="Project…" options={d.projectOptions} />
      <Sel label="Item" value={value?.[0] || ''} onChange={v => onChange(v ? [v] : [])} blank={proj ? 'Item…' : 'Pick a project'} options={items.map(i => ({ value: i.id, label: i.title }))} />
      {!value?.length && <Badge tone="danger">No item linked</Badge>}
    </div>
  );
}

// ── Row with draft + edit strip ─────────────────────────────────────────────
function useDrafts() {
  const [drafts, setDrafts] = useState({});
  return {
    get: id => drafts[id] || {},
    set: (id, k, v, orig) => setDrafts(all => {
      const cur = { ...(all[id] || {}) };
      const same = JSON.stringify(v ?? '') === JSON.stringify(orig ?? '');
      if (same || (k === 'chase' && !v)) delete cur[k]; else cur[k] = v;
      const next = { ...all, [id]: cur };
      if (!Object.keys(cur).length) delete next[id];
      return next;
    }),
    clear: id => setDrafts(all => { const n = { ...all }; delete n[id]; return n; }),
  };
}

function Strip({ kind, row, d, drafts, lookups, onSaved, onTrash }) {
  const db = DB_OF[kind];
  const update = useUpdateRecord(db);
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const draft = drafts.get(row.id);
  const val = (k, orig) => (k in draft ? draft[k] : orig);
  const set = (k, orig) => v => drafts.set(row.id, k, v, orig);
  const n = Object.keys(draft).length;
  const t = d.today;

  const save = () => {
    const { chase, ...set_ } = draft;
    if (kind === 'action' && 'dtId' in set_ && set_.dtId) set_.bic = 'DT';
    if (kind === 'item' && 'dtId' in set_ && set_.dtId && !('bic' in set_)) set_.bic = 'DT';
    update.mutate({ id: row.id, set: set_, chase }, {
      onSuccess: () => { drafts.clear(row.id); toast.show('Saved to Notion'); onSaved?.(); },
      onError: e => toast.show(`Not saved: ${e.message}`, { tone: 'danger', ms: 8000 }),
    });
  };

  let fields;
  if (kind === 'action') {
    fields = (
      <>
        <Field label="Done" changed={'done' in draft}><Check label="Mark done on save" checked={val('done', false)} onChange={set('done', false)} /></Field>
        <Field label="Ball in court" changed={'bic' in draft}><Sel label="Ball in court" value={val('bic', row.bic)} onChange={set('bic', row.bic)} options={BICS} /></Field>
        <Field label="DT" changed={'dtId' in draft}><Sel label="DT" value={val('dtId', row.personIds[0] || '')} onChange={set('dtId', row.personIds[0] || '')} blank="Unassigned" options={d.dts.map(x => ({ value: x.id, label: x.name }))} /></Field>
        <Field label="Item" changed={'itemIds' in draft}><ItemPicker d={d} value={val('itemIds', row.itemIds)} onChange={set('itemIds', row.itemIds)} /></Field>
        <Field label="Due" changed={'due' in draft}>
          <span className="text-[13px] text-muted">{row.due ? `Was ${fmtDay(row.due)}${row.due < t ? ' (overdue)' : ''}` : 'No due date'}</span>
          {[[1, '+1 day'], [3, '+3 days'], [7, '+1 week'], [14, '+2 weeks']].map(([k, l]) => <Mini key={k} onClick={() => set('due', row.due)(extendDue(row.due, k, t))}>{l}</Mini>)}
          <DateIn label="Due date" value={val('due', row.due)} onChange={set('due', row.due)} />
        </Field>
        <Field label="Chase note" changed={!!draft.chase}>
          <input type="text" value={draft.chase || ''} onChange={e => drafts.set(row.id, 'chase', e.target.value)} placeholder="Optional: who you chased, how. Logged on save" className={cx(ctl, 'flex-1 min-w-[220px]')} />
        </Field>
        {row.log && <Field label="History"><pre className="m-0 flex-1 min-w-0 max-h-28 overflow-auto font-mono text-[12px] text-muted whitespace-pre-wrap border-l-2 border-line pl-3">{row.log}</pre></Field>}
      </>
    );
  } else if (kind === 'item') {
    fields = (
      <>
        <Field label="Status" changed={'status' in draft}><Sel label="Item status" value={val('status', row.status)} onChange={set('status', row.status)} options={lookups.statuses} /></Field>
        <Field label="Lock status" changed={'lockStatus' in draft}><Check label="Automation leaves this status alone" checked={val('lockStatus', !!row.lockStatus)} onChange={set('lockStatus', !!row.lockStatus)} /></Field>
        <Field label="DM phase" changed={'dmPhase' in draft}><Sel label="DM phase" value={val('dmPhase', row.dmPhase)} onChange={set('dmPhase', row.dmPhase)} options={lookups.phases} /></Field>
        <Field label="Ball in court" changed={'bic' in draft}><Sel label="Ball in court" value={val('bic', row.bic)} onChange={set('bic', row.bic)} options={lookups.bic} /></Field>
        <Field label="DT" changed={'dtId' in draft}><Sel label="DT" value={val('dtId', row.dtIds[0] || '')} onChange={set('dtId', row.dtIds[0] || '')} blank="Unassigned" options={d.dts.map(x => ({ value: x.id, label: x.name }))} /></Field>
        <Field label="Blocker note" changed={'blockerNote' in draft}>
          <input type="text" value={val('blockerNote', row.blockerNote) || ''} onChange={e => set('blockerNote', row.blockerNote)(e.target.value)} placeholder="Who it sits with + what the problem is" className={cx(ctl, 'flex-1 min-w-[220px]')} />
        </Field>
        <Field label="Instructed on" changed={'instruction' in draft}>
          <Mini onClick={() => set('instruction', row.dates?.instruction)(t)}>Today</Mini>
          <DateIn label="Date of instruction" value={val('instruction', row.dates?.instruction)} onChange={set('instruction', row.dates?.instruction)} />
        </Field>
        <Field label="Hold days" changed={'holdDays' in draft}>
          <input type="number" min="0" step="1" value={val('holdDays', row.holdDays) ?? ''} onChange={e => set('holdDays', row.holdDays)(e.target.value === '' ? null : Number(e.target.value))} className={cx(ctl, 'w-28')} aria-label="Hold days" />
        </Field>
      </>
    );
  } else if (kind === 'rfi') {
    fields = (
      <>
        <Field label="Status" changed={'status' in draft}><Sel label="RFI status" value={val('status', row.status)} onChange={set('status', row.status)} options={lookups.rfiStatuses} /></Field>
        <Field label="With (TBC by)" changed={'tbcBy' in draft}><Sel label="TBC by" value={val('tbcBy', row.tbcBy)} onChange={set('tbcBy', row.tbcBy)} options={lookups.rfiTbcBy.filter(x => x !== 'DM')} /></Field>
        <Field label="Stops work" changed={'stopsWork' in draft}><Check label="Stops work" checked={val('stopsWork', !!row.stopsWork)} onChange={set('stopsWork', !!row.stopsWork)} /></Field>
        <Field label="Response due" changed={'due' in draft}><DateIn label="Response due" value={val('due', row.due)} onChange={set('due', row.due)} /></Field>
        <Field label="Responded on" changed={'responded' in draft}>
          <Mini onClick={() => set('responded', row.responded)(t)}>Today</Mini>
          <DateIn label="Date responded" value={val('responded', row.responded)} onChange={set('responded', row.responded)} />
        </Field>
        <Field label="Item" changed={'itemIds' in draft}><ItemPicker d={d} value={val('itemIds', row.itemIds)} onChange={set('itemIds', row.itemIds)} /></Field>
      </>
    );
  } else {
    fields = (
      <>
        <Field label="Status" changed={'status' in draft}><Sel label="Variation status" value={val('status', row.status)} onChange={set('status', row.status)} options={lookups.vcStatuses} /></Field>
        <Field label="Decision date" changed={'decision' in draft}>
          <Mini onClick={() => set('decision', row.decision)(t)}>Today</Mini>
          <DateIn label="Decision date" value={val('decision', row.decision)} onChange={set('decision', row.decision)} />
        </Field>
        <Field label="Added days" changed={'addedDays' in draft}>
          <input type="number" min="0" step="1" value={val('addedDays', row.addedDays) ?? ''} onChange={e => set('addedDays', row.addedDays)(e.target.value === '' ? null : Number(e.target.value))} className={cx(ctl, 'w-28')} aria-label="Added days" />
        </Field>
        <Field label="Pause" changed={'pauseOverride' in draft}><Sel label="Pause override" value={val('pauseOverride', row.pauseOverride)} onChange={set('pauseOverride', row.pauseOverride)} blank="By type" options={lookups.vcPause.length ? lookups.vcPause : ['Pauses', 'Does not pause']} /></Field>
        <Field label="Item" changed={'itemIds' in draft}><ItemPicker d={d} value={val('itemIds', row.itemIds)} onChange={set('itemIds', row.itemIds)} /></Field>
      </>
    );
  }

  return (
    <div className="px-4 pb-4 pt-1 sm:pl-14 flex flex-col gap-2 bg-ground/40">
      {fields}
      <div className="flex flex-wrap items-center gap-2 pt-3 mt-1 border-t border-line">
        <Button onClick={save} disabled={!n || update.isPending}>{update.isPending ? 'Saving…' : n ? `Save ${n} change${n === 1 ? '' : 's'}` : 'Save'}</Button>
        {n > 0 && <Button variant="secondary" onClick={() => drafts.clear(row.id)}>Discard</Button>}
        {n > 0 && <span className="font-mono text-[12px] text-accent">Not saved yet</span>}
        <span className="ml-auto">
          {confirm ? (
            <span className="inline-flex flex-wrap items-center gap-2 text-[13px] text-danger">
              Move to Notion Trash?
              <Button className="!bg-danger !border-danger" onClick={() => { setConfirm(false); onTrash(row); }}>Delete</Button>
              <Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className="min-h-11 px-3 bg-transparent border border-transparent hover:border-danger text-danger font-mono text-[12px] uppercase tracking-[0.08em] cursor-pointer">Delete…</button>
          )}
        </span>
      </div>
    </div>
  );
}

function Row({ kind, row, d, open, onToggle, selected, onSelect, drafts, lookups, onTrash }) {
  const t = d.today;
  let title, meta, side;
  if (kind === 'action') {
    title = row.title; meta = [d.itemName(row.itemIds) || 'No item', d.personName(row.personIds[0]), row.source];
    side = <>{row.bic ? <Badge tone={bicTone(row.bic)}>{row.bic}</Badge> : <Badge tone="danger">Unfiled</Badge>}{row.due && <Badge tone={row.due < t ? 'danger' : 'muted'}>{fmtDay(row.due)}</Badge>}<span className="font-mono text-[12px] text-muted w-10 text-right">{ageDays(row.received || row.createdAt, t)}d</span></>;
  } else if (kind === 'item') {
    title = row.title; meta = [d.projects.get(row.projectId), row.status, row.dmPhase, row.dtIds.map(d.personName).join(', '), row.blocker?.join(', '), row.lockStatus && 'locked'];
    side = <>{row.bic && <Badge tone={bicTone(row.bic)}>{row.bic}</Badge>}<span className="font-mono text-[12px] text-muted w-10 text-right">{ageDays(row.editedAt, t)}d</span></>;
  } else if (kind === 'rfi') {
    title = `RFI-${String(row.number ?? '?').padStart(3, '0')} ${row.title || ''}`; meta = [d.itemName(row.itemIds) || 'No item', row.tbcBy && `TBC ${row.tbcBy}`, row.stopsWork && 'stops work'];
    side = <><Badge tone="accent">{row.status}</Badge>{row.due && <Badge tone={row.due < t ? 'danger' : 'muted'}>{fmtDay(row.due)}</Badge>}<span className="font-mono text-[12px] text-muted w-10 text-right">{ageDays(row.raised, t) ?? '–'}d</span></>;
  } else {
    title = `${row.code || 'VC'} ${row.title || ''}`; meta = [d.itemName(row.itemIds) || 'No item', row.type, row.raisedBy && `raised by ${row.raisedBy}`];
    side = <><Badge tone="accent">{row.status || 'No status'}</Badge><span className="font-mono text-[12px] text-muted w-10 text-right">{ageDays(row.requested || row.createdAt, t)}d</span></>;
  }
  const dirty = Object.keys(drafts.get(row.id)).length > 0;
  return (
    <li className={cx('border-t border-line first:border-t-0', row.done && 'opacity-60')}>
      <div className="flex items-start gap-3 px-4 py-2">
        {onSelect && <input type="checkbox" aria-label={`Select ${title}`} checked={selected} onChange={e => onSelect(e.target.checked)} className="mt-3 w-5 h-5 accent-accent shrink-0" />}
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex-1 min-w-0 text-left bg-transparent border-0 p-0 py-1.5 cursor-pointer text-text flex gap-2">
          {open ? <ChevronDown size={16} className="mt-1 text-muted shrink-0" /> : <ChevronRight size={16} className="mt-1 text-muted shrink-0" />}
          <span className="min-w-0">
            <span className={cx('block text-[14px]', dirty && 'text-accent')}>{title || 'Untitled'}</span>
            <span className="block mt-0.5 font-mono text-[11px] text-muted truncate">{meta.filter(Boolean).join(' · ')}</span>
          </span>
        </button>
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1.5 shrink-0 max-w-[45%]">
          {side}
          <a href={row.url} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-muted hover:text-accent">Notion ↗</a>
        </div>
      </div>
      {open && <Strip kind={kind} row={row} d={d} drafts={drafts} lookups={lookups} onTrash={onTrash} />}
    </li>
  );
}

// ── Bulk edit bar ────────────────────────────────────────────────────────────
function BulkBar({ kind, rows, d, lookups, onDone }) {
  const update = useUpdateRecord(DB_OF[kind]);
  const toast = useToast();
  const [b, setB] = useState({});
  const [busy, setBusy] = useState(false);
  const setK = k => v => setB(x => { const n = { ...x }; if (v === '' || v == null || v === false) delete n[k]; else n[k] = v; return n; });
  const apply = async () => {
    setBusy(true);
    let ok = 0;
    for (const r of rows) {
      const set = { ...b };
      if (set.dtId) set.bic = set.bic || 'DT';
      try { await update.mutateAsync({ id: r.id, set }); ok++; } catch { /* counted below */ }
    }
    setBusy(false);
    toast.show(`${ok} of ${rows.length} rows saved`, { tone: ok === rows.length ? 'ok' : 'danger' });
    if (ok === rows.length) { setB({}); onDone(); }
  };
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 p-3 bg-surface-hi border border-accent">
      <span className="font-semibold mr-1">{rows.length} selected</span>
      {kind === 'item' && <Sel label="Status" value={b.status} onChange={setK('status')} blank="Status…" options={lookups.statuses} />}
      {kind === 'item' && <Sel label="DM phase" value={b.dmPhase} onChange={setK('dmPhase')} blank="DM phase…" options={lookups.phases} />}
      <Sel label="Ball in court" value={b.bic} onChange={setK('bic')} blank="Ball in court…" options={kind === 'item' ? lookups.bic : BICS} />
      <Sel label="DT" value={b.dtId} onChange={setK('dtId')} blank="DT…" options={d.dts.map(x => ({ value: x.id, label: x.name }))} />
      {kind === 'action' && <DateIn label="Due" value={b.due} onChange={setK('due')} />}
      {kind === 'action' && <Check label="Mark done" checked={b.done} onChange={setK('done')} />}
      <span className="ml-auto flex gap-2">
        <Button onClick={apply} disabled={!Object.keys(b).length || busy}>{busy ? 'Saving…' : 'Apply to selected'}</Button>
        <Button variant="secondary" onClick={onDone}>Clear</Button>
      </span>
    </div>
  );
}

// ── Data fixes ───────────────────────────────────────────────────────────────
function useChecks(d) {
  return useMemo(() => {
    const t = d.today, wk = addDays(t, -7);
    const item = r => d.itemName(r.itemIds);
    const ITEM_DT = new Set(['Set Up', 'In Design', 'In Progress']);
    const actualsRows = d.items.filter(i => ['Set Up', 'In Design', 'Awaiting Approval', 'In Progress'].includes(i.status)).flatMap(i => {
      const x = i.dt || {};
      return [
        ['S4 DT start', 's4StartAct', x.s4Start, x.s4StartAct], ['S4 DT delivery', 's4DelAct', x.s4Del, x.s4DelAct],
        ['S5 DT start', 's5StartAct', x.s5Start, x.s5StartAct], ['S5 DT delivery', 's5DelAct', x.s5Del, x.s5DelAct],
        ['C01 DT start', 'cStartAct', x.cStart, x.cStartAct], ['C01 DT delivery', 'cDelAct', x.cDel, x.cDelAct],
      ].filter(([, , plan, act]) => plan && plan < t && !act).map(([label, field, plan]) => ({ ...i, _key: `${i.id}:${field}`, _field: field, _sub: `${label} planned ${fmtDay(plan)}` }));
    });
    const dtIds = new Set(d.dts.map(x => x.id));
    return [
      { id: 'var_decision', app: 'Scheduling', title: 'Instructed variations with no decision date', why: 'The decision date ends the hold on linked items; without it the Scheduling Tool keeps them paused.', db: 'variations', field: 'decision', fix: 'date',
        rows: d.variations.filter(v => ['Instruction Received', 'Declined', 'Withdrawn'].includes(v.status) && !v.decision), label: v => `${v.code} ${v.title}`, sub: item },
      { id: 'var_status', app: 'Scheduling', title: 'Variations with no status', why: 'With no status a Design or Scope Change counts as undecided, so linked items stay on hold.', db: 'variations', field: 'status', fix: 'select', options: d.lookups.vcStatuses,
        rows: d.variations.filter(v => !v.status), label: v => `${v.code} ${v.title}`, sub: item },
      { id: 'var_items', app: 'Activity log · Scheduling', title: 'Open variations not linked to an item', why: 'Without an item the variation can’t pause anything or reach an item’s activity feed.', db: 'variations', field: 'itemIds', fix: 'item',
        rows: d.all.variations.filter(v => !v.archived && ['Awaiting Design Info', 'Awaiting Instruction'].includes(v.status) && !v.itemIds.length), label: v => `${v.code} ${v.title}` },
      { id: 'meet_items', app: 'Meeting actions', title: 'This week’s meetings with no item', why: 'Link the meeting so its copied actions land on the right item feed.', db: 'meetings', field: 'itemIds', fix: 'item',
        rows: d.meetings.filter(m => (m.createdAt || '').slice(0, 10) >= wk && !m.itemIds.length), label: m => m.title, sub: m => fmtDay(m.createdAt) },
      { id: 'item_instr', app: 'Scheduling', title: 'Active items with no date of instruction', why: 'Date of Instruction anchors the programme. Without it there are no planned dates.', db: 'tasks', field: 'instruction', fix: 'date',
        rows: d.items.filter(i => ACTIVE_ITEM_STATUSES.has(i.status) && !i.dates?.instruction), label: i => i.title, sub: i => d.projects.get(i.projectId) },
      { id: 'item_actuals', app: 'Scheduling · Brief', title: 'DT dates passed with no actual entered', why: 'Enter the actual start or delivery so the programme and the Brief stop showing it as late.', db: 'tasks', fix: 'date',
        rows: actualsRows, label: i => i.title, sub: i => i._sub },
      { id: 'item_dt', app: 'Brief · Timesheets', title: 'Items in design with no DT', why: 'The DT team view and workload need a person on every item being drawn.', db: 'tasks', field: 'dtId', fix: 'dt',
        rows: d.items.filter(i => ITEM_DT.has(i.status) && !i.dtIds.length), label: i => i.title, sub: i => d.projects.get(i.projectId) },
      { id: 'sub_dt', app: 'Drawing Flow', title: 'Drawing submissions recorded against a DM', why: 'The latest submission of each drawing should name the DT, so bounce and grade emails reach the right person.', db: 'submissions', field: 'dtId', fix: 'dt',
        rows: latestSubmissions(d.submissions).filter(x => ['DT', 'DM'].includes(x.bic) && !dtIds.has(x.dtIds[0])), label: x => x.title, sub: x => `Now: ${d.personName(x.dtIds[0]) || 'No DT'}` },
      { id: 'ai_due', app: 'Brief', title: 'My actions with no due date', why: 'They never reach “overdue”, so they drift. Give each a date or tick it done.', db: 'actions', field: 'due', fix: 'date',
        rows: d.openActions.filter(a => a.bic === 'DM' && !a.due && a.source !== 'Submission'), label: a => a.title, sub: item },
      { id: 'ai_items', app: 'Activity log', title: 'Actions not linked to an item', why: 'Only actions with an item reach that item’s activity feed and the client export.', db: 'actions', field: 'itemIds', fix: 'item',
        rows: d.all.actions.filter(a => !a.archived && !a.done && a.type !== 'Note' && !a.itemIds.length), label: a => a.title, sub: a => a.source },
      { id: 'ai_bic', app: 'Brief · Triage', title: 'Unfiled actions (no ball in court)', why: 'An action with no ball in court sits in no working list.', db: 'actions', field: 'bic', fix: 'select', options: BICS,
        rows: d.openActions.filter(a => !a.bic), label: a => a.title, sub: item },
      { id: 'item_bic', app: 'Brief · Scheduling', title: 'Active items with no ball in court', why: 'Every live item needs an owner for the chase lists and the programme.', db: 'tasks', field: 'bic', fix: 'select', options: d.lookups.bic,
        rows: d.items.filter(i => ACTIVE_ITEM_STATUSES.has(i.status) && !i.bic), label: i => i.title, sub: i => d.projects.get(i.projectId) },
      { id: 'rfi_items', app: 'Scheduling · Activity log', title: 'Open RFIs not linked to an item', why: 'A stop-work RFI can only hold an item it’s linked to.', db: 'rfis', field: 'itemIds', fix: 'item',
        rows: d.all.rfis.filter(r => !r.archived && OPEN_RFI_STATUSES.has(r.status) && !r.itemIds.length), label: r => `RFI-${String(r.number ?? '?').padStart(3, '0')} ${r.title}` },
      { id: 'rfi_answered', app: 'Brief', title: 'RFIs answered but still open', why: 'A response is logged, so the RFI should move to Close Out or Closed.', db: 'rfis', field: 'status', fix: 'select', options: ['Close Out', 'Closed'],
        rows: d.rfis.filter(r => ['Raise', 'Open'].includes(r.status) && r.answered), label: r => `RFI-${String(r.number ?? '?').padStart(3, '0')} ${r.title}`, sub: item },
      { id: 'rfi_hold', app: 'Scheduling', title: 'Closed stop-work RFIs with no response date', why: 'Date Responded ends the hold. Without it the item stays paused.', db: 'rfis', field: 'responded', fix: 'date',
        rows: d.rfis.filter(r => r.stopsWork && ['Close Out', 'Closed'].includes(r.status) && !r.responded), label: r => `RFI-${String(r.number ?? '?').padStart(3, '0')} ${r.title}`, sub: item },
    ];
  }, [d]);
}

function FixRow({ check, row, d }) {
  const update = useUpdateRecord(check.db);
  const toast = useToast();
  const field = row._field || check.field;
  const [value, setValue] = useState(check.fix === 'item' ? [] : '');
  const has = Array.isArray(value) ? value.length > 0 : !!value;
  const save = () => update.mutate({ id: row.id, set: { [field]: value } }, {
    onSuccess: () => toast.show('Fixed in Notion'),
    onError: e => toast.show(`Not saved: ${e.message}`, { tone: 'danger', ms: 8000 }),
  });
  return (
    <li className="border-t border-line px-4 py-3 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[220px]">
        <a href={row.url} target="_blank" rel="noreferrer" className="text-[14px] text-text no-underline hover:underline">{check.label(row) || 'Untitled'}</a>
        {check.sub && <div className="font-mono text-[11px] text-muted">{check.sub(row)}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {check.fix === 'date' && <><Mini onClick={() => setValue(d.today)}>Today</Mini><DateIn label="Date" value={value} onChange={setValue} /></>}
        {check.fix === 'select' && <Sel label={check.title} value={value} onChange={setValue} options={check.options} blank="Choose…" />}
        {check.fix === 'dt' && <Sel label="DT" value={value} onChange={setValue} blank="Choose DT…" options={d.dts.map(x => ({ value: x.id, label: x.name }))} />}
        {check.fix === 'item' && <ItemPicker d={d} value={value} onChange={setValue} />}
        <Button onClick={save} disabled={!has || update.isPending}>{update.isPending ? 'Saving…' : 'Save'}</Button>
      </div>
    </li>
  );
}

function DataFixes({ d }) {
  const checks = useChecks(d);
  const [open, setOpen] = useState(() => new Set());
  const toggle = id => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="flex flex-col gap-3">
      {checks.map(c => (
        <Card key={c.id}>
          <h3 className="m-0">
            <button type="button" aria-expanded={open.has(c.id)} onClick={() => toggle(c.id)} className="w-full text-left bg-transparent border-0 cursor-pointer px-4 py-3 flex items-start gap-3 text-text hover:bg-surface-hi">
              {open.has(c.id) ? <ChevronDown size={16} className="mt-1 text-muted" /> : <ChevronRight size={16} className="mt-1 text-muted" />}
              <span className="flex-1 min-w-0">
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-accent mr-2">{c.app}</span>
                <span className="text-[14px] font-semibold">{c.title}</span>
                <span className="block mt-1 text-[13px] font-normal text-muted">{c.why}</span>
              </span>
              <Badge tone={c.rows.length ? 'accent' : 'ok'} className="py-1">{c.rows.length || 'Clear'}</Badge>
            </button>
          </h3>
          {open.has(c.id) && c.rows.length > 0 && (
            <ul className="m-0 p-0 list-none">{c.rows.slice(0, 100).map(r => <FixRow key={r._key || r.id} check={c} row={r} d={d} />)}</ul>
          )}
        </Card>
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function TriagePage() {
  const { data: d0 } = useOutletContext();
  const { data: boot } = useBootstrap();
  const lookups = boot?.lookups || { statuses: [], phases: [], bic: [], rfiTbcBy: [], rfiStatuses: [], vcStatuses: [], vcPause: [] };
  const d = useMemo(() => ({ ...d0, lookups }), [d0, lookups]);
  const [params, setParams] = useSearchParams();
  const preset = FROM_FILTER[params.get('filter')] || {};
  const tab = params.get('tab') || preset.tab || 'mine';
  const due = params.get('due') || preset.due || 'all';
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [undo, setUndo] = useState(null);
  const drafts = useDrafts();
  const toast = useToast();
  const t = d.today;
  const kind = TABS.find(x => x.id === tab)?.kind || 'action';
  const trash = useTrashRecord(DB_OF[kind] || 'actions');

  const go = next => { const p = { tab: next.tab ?? tab }; const du = next.due ?? due; if (du !== 'all') p.due = du; setParams(p); setOpen(null); setSel(new Set()); };

  const lists = useMemo(() => {
    const week = addDays(t, 7);
    const dueOk = x => due === 'all' || (due === 'overdue' ? x.due && x.due < t : x.due && x.due >= t && x.due <= week);
    const acts = d.openActions.filter(dueOk);
    const out = {
      mine: acts.filter(a => groupOf(a.bic) === 'mine'), ext: acts.filter(a => groupOf(a.bic) === 'ext'), int: acts.filter(a => groupOf(a.bic) === 'int'),
      dt: acts.filter(a => groupOf(a.bic) === 'dt'), unfiled: acts.filter(a => groupOf(a.bic) === 'unfiled'), all: acts,
      items: d.items.filter(i => ['Set Up', 'In Design', 'Awaiting Approval', 'By Others', 'Backlog', 'Blocked', 'To Do', 'In Progress'].includes(i.status) && i.bic && (!preset.bic || i.bic === preset.bic)),
      rfis: d.openRfis.filter(dueOk), vars: d.openVcs,
    };
    const sortActions = l => [...l].sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
    for (const k of ['mine', 'ext', 'int', 'dt', 'unfiled', 'all']) out[k] = sortActions(out[k]);
    out.items.sort((a, b) => (a.editedAt || '').localeCompare(b.editedAt || ''));
    return out;
  }, [d, t, due, preset.bic]);

  if (d.isPending) return <Card className="p-4"><SkeletonRows rows={10} /></Card>;

  const needle = q.trim().toLowerCase();
  const rows = (lists[tab] || []).filter(r => !needle || [r.title, d.itemName(r.itemIds), r.bic, r.code, String(r.number ?? '')].filter(Boolean).join(' ').toLowerCase().includes(needle));
  const selectable = kind === 'action' || kind === 'item';
  const selectedRows = rows.filter(r => sel.has(r.id));

  const onTrash = row => trash.mutate({ id: row.id }, {
    onSuccess: () => setUndo({ row, db: DB_OF[kind] }),
    onError: e => toast.show(`Not deleted: ${e.message}`, { tone: 'danger' }),
  });

  return (
    <div className="flex flex-col gap-4">
      <Tabs label="Triage lists" value={tab} onChange={id => go({ tab: id })} tabs={TABS.map(x => ({
        id: x.id, label: x.kind === 'fixes' ? x.label : `${x.label} · ${(lists[x.id] || []).length}`,
      }))} />

      {undo && <UndoBar undo={undo} onClose={() => setUndo(null)} />}

      {tab !== 'fixes' && (
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox value={q} onChange={setQ} />
          {(kind === 'action' || kind === 'rfi') && ['all', 'overdue', 'week'].map(k => (
            <button key={k} type="button" aria-pressed={due === k} onClick={() => go({ due: k })}
              className={cx('min-h-11 px-3 border font-mono text-[12px] cursor-pointer', due === k ? 'bg-surface-hi border-accent text-accent' : 'bg-transparent border-line-strong text-muted hover:text-text-2')}>
              {{ all: 'Any due date', overdue: 'Overdue', week: 'Due this week' }[k]}
            </button>
          ))}
          {preset.bic && <Badge tone="info" className="py-1.5">BIC = {preset.bic}</Badge>}
          <span className="ml-auto font-mono text-[12px] text-muted">{rows.length} shown</span>
        </div>
      )}

      {selectable && selectedRows.length > 0 && <BulkBar kind={kind} rows={selectedRows} d={d} lookups={lookups} onDone={() => setSel(new Set())} />}

      {tab === 'fixes' ? <DataFixes d={d} /> : (
        <Card>
          {rows.length === 0 ? <p className="m-0 p-6 text-center text-[14px] text-muted">Nothing here.</p> : (
            <ul className="m-0 p-0 list-none">
              {selectable && (
                <li className="px-4 py-1 flex items-center gap-3 border-b border-line">
                  <Check label={`Select all ${rows.length}`} checked={selectedRows.length === rows.length} onChange={v => setSel(v ? new Set(rows.map(r => r.id)) : new Set())} />
                </li>
              )}
              {rows.map(r => (
                <Row key={r.id} kind={kind} row={r} d={d} lookups={lookups} drafts={drafts} onTrash={onTrash}
                  open={open === r.id} onToggle={() => setOpen(o => (o === r.id ? null : r.id))}
                  selected={sel.has(r.id)} onSelect={selectable ? v => setSel(s => { const n = new Set(s); if (v) n.add(r.id); else n.delete(r.id); return n; }) : null} />
              ))}
            </ul>
          )}
        </Card>
      )}
      <p className="m-0 font-mono text-[12px] text-muted max-w-[100ch]">
        Changes in a row wait until you press Save, then go to Notion in one update, and Make scenarios see it like any other edit.
        A due-date change or chase note is logged in Response Log; “Mark done” ticks Checked. Delete moves the page to Notion Trash (30 days).
      </p>
    </div>
  );
}

function UndoBar({ undo, onClose }) {
  const restore = useTrashRecord(undo.db);
  const [done, setDone] = useState(false);
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface border border-line border-l-4 border-l-accent text-[14px]">
      {done ? <span className="text-ok">Restored “{undo.row.title}” from Notion Trash.</span> : <span>Moved “{undo.row.title || 'row'}” to Notion Trash.</span>}
      {!done && <Button variant="secondary" disabled={restore.isPending} onClick={() => restore.mutate({ id: undo.row.id, restore: true }, { onSuccess: () => setDone(true) })}>{restore.isPending ? 'Restoring…' : 'Undo'}</Button>}
      <Button variant="secondary" onClick={onClose}>Dismiss</Button>
    </div>
  );
}
