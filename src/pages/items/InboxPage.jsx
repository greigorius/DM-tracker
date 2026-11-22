// Triage inbox (workspace spec §3): every open action, note, RFI, variation
// and to-do that is missing something it needs to be filed, newest first.
// Missing fields are shown in red; filling the last one files the record. Each row is
// linked to an item or filed to its project's Design Coordination item, and
// leaves the list. Target: empty. The old tabbed lists live at /triage/lists.
import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useOutletContext, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { Card, Badge, SkeletonRows, cx, useToast } from '../../components/ui/index.js';
import { SearchBox } from '../../components/ui/table.jsx';
import { useBootstrap, useSnapshots, useUpdateRecord, useTrashRecord, useCreateCoordinationItem } from '../../hooks/hub.js';
import { Sel, DateIn, Mini, Check } from '../brief/controls.jsx';
import { fmtDay, useStored } from '../brief/shared.jsx';
import { coordIndex } from './coordination.js';
import { inboxRecords, filedToday, INBOX_DBS, FIELD_LABEL } from './inbox.js';
import { Responsible } from '../actions/Responsible.jsx';
import { bicSet } from '../actions/party.js';

// Selects share the row and shrink to fit, so every control stays on one line
const FIT = 'flex-1 basis-[140px] min-w-0 !max-w-none';
const KINDS = ['Action', 'Note', 'RFI', 'Variation', 'To-do'];
const VC_TYPES = ['Design Change', 'Scope Change', 'Altered for Buildability'];
const MISS = '!border-danger';
const KIND_TONE = { Action: 'accent', Note: 'muted', RFI: 'info', Variation: 'accent', 'To-do': 'ok' };
const byName = (a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true });
const labelOf = ({ kind, row }) => (kind === 'RFI' ? `RFI-${String(row.number ?? '?').padStart(3, '0')} ${row.title || ''}`
  : kind === 'Variation' ? [row.code, row.title].filter(Boolean).join(' ') : row.title) || '(no text)';

function InlineText({ value, onSave }) {
  const [v, setV] = useState(value || '');
  const commit = () => { const t = v.trim(); if (!t) { setV(value || ''); return; } if (t !== (value || '')) onSave(t); };
  return (
    <input type="text" aria-label="Text" value={v} onChange={e => setV(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setV(value || ''); e.currentTarget.blur(); } }}
      className="min-h-9 px-2 flex-1 min-w-[240px] bg-transparent border border-transparent hover:border-line-strong focus:border-accent focus:bg-ground text-text text-[14px] outline-none" />
  );
}

function InboxRow({ rec, d, coord, projectOptions, lookups, people, suppliers, selected, onSelect }) {
  const { db, kind, row } = rec;
  const update = useUpdateRecord(db);
  const createCoord = useCreateCoordinationItem();
  const trash = useTrashRecord(db);
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  const [project, setProject] = useState('');
  const [itemId, setItemId] = useState('');
  const c = project ? coord.get(project) || { item: null, count: 0 } : null;
  const items = useMemo(() => (project ? d.all.tasks.filter(t => t.projectId === project && !t.archived && !['Complete', 'PC Approved', 'Close Out', 'Omitted'].includes(t.status)).sort(byName) : []), [d.all.tasks, project]);

  const save = (set, ok) => update.mutate({ id: row.id, set }, {
    onSuccess: () => ok && toast.show(ok),
    onError: e => toast.show(`Not saved: ${e.message}`, { tone: 'danger' }),
  });
  const link = (id, how) => save({ itemIds: [id] }, `${kind} ${how} ${d.items_.get(id)?.title || 'item'}`);
  const make = () => createCoord.mutate({ projectId: project }, {
    onSuccess: ({ row: it }) => toast.show(`Created ${it.title}`),
    onError: e => toast.show(`Not created: ${e.message}`, { tone: 'danger' }),
  });
  const isAction = db === 'actions';
  const miss = k => rec.missing.includes(k);
  const dts = people.filter(p => /\(DT\)$/.test(p.label));
  // Assignee (Person): actions and to-dos. Assigning a DT to an action passes it to the DT team.
  const hasPerson = isAction || db === 'todo';
  const assign = v => {
    if (db === 'todo') return save({ personId: v || null }, v ? `Assigned to ${d.personName(v)}` : 'Unassigned');
    const isDt = d.all.team.find(p => p.id === v)?.role === 'DT';
    return save({ dtId: v || null, ...(isDt && kind === 'Action' && { bic: 'DT' }) }, v ? `Assigned to ${d.personName(v)}` : 'Unassigned');
  };
  const remove = () => trash.mutate({ id: row.id }, {
    onSuccess: res => toast.show(res?.alreadyGone ? 'Already archived in Notion, so removed from the Hub' : `${kind} deleted (Notion Trash, 30 days)`, {
      ms: 8000,
      ...(!res?.alreadyGone && { action: { label: 'Undo', onClick: () => trash.mutate({ id: row.id, restore: true }, { onError: e => toast.show(`Not restored: ${e.message}`, { tone: 'danger' }) }) } }),
    }),
    onError: e => toast.show(`Not deleted: ${e.message}`, { tone: 'danger' }),
  });
  const meta = [row.source, row.from, fmtDay(rec.at)].filter(Boolean).join(' · ');

  return (
    <li className={cx('flex flex-col gap-2 px-4 py-3 border-b border-line last:border-b-0', selected && 'bg-surface-hi')}>
      <span className="flex flex-wrap items-center gap-2">
        <input type="checkbox" aria-label="Select" checked={selected} onChange={e => onSelect(e.target.checked)} className="w-5 h-5 shrink-0 accent-[var(--color-accent)] cursor-pointer" />
        {isAction ? (
          <button type="button" onClick={() => save(kind === 'Note' ? { type: 'Action', ...(!row.bic && { bic: 'DM' }) } : { type: 'Note' })} title={kind === 'Note' ? 'Make this an action' : 'Make this a note'}
            className={cx('shrink-0 min-h-7 px-2 border font-mono text-[11px] cursor-pointer bg-transparent', kind === 'Note' ? 'border-line-strong text-muted' : 'border-accent text-accent')}>{kind}</button>
        ) : <Badge tone={KIND_TONE[kind]}>{kind}</Badge>}
        {isAction || db === 'todo'
          ? <InlineText key={`${row.id}:${row.title}`} value={row.title} onSave={t => save({ title: t })} />
          : <a href={row.url} target="_blank" rel="noreferrer" className="flex-1 min-w-[240px] text-[14px] text-text no-underline hover:underline">{labelOf(rec)}</a>}
        <span className="font-mono text-[12px] text-muted">{meta}</span>
      </span>
      <span className="flex flex-wrap items-center gap-1.5 pl-7 font-mono text-[11px]">
        <span className="text-danger">Needs {rec.missing.map(k => FIELD_LABEL[k]).join(' · ')}</span>
        {!rec.missing.includes('item') && <Badge tone="info">{d.items_.get(row.itemIds?.[0])?.title || 'item'}</Badge>}
      </span>
      <span className="flex items-start gap-2">
        <span className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
        {kind === 'Action' && <>
          <Sel className={cx(FIT, miss('bic') && MISS)} label="Sits with" value={row.bic} onChange={v => save(bicSet(row, v, d.all.team))} blank="Sits with…" options={lookups.actionBic || []} />
          <span className={cx('shrink-0', miss('due') && '[&>input]:!border-danger')}><DateIn label="Due" value={row.due} onChange={v => save({ due: v || null })} /></span>
        </>}
        {kind === 'Action'
          ? <span className={cx(FIT, miss('responsible') && '[&_select]:!border-danger [&_input]:!border-danger')}><Responsible row={row} team={d.all.team} suppliers={suppliers} save={set => save(set)} compact /></span>
          : hasPerson && <Sel className={cx(FIT, miss('person') && MISS)} label="Assignee" value={row.personIds?.[0] || ''} onChange={assign} blank={db === 'todo' ? 'DT…' : 'Assignee…'} options={db === 'todo' ? dts : people} />}
        {db === 'todo' && <>
          <span className={cx('shrink-0', miss('end') && '[&>input]:!border-danger')}><DateIn label="End date" value={row.end} onChange={v => save({ end: v || null })} /></span>
          <input type="number" min="0" step="0.5" aria-label="Est hours" placeholder="Est h" defaultValue={row.hours ?? ''} key={`${row.id}:${row.hours}`}
            onBlur={e => { if (String(e.target.value) !== String(row.hours ?? '')) save({ hours: e.target.value }); }}
            className={cx('shrink-0 w-20 min-h-11 px-2 bg-ground border border-line-strong text-text text-[14px] outline-none focus:border-accent', miss('hours') && MISS)} />
        </>}
        {db === 'rfis' && <>
          <Sel className={cx(FIT, miss('tbcBy') && MISS)} label="TBC by" value={row.tbcBy} onChange={v => save({ tbcBy: v || null })} blank="TBC by…" options={(lookups.rfiTbcBy || []).filter(x => x !== 'DM')} />
          <span className={cx('shrink-0', miss('due') && '[&>input]:!border-danger')}><DateIn label="Response due" value={row.due} onChange={v => save({ due: v || null })} /></span>
        </>}
        {db === 'variations' && <>
          <Sel className={cx(FIT, miss('type') && MISS)} label="Variation type" value={row.type} onChange={v => save({ type: v || null })} blank="Type…" options={VC_TYPES} />
          <Sel className={cx(FIT, miss('raisedBy') && MISS)} label="Raised by" value={row.raisedBy} onChange={v => save({ raisedBy: v || null })} blank="Raised by…" options={lookups.vcRaisedBy || []} />
        </>}
        {miss('item') && <Sel className={cx(FIT, MISS)} label="Project" value={project} onChange={v => { setProject(v); setItemId(''); }} blank="Project…" options={projectOptions} />}
        {miss('item') && project && <>
          <Sel className={FIT} label="Item" value={itemId} onChange={setItemId} blank="Item…" options={items.map(i => ({ value: i.id, label: i.title }))} />
          <Mini onClick={() => link(itemId, 'linked to')} disabled={!itemId} className="min-h-11 px-3 shrink-0 whitespace-nowrap border border-line-strong bg-transparent text-text-2 hover:bg-surface-hi font-mono text-[12px] cursor-pointer disabled:opacity-40">Link</Mini>
          {c.item
            ? <Mini onClick={() => link(c.item.id, 'filed to')} className="min-h-11 px-3 shrink-0 whitespace-nowrap border border-line-strong bg-transparent text-text-2 hover:bg-surface-hi font-mono text-[12px] cursor-pointer">File as coordination</Mini>
            : c.count > 1
              ? <span className="inline-flex items-center gap-1.5 text-[12px] text-accent"><AlertTriangle size={13} aria-hidden="true" />{c.count} Design Coordination items: keep one starting 000-</span>
              : <Mini onClick={make} disabled={createCoord.isPending} className="min-h-11 px-3 shrink-0 whitespace-nowrap border border-line-strong bg-transparent text-text-2 hover:bg-surface-hi font-mono text-[12px] cursor-pointer">{createCoord.isPending ? 'Creating…' : 'Create Design Coordination item'}</Mini>}
        </>}
        </span>
        <span className="shrink-0 flex items-center gap-2">
          {confirm ? <>
            <span className="text-[13px] text-danger">Delete this {kind.toLowerCase()}?</span>
            <Mini onClick={() => { setConfirm(false); remove(); }}>Delete</Mini>
            <Mini onClick={() => setConfirm(false)}>Cancel</Mini>
          </> : (
            <button type="button" onClick={() => setConfirm(true)} aria-label={`Delete ${kind}`} title="Delete (Notion Trash, 30 days)"
              className="min-h-11 min-w-11 inline-flex items-center justify-center bg-transparent border border-line-strong text-muted hover:text-danger hover:border-danger cursor-pointer">
              <Trash2 size={15} aria-hidden="true" />
            </button>
          )}
        </span>
      </span>
    </li>
  );
}

// ── Batch edit: the same fields for every selected row ──────────────────────
const BTN = 'min-h-11 px-3 shrink-0 whitespace-nowrap border border-line-strong bg-transparent text-text-2 hover:bg-surface-hi font-mono text-[12px] cursor-pointer disabled:opacity-40 disabled:cursor-default';
function BulkBar({ recs, d, coord, projectOptions, lookups, people, onDone }) {
  const up = { actions: useUpdateRecord('actions'), rfis: useUpdateRecord('rfis'), variations: useUpdateRecord('variations'), todo: useUpdateRecord('todo') };
  const tr = { actions: useTrashRecord('actions'), rfis: useTrashRecord('rfis'), variations: useTrashRecord('variations'), todo: useTrashRecord('todo') };
  const toast = useToast();
  const [bic, setBic] = useState('');
  const [person, setPerson] = useState('');
  const [project, setProject] = useState('');
  const [itemId, setItemId] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const c = project ? coord.get(project) || { item: null, count: 0 } : null;
  const items = useMemo(() => (project ? d.all.tasks.filter(t => t.projectId === project && !t.archived && !['Complete', 'PC Approved', 'Close Out', 'Omitted'].includes(t.status)).sort(byName) : []), [d.all.tasks, project]);
  const actions = recs.filter(r => r.kind === 'Action');
  const withPerson = recs.filter(r => r.db === 'actions' || r.db === 'todo');

  // One Notion write per record, in turn (keeps within Notion's rate limit)
  const run = async (list, fn, done) => {
    setBusy(true);
    let ok = 0;
    for (const r of list) { try { await fn(r); ok++; } catch { /* counted below */ } }
    setBusy(false);
    toast.show(ok === list.length ? done(ok) : `${ok} of ${list.length} done; the rest were refused by Notion`, { tone: ok === list.length ? 'ok' : 'danger', ms: 8000 });
    return ok;
  };
  const apply = () => run([...new Set([...(bic ? actions : []), ...(person ? withPerson : [])])], r => {
    const set = {};
    if (bic && r.kind === 'Action') set.bic = bic;
    if (person && r.db === 'todo') set.personId = person;
    if (person && r.db === 'actions') {
      set.dtId = person;
      if (!bic && r.kind === 'Action' && d.all.team.find(p => p.id === person)?.role === 'DT') set.bic = 'DT';
    }
    return up[r.db].mutateAsync({ id: r.row.id, set });
  }, n => `Updated ${n} record${n === 1 ? '' : 's'}`).then(() => { setBic(''); setPerson(''); });
  const link = (id, how) => run(recs, r => up[r.db].mutateAsync({ id: r.row.id, set: { itemIds: [id] } }), n => `${n} record${n === 1 ? '' : 's'} ${how} ${d.items_.get(id)?.title || 'item'}`).then(onDone);
  const remove = () => {
    const list = recs;
    run(list, r => tr[r.db].mutateAsync({ id: r.row.id }), n => `${n} record${n === 1 ? '' : 's'} deleted (Notion Trash, 30 days)`).then(n => {
      if (n) toast.show(`Undo the delete of ${n}?`, { ms: 10000, action: { label: 'Undo', onClick: () => run(list, r => tr[r.db].mutateAsync({ id: r.row.id, restore: true }), m => `Restored ${m}`) } });
      onDone();
    });
  };

  return (
    <div className="sticky top-0 z-20 flex flex-col gap-2 p-3 bg-surface-hi border border-accent">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-semibold mr-1">{recs.length} selected</span>
        <span className="font-mono text-[12px] text-muted">{['Action', 'Note', 'RFI', 'Variation', 'To-do'].map(k => [k, recs.filter(r => r.kind === k).length]).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(' · ')}</span>
        <button type="button" onClick={onDone} className={cx(BTN, 'ml-auto')}>Clear selection</button>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <Sel className={FIT} label="Sits with (actions)" value={bic} onChange={setBic} blank={actions.length ? `Sits with… (${actions.length} action${actions.length === 1 ? '' : 's'})` : 'Sits with… (no actions)'} options={actions.length ? lookups.actionBic || [] : []} />
        <Sel className={FIT} label="Assignee (actions, notes, to-dos)" value={person} onChange={setPerson} blank={withPerson.length ? `Assignee… (${withPerson.length})` : 'Assignee… (none apply)'} options={withPerson.length ? people : []} />
        <button type="button" className={BTN} disabled={busy || (!bic && !person)} onClick={apply}>{busy ? 'Saving…' : 'Apply'}</button>
        <Sel className={FIT} label="Project" value={project} onChange={v => { setProject(v); setItemId(''); }} blank="Project…" options={projectOptions} />
        {project && <>
          <Sel className={FIT} label="Item" value={itemId} onChange={setItemId} blank="Item…" options={items.map(i => ({ value: i.id, label: i.title }))} />
          <button type="button" className={BTN} disabled={busy || !itemId} onClick={() => link(itemId, 'linked to')}>Link all</button>
          {c.item && <button type="button" className={BTN} disabled={busy} onClick={() => link(c.item.id, 'filed to')}>File all as coordination</button>}
        </>}
        <span className="shrink-0 flex items-center gap-2">
          {confirm ? <>
            <span className="text-[13px] text-danger">Delete {recs.length}?</span>
            <button type="button" className={BTN} disabled={busy} onClick={() => { setConfirm(false); remove(); }}>Delete</button>
            <button type="button" className={BTN} onClick={() => setConfirm(false)}>Cancel</button>
          </> : (
            <button type="button" onClick={() => setConfirm(true)} disabled={busy} aria-label={`Delete ${recs.length} selected`} title="Delete selected (Notion Trash, 30 days)"
              className="min-h-11 min-w-11 inline-flex items-center justify-center bg-transparent border border-line-strong text-muted hover:text-danger hover:border-danger cursor-pointer">
              <Trash2 size={15} aria-hidden="true" />
            </button>
          )}
        </span>
      </span>
    </div>
  );
}

export default function InboxPage() {
  const { search } = useLocation();
  const [params] = useSearchParams();
  const { data: d } = useOutletContext();
  const { data: snaps, isPending } = useSnapshots(INBOX_DBS);
  const { data: boot } = useBootstrap();
  const lookups = boot?.lookups || {};
  const [kind, setKind] = useStored('hub.inbox.kind', '');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(() => new Set());
  const coord = useMemo(() => coordIndex(d.all.tasks), [d.all.tasks]);
  const all = useMemo(() => inboxRecords(snaps), [snaps]);
  const filed = useMemo(() => filedToday(snaps, d.today), [snaps, d.today]);
  const projectOptions = useMemo(() => d.all.projects.filter(p => !p.archived && /^in progress$/i.test(p.status || ''))
    .map(p => ({ value: p.id, label: p.title || 'Untitled' })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })), [d.all.projects]);
  const people = useMemo(() => d.all.team.filter(p => !p.archived).sort((a, b) => (a.title || '').localeCompare(b.title || '')).map(p => ({ value: p.id, label: p.role ? `${p.title} (${p.role})` : p.title })), [d.all.team]);
  const suppliers = useMemo(() => (d.all.suppliers || []).filter(x => !x.archived).map(x => ({ value: x.id, label: x.title || 'Untitled' })).sort((a, b) => a.label.localeCompare(b.label)), [d.all.suppliers]);
  const missing = useMemo(() => projectOptions.filter(p => !coord.get(p.value)?.item), [projectOptions, coord]);

  // Old links (Cockpit cards, Brief KPIs) carry ?tab= / ?filter= for the tabbed lists
  if (params.get('tab') || params.get('filter')) return <Navigate to={`/triage/lists${search}`} replace />;
  if (d.isPending || isPending) return <Card className="p-4"><SkeletonRows rows={10} /></Card>;

  const needle = q.trim().toLowerCase();
  const counts = Object.fromEntries(KINDS.map(k => [k, all.filter(r => r.kind === k).length]));
  const rows = all.filter(r => (!kind || r.kind === kind) && (!needle || [labelOf(r), r.row.source, r.row.from].filter(Boolean).join(' ').toLowerCase().includes(needle)));
  const chosen = rows.filter(r => sel.has(r.row.id));
  const pick = (id, on) => setSel(s => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {['', ...KINDS].map(k => (
          <button key={k || 'all'} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
            className={cx('min-h-11 px-3 border font-mono text-[12px] cursor-pointer', kind === k ? 'bg-surface-hi border-accent text-accent' : 'bg-transparent border-line-strong text-muted hover:text-text-2')}>
            {k || 'All'} · {k ? counts[k] : all.length}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <SearchBox value={q} onChange={setQ} />
          <Link to="/triage/lists" className="min-h-11 px-3 inline-flex items-center font-mono text-[12px] text-muted no-underline hover:text-text-2">Old lists →</Link>
        </span>
      </div>

      {missing.length > 0 && (
        <div className="flex items-start gap-2 px-4 py-3 bg-surface border border-line border-l-4 border-l-accent text-[13px] text-text-2">
          <AlertTriangle size={15} className="text-accent mt-0.5 shrink-0" aria-hidden="true" />
          <span>Live projects without a single Design Coordination item: {missing.map(p => p.label).join(' · ')}. Pick one of them on a row to create it, or fix duplicates in Notion.</span>
        </div>
      )}

      {chosen.length > 0 && <BulkBar recs={chosen} d={d} coord={coord} projectOptions={projectOptions} lookups={lookups} people={people} onDone={() => setSel(new Set())} />}

      <Card>
        {rows.length === 0 ? (
          <p className="m-0 p-8 flex items-center justify-center gap-2 text-[14px] text-ok"><CheckCircle2 size={16} aria-hidden="true" /> {all.length ? 'Nothing matches this filter.' : 'Inbox empty: everything is filed.'}</p>
        ) : (
          <ul className="m-0 p-0 list-none">
            <li className="px-4 py-1 flex items-center gap-3 border-b border-line">
              <Check label={`Select all ${rows.length}`} checked={chosen.length === rows.length} onChange={v => setSel(v ? new Set(rows.map(r => r.row.id)) : new Set())} />
            </li>
            {rows.map(r => <InboxRow key={r.row.id} rec={r} d={d} coord={coord} projectOptions={projectOptions} lookups={lookups} people={people} suppliers={suppliers} selected={sel.has(r.row.id)} onSelect={on => pick(r.row.id, on)} />)}
          </ul>
        )}
      </Card>
      {filed.length > 0 && (
        <Card className="p-3 flex flex-col gap-1.5 border-ok/50">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ok flex items-center gap-1.5"><CheckCircle2 size={13} aria-hidden="true" /> Filed today · {filed.length}</span>
          <ul className="m-0 p-0 list-none flex flex-col gap-1 text-[13px]">
            {filed.map(r => (
              <li key={r.row.id} className="flex flex-wrap gap-2"><Badge tone={KIND_TONE[r.kind]}>{r.kind}</Badge><span className="text-text-2">{labelOf(r)}</span>
                <span className="font-mono text-[12px] text-muted">→ {d.items_.get(r.row.itemIds?.[0])?.title || 'item'}{r.row.bic ? ` · ${r.row.bic}` : ''}{r.row.due ? ` · due ${fmtDay(r.row.due)}` : ''}</span></li>
            ))}
          </ul>
        </Card>
      )}
      <p className="m-0 font-mono text-[12px] text-muted max-w-[100ch]">
        Every open record still missing something it needs (shown in red). Fill the last gap and it moves to Filed today. For a missing item, pick the project, then the item or File as coordination.
      </p>
    </div>
  );
}
