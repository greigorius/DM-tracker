// Triage: act on the Brief's lists. Each row opens an edit strip; changes are
// held as a draft until Save, then go to Notion in one update. Delete moves the
// page to Notion Trash (restorable for 30 days, with Undo here).
import { useMemo, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, Badge, Button, Tabs, SkeletonRows, useToast, cx } from '../../components/ui/index.js';
import { SearchBox } from '../../components/ui/table.jsx';
import { useUpdateRecord, useTrashRecord, useBootstrap, useActionToTask } from '../../hooks/hub.js';
import { addDays, OPEN_RFI_STATUSES } from '../../../hub-core/derive.js';
import { TeamFixes, useTeamIssues } from './TeamFixes.jsx';
import { ctl, Sel, DateIn, Check, Mini, ItemPicker } from './controls.jsx';
import { BicReview } from './BicReview.jsx';
import { FixCard } from './FixCard.jsx';
import { Duplicates, useDuplicatePairs } from './Duplicates.jsx';
import { duplicateIds } from '../../../hub-core/duplicates.js';
import { teamErrorCount } from '../../../hub-core/team.js';
import { groupOf, ageDays, fmtDay, bicTone, extendDue, BICS, ACTIVE_ITEM_STATUSES, latestSubmissions } from './shared.jsx';

const TABS = [
  { id: 'mine', label: 'My moves', kind: 'action' },
  { id: 'ext', label: 'External', kind: 'action' },
  { id: 'int', label: 'Internal', kind: 'action' },
  { id: 'dt', label: 'DT team', kind: 'action' },
  { id: 'unfiled', label: 'Unfiled', kind: 'action' },
  { id: 'all', label: 'All actions', kind: 'action' },
  { id: 'dupes', label: 'Duplicates', kind: 'dupes' },
  { id: 'items', label: 'Items', kind: 'item' },
  { id: 'rfis', label: 'RFIs', kind: 'rfi' },
  { id: 'vars', label: 'Variations', kind: 'var' },
  { id: 'fixes', label: 'Data fixes', kind: 'fixes' },
  { id: 'team', label: 'Team', kind: 'team' },
  { id: 'bic', label: 'Ball in court', kind: 'bic' },
];
const DB_OF = { action: 'actions', item: 'tasks', rfi: 'rfis', var: 'variations' };
// Cockpit count cards land here with ?filter=<key>
const FROM_FILTER = {
  overdue: { tab: 'all', due: 'overdue' }, 'due-week': { tab: 'all', due: 'week' }, 'with-dts': { tab: 'items', bic: 'DT' },
  'bic-dm': { tab: 'mine' }, 'rfis-open': { tab: 'rfis' }, 'vcs-open': { tab: 'vars' },
};

// ── Small controls (shared ones live in controls.jsx) ──────────────────────
function Field({ label, changed, children }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cx('w-full sm:w-32 shrink-0 font-mono text-[11px] uppercase tracking-[0.1em]', changed ? 'text-accent' : 'text-muted')}>{label}{changed ? ' •' : ''}</span>
      {children}
    </div>
  );
}

// ── Add to Tasks: the To Do fields an action needs when it becomes a task ──
const notionUrl = id => `https://www.notion.so/${String(id).replace(/-/g, '')}`;
function TaskFields({ row, d, itemIds, value, onChange }) {
  const itemId = itemIds?.[0];
  if (row.taskIds?.length) {
    return <Field label="Tasks"><a href={notionUrl(row.taskIds[0])} target="_blank" rel="noreferrer" className="text-[14px] text-info no-underline hover:underline">Already in Tasks ↗</a></Field>;
  }
  const vcs = d.all.variations.filter(v => !v.archived && v.itemIds.includes(itemId));
  const rfis = d.all.rfis.filter(r => !r.archived && r.itemIds.includes(itemId));
  const people = [...d.all.team].sort((a, b) => (a.title || '').localeCompare(b.title || '')).map(p => ({ value: p.id, label: p.title }));
  const tick = on => {
    if (!on) return onChange(undefined);
    const openVcs = vcs.filter(v => !['Declined', 'Withdrawn'].includes(v.status));
    onChange({ title: row.title || '', personId: row.personIds[0] || '', start: d.today, end: row.due && row.due >= d.today ? row.due : d.today, hours: '', changeTask: openVcs.length > 0, vcId: openVcs.length === 1 ? openVcs[0].id : '', rfiId: '' });
  };
  const put = k => v => onChange({ ...value, [k]: v });
  return (
    <>
      <Field label="Tasks" changed={!!value}>
        <Check label="Add to Tasks (closes this action)" checked={!!value} onChange={tick} />
        {value && !itemId && <Badge tone="danger">Link an item first</Badge>}
      </Field>
      {value && (
        <div className="flex flex-col gap-2 ml-0 sm:ml-4 pl-3 border-l-2 border-accent">
          <Field label="Task"><input type="text" aria-label="Task description" value={value.title} onChange={e => put('title')(e.target.value)} className={cx(ctl, 'flex-1 min-w-[220px]')} /></Field>
          <Field label="Person"><Sel label="Person" value={value.personId} onChange={put('personId')} blank="Unassigned" options={people} /></Field>
          <Field label="Start / end">
            <DateIn label="Start" value={value.start} onChange={put('start')} />
            <span className="text-muted">→</span>
            <DateIn label="End" value={value.end} onChange={put('end')} />
          </Field>
          <Field label="Est hours"><input type="number" min="0" step="0.5" inputMode="decimal" aria-label="Estimated hours" value={value.hours} onChange={e => put('hours')(e.target.value)} className={cx(ctl, 'w-28')} /></Field>
          <Field label="Change task">
            <Check label="Variation work" checked={value.changeTask} onChange={put('changeTask')} />
            {value.changeTask && <Sel label="Variation" value={value.vcId} onChange={put('vcId')} blank={vcs.length ? 'Pick a variation…' : 'No variations on this item'} options={vcs.map(v => ({ value: v.id, label: `${v.code || 'VC'} ${v.title || ''}`.trim() }))} />}
            {value.changeTask && !value.vcId && <Badge tone="danger">Link the variation so the hours can be traced</Badge>}
          </Field>
          {rfis.length > 0 && <Field label="RFI"><Sel label="Related RFI" value={value.rfiId} onChange={put('rfiId')} blank="None" options={rfis.map(r => ({ value: r.id, label: `RFI-${String(r.number ?? '?').padStart(3, '0')} ${r.title || ''}`.trim() }))} /></Field>}
        </div>
      )}
    </>
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
  const toTask = useActionToTask();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const draft = drafts.get(row.id);
  const val = (k, orig) => (k in draft ? draft[k] : orig);
  const set = (k, orig) => v => drafts.set(row.id, k, v, orig);
  const n = Object.keys(draft).length;
  const t = d.today;

  const save = async () => {
    const { chase, task, ...set_ } = draft;
    if (kind === 'action' && 'dtId' in set_ && set_.dtId) set_.bic = 'DT';
    if (kind === 'item' && 'dtId' in set_ && set_.dtId && !('bic' in set_)) set_.bic = 'DT';
    if (task) delete set_.done; // moving closes the action anyway
    if ('title' in set_) {
      set_.title = String(set_.title).trim();
      if (!set_.title) { toast.show('The description can\'t be empty', { tone: 'danger' }); return; }
    }
    try {
      if (Object.keys(set_).length || chase) await update.mutateAsync({ id: row.id, set: set_, chase });
      if (task) {
        const res = await toTask.mutateAsync({ id: row.id, task: { ...task, itemId: (set_.itemIds || row.itemIds)?.[0] } });
        const n = res.row.number != null ? `TD-${String(res.row.number).padStart(3, '0')}` : 'Tasks';
        toast.show(`Moved to Tasks as ${n}; action closed`);
      } else toast.show('Saved to Notion');
      drafts.clear(row.id); onSaved?.();
    } catch (e) {
      toast.show(`Not saved: ${e.message}`, { tone: 'danger', ms: 8000 });
    }
  };
  const busy = update.isPending || toTask.isPending;

  let fields;
  if (kind === 'action') {
    fields = (
      <>
        <Field label="Description" changed={'title' in draft}>
          <textarea
            rows={2}
            value={val('title', row.title) || ''}
            onChange={e => set('title', row.title)(e.target.value)}
            aria-label="Action description"
            placeholder="What needs doing"
            className={cx(ctl, 'flex-1 min-w-[220px] py-2 resize-y leading-snug')}
          />
        </Field>
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
        <TaskFields row={row} d={d} itemIds={val('itemIds', row.itemIds)} value={draft.task} onChange={v => drafts.set(row.id, 'task', v, undefined)} />
        {row.log && <Field label="History"><pre className="m-0 flex-1 min-w-0 max-h-28 overflow-auto font-mono text-[12px] text-muted whitespace-pre-wrap border-l-2 border-line pl-3">{row.log}</pre></Field>}
      </>
    );
  } else if (kind === 'item') {
    fields = (
      <>
        <Field label="Status" changed={'status' in draft}><Sel label="Item status" value={val('status', row.status)} onChange={set('status', row.status)} options={lookups.statuses} /></Field>
        <Field label="Lock status" changed={'lockStatus' in draft}><Check label="Automation leaves this status alone" checked={val('lockStatus', !!row.lockStatus)} onChange={set('lockStatus', !!row.lockStatus)} /></Field>
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
        <Button onClick={save} disabled={!n || busy}>{busy ? 'Saving…' : draft.task ? 'Save & move to Tasks' : n ? `Save ${n} change${n === 1 ? '' : 's'}` : 'Save'}</Button>
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

function Row({ kind, row, d, open, onToggle, selected, onSelect, drafts, lookups, onTrash, dupe }) {
  const t = d.today;
  let title, meta, side;
  if (kind === 'action') {
    title = row.title; meta = [d.itemName(row.itemIds) || 'No item', d.personName(row.personIds[0]), row.source];
    side = <>{dupe && <Link to="?tab=dupes" className="no-underline" title="Looks like another open action — review in Duplicates"><Badge tone="info">Possible duplicate</Badge></Link>}{row.bic ? <Badge tone={bicTone(row.bic)}>{row.bic}</Badge> : <Badge tone="danger">Unfiled</Badge>}{row.due && <Badge tone={row.due < t ? 'danger' : 'muted'}>{fmtDay(row.due)}</Badge>}<span className="font-mono text-[12px] text-muted sm:w-10 sm:text-right">{ageDays(row.received || row.createdAt, t)}d</span></>;
  } else if (kind === 'item') {
    title = row.title; meta = [d.projects.get(row.projectId), row.status, row.dtIds.map(d.personName).join(', '), row.blocker?.join(', '), row.lockStatus && 'locked'];
    const st = d.stageOf(row.id);
    side = <>{st && <span title={st.why}><Badge tone={st.tone}>{st.label}</Badge></span>}{row.bic && <Badge tone={bicTone(row.bic)}>{row.bic}</Badge>}<span className="font-mono text-[12px] text-muted sm:w-10 sm:text-right">{ageDays(row.editedAt, t)}d</span></>;
  } else if (kind === 'rfi') {
    title = `RFI-${String(row.number ?? '?').padStart(3, '0')} ${row.title || ''}`; meta = [d.itemName(row.itemIds) || 'No item', row.tbcBy && `TBC ${row.tbcBy}`, row.stopsWork && 'stops work'];
    side = <><Badge tone="accent">{row.status}</Badge>{row.due && <Badge tone={row.due < t ? 'danger' : 'muted'}>{fmtDay(row.due)}</Badge>}<span className="font-mono text-[12px] text-muted sm:w-10 sm:text-right">{ageDays(row.raised, t) ?? '–'}d</span></>;
  } else {
    title = `${row.code || 'VC'} ${row.title || ''}`; meta = [d.itemName(row.itemIds) || 'No item', row.type, row.raisedBy && `raised by ${row.raisedBy}`];
    side = <><Badge tone="accent">{row.status || 'No status'}</Badge><span className="font-mono text-[12px] text-muted sm:w-10 sm:text-right">{ageDays(row.requested || row.createdAt, t)}d</span></>;
  }
  const dirty = Object.keys(drafts.get(row.id)).length > 0;
  return (
    <li className={cx('border-t border-line first:border-t-0', row.done && 'opacity-60')}>
      <div className="flex flex-wrap sm:flex-nowrap items-start gap-x-3 px-4 py-2">
        {onSelect && <input type="checkbox" aria-label={`Select ${title}`} checked={selected} onChange={e => onSelect(e.target.checked)} className="mt-3 w-5 h-5 accent-accent shrink-0" />}
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex-1 min-w-0 text-left bg-transparent border-0 p-0 py-1.5 cursor-pointer text-text flex gap-2">
          {open ? <ChevronDown size={16} className="mt-1 text-muted shrink-0" /> : <ChevronRight size={16} className="mt-1 text-muted shrink-0" />}
          <span className="min-w-0">
            <span className={cx('block text-[14px]', dirty && 'text-accent')}>{title || 'Untitled'}</span>
            <span className="block mt-0.5 font-mono text-[11px] text-muted break-words sm:truncate">{meta.filter(Boolean).join(' · ')}</span>
          </span>
        </button>
        {/* Phone: badges sit under the title (indented to it); wider screens: on the right */}
        <div className={cx('flex flex-wrap items-center gap-2 w-full pb-1 sm:w-auto sm:pb-0 sm:pl-0 sm:pt-1.5 sm:justify-end sm:shrink-0 sm:max-w-[45%]', onSelect ? 'pl-14' : 'pl-6')}>
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
  const trash = useTrashRecord(DB_OF[kind]);
  const toast = useToast();
  const [b, setB] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const setK = k => v => setB(x => { const n = { ...x }; if (v === '' || v == null || v === false || (Array.isArray(v) && !v.length)) delete n[k]; else n[k] = v; return n; });
  const noun = kind === 'item' ? 'item' : kind === 'action' ? 'action' : 'row';
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
  const remove = async () => {
    setBusy(true);
    let ok = 0;
    for (const r of rows) {
      try { await trash.mutateAsync({ id: r.id }); ok++; } catch { /* counted below */ }
    }
    setBusy(false);
    setConfirmDelete(false);
    toast.show(ok === rows.length
      ? `${ok} ${noun}${ok === 1 ? '' : 's'} deleted. They stay in Notion's trash for 30 days`
      : `${ok} of ${rows.length} deleted`, { tone: ok === rows.length ? 'ok' : 'danger', ms: 8000 });
    onDone();
  };
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 p-3 bg-surface-hi border border-accent">
      <span className="font-semibold mr-1">{rows.length} selected</span>
      {kind === 'item' && <Sel label="Status" value={b.status} onChange={setK('status')} blank="Status…" options={lookups.statuses} />}
      <Sel label="Ball in court" value={b.bic} onChange={setK('bic')} blank="Ball in court…" options={kind === 'item' ? lookups.bic : BICS} />
      <Sel label="DT" value={b.dtId} onChange={setK('dtId')} blank="DT…" options={d.dts.map(x => ({ value: x.id, label: x.name }))} />
      {kind === 'action' && <ItemPicker d={d} value={b.itemIds} onChange={setK('itemIds')} required={false} />}
      {kind === 'action' && <DateIn label="Due" value={b.due} onChange={setK('due')} />}
      {kind === 'action' && <Check label="Mark done" checked={b.done} onChange={setK('done')} />}
      <span className="ml-auto flex flex-wrap gap-2">
        {confirmDelete ? (
          <>
            <span className="self-center text-[14px] text-danger">Delete {rows.length} {noun}{rows.length === 1 ? '' : 's'}?</span>
            <Button className="!bg-danger !border-danger" onClick={remove} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</Button>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>Cancel</Button>
          </>
        ) : (
          <>
            <Button onClick={apply} disabled={!Object.keys(b).length || busy}>{busy ? 'Saving…' : 'Apply to selected'}</Button>
            <Button variant="secondary" onClick={() => setConfirmDelete(true)} disabled={busy} aria-label={`Delete ${rows.length} selected`}>Delete…</Button>
            <Button variant="secondary" onClick={onDone}>Clear</Button>
          </>
        )}
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

function DataFixes({ d }) {
  const checks = useChecks(d);
  return (
    <div className="flex flex-col gap-3">
      {checks.map(c => <FixCard key={c.id} check={{ ...c, tag: c.app }} d={d} />)}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function TriagePage() {
  const { data: d0, project: projectFilter } = useOutletContext();
  const { data: boot } = useBootstrap();
  const lookups = boot?.lookups || { statuses: [], bic: [], rfiTbcBy: [], rfiStatuses: [], vcStatuses: [], vcPause: [] };
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
  const { issues: teamIss } = useTeamIssues();
  const teamErrors = teamErrorCount(teamIss);
  const dupPairs = useDuplicatePairs(d);
  const dupIds = useMemo(() => duplicateIds(dupPairs), [dupPairs]);

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
    onSuccess: res => (res?.alreadyGone
      ? toast.show('Already archived in Notion, so removed from the Hub')
      : setUndo({ row, db: DB_OF[kind] })),
    onError: e => toast.show(`Not deleted: ${e.message}`, { tone: 'danger' }),
  });

  return (
    <div className="flex flex-col gap-4">
      <Tabs label="Triage lists" value={tab} onChange={id => go({ tab: id })} tabs={TABS.map(x => ({
        id: x.id, label: x.kind === 'fixes' || x.kind === 'bic' ? x.label : x.kind === 'team' ? `${x.label}${teamErrors ? ` · ${teamErrors}` : ''}` : x.kind === 'dupes' ? `${x.label} · ${dupPairs.length}` : `${x.label} · ${(lists[x.id] || []).length}`,
      }))} />

      {undo && <UndoBar undo={undo} onClose={() => setUndo(null)} />}

      {!['fixes', 'team', 'bic', 'dupes'].includes(tab) && (
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

      {tab === 'dupes' ? <Duplicates d={d} /> : tab === 'fixes' ? <DataFixes d={d} /> : tab === 'team' ? <TeamFixes d={d} /> : tab === 'bic' ? <BicReview project={projectFilter || ''} /> : (
        <Card>
          {rows.length === 0 ? <p className="m-0 p-6 text-center text-[14px] text-muted">Nothing here.</p> : (
            <ul className="m-0 p-0 list-none">
              {selectable && (
                <li className="px-4 py-1 flex items-center gap-3 border-b border-line">
                  <Check label={`Select all ${rows.length}`} checked={selectedRows.length === rows.length} onChange={v => setSel(v ? new Set(rows.map(r => r.id)) : new Set())} />
                </li>
              )}
              {rows.map(r => (
                <Row key={r.id} kind={kind} row={r} d={d} dupe={kind === 'action' && dupIds.has(r.id)} lookups={lookups} drafts={drafts} onTrash={onTrash}
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
