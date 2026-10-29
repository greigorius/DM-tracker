// Cockpit (/): Today strip, quick capture + Just logged, launch tiles.
// Reads only useBootstrap(). Creates entries and makes one-field changes;
// multi-field editing lives in Triage. Programme / delivery dates are never
// written here — the Scheduling Tool owns them.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import {
  AppHeader, SectionLabel, Card, Button, TypeTag, SkeletonRows,
  Tabs, Field, Checkbox, RadioPill, CountCard, ToolTile, useToast, timeAgo, cx,
} from '../components/ui/index.js';
import {
  useBootstrap, useCreateAction, useCreateRfi, useCreateVariation, useUpdateItem,
  prefetchSnapshots,
} from '../hooks/hub.js';
import { TOOLS, TOOL_SNAPSHOT, schedulingLink } from '../config/tools.js';
import { preloadRoute } from '../routes.jsx';

// ── Zone A: Today strip ──────────────────────────────────────────────────────
const CARDS = [
  { key: 'overdue', label: 'Overdue', tone: 'danger' },
  { key: 'due-week', label: 'Due this week', tone: 'accent' },
  { key: 'with-dts', label: 'With DTs', tone: 'info' },
  { key: 'bic-dm', label: 'BIC = DM', tone: 'accent', subTone: c => (c?.blocking ? 'danger' : undefined) },
  { key: 'rfis-open', label: 'Open RFIs', tone: 'info' },
  { key: 'vcs-open', label: 'Open VCs', tone: 'accent' },
];

const triageDbs = TOOLS.find(t => t.id === 'triage').dbs;
const warmTriage = () => { preloadRoute('/triage'); prefetchSnapshots(triageDbs); };

function TodayStrip({ counts, loading }) {
  return (
    <section aria-labelledby="today-label">
      <SectionLabel><span id="today-label">Today</span></SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {CARDS.map(c => (
          <CountCard
            key={c.key}
            to={`/triage?filter=${c.key}`}
            label={c.label}
            value={counts?.[c.key]?.value}
            sub={counts?.[c.key]?.sub}
            tone={c.tone}
            subTone={c.subTone?.(counts?.[c.key])}
            loading={loading}
            onHover={warmTriage}
          />
        ))}
      </div>
    </section>
  );
}

// ── Zone B: Quick capture ────────────────────────────────────────────────────
const TABS = [
  { id: 'note', label: 'Note / Action' },
  { id: 'rfi', label: 'RFI' },
  { id: 'vc', label: 'Variation' },
  { id: 'status', label: 'Status / BIC' },
];

const store = {
  get: k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

function useLastProject(tab, projects) {
  const key = `hub.capture.project.${tab}`;
  const [projectId, setProjectId] = useState(() => store.get(key));
  useEffect(() => { setProjectId(store.get(key)); }, [key]);
  const valid = projects.some(p => p.id === projectId) ? projectId : '';
  return [valid, v => { setProjectId(v); store.set(key, v); }];
}

function ProjectItemPicker({ lookups, projectId, setProjectId, itemId, setItemId }) {
  const items = useMemo(() => lookups.items.filter(i => i.projectId === projectId), [lookups.items, projectId]);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="Project" as="select" value={projectId} onChange={e => { setProjectId(e.target.value); setItemId(''); }} required>
        <option value="">Select project…</option>
        {lookups.projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.client ? ` · ${p.client}` : ''}</option>)}
      </Field>
      <Field label="Item" as="select" value={itemId} onChange={e => setItemId(e.target.value)} disabled={!projectId} required>
        <option value="">{projectId ? (items.length ? 'Select item…' : 'No active items') : 'Pick a project first'}</option>
        {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
      </Field>
    </div>
  );
}

const in3Days = today => {
  const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 3); return d.toISOString().slice(0, 10);
};

function QuickCapture({ boot }) {
  const toast = useToast();
  const [tab, setTab] = useState('note');
  const lookups = boot.lookups;
  const [projectId, setProjectId] = useLastProject(tab, lookups.projects);
  const [pickedItem, setItemId] = useState('');
  // An item only counts if it belongs to the selected project (tabs remember different projects).
  const item = lookups.items.find(i => i.id === pickedItem && i.projectId === projectId);
  const itemId = item ? item.id : '';

  // Note / Action
  const [noteType, setNoteType] = useState('Action');
  const [text, setText] = useState('');
  const [bic, setBic] = useState('DM');
  const [due, setDue] = useState('');
  const [blocks, setBlocks] = useState(false);
  // RFI
  const [question, setQuestion] = useState('');
  const [rfiBic, setRfiBic] = useState('DM');
  const [rfiDue, setRfiDue] = useState('');
  // Variation
  const [desc, setDesc] = useState('');
  const [raisedBy, setRaisedBy] = useState('DM');
  // Status / BIC: edits are held per item and default to the item's current values.
  const [edits, setEdits] = useState({ for: null });
  const cur = edits.for === itemId ? edits : {};
  const status = cur.status ?? item?.status ?? '';
  const itemBic = cur.bic ?? item?.bic ?? '';
  const dtId = cur.dtId ?? item?.dtIds?.[0] ?? '';
  const edit = (k, val) => setEdits({ ...cur, for: itemId, [k]: val });
  const setStatus = v => edit('status', v);
  const setItemBic = v => edit('bic', v);
  const setDtId = v => edit('dtId', v);

  const createAction = useCreateAction();
  const createRfi = useCreateRfi();
  const createVc = useCreateVariation();
  const updateItem = useUpdateItem();
  const busy = createAction.isPending || createRfi.isPending || createVc.isPending || updateItem.isPending;

  const done = (label, row) => toast.show(`${label} logged to Notion`, { action: row?.url ? { label: 'Open', href: row.url } : undefined });
  const fail = e => toast.show(`Not saved: ${e.message}`, { tone: 'danger', ms: 8000 });

  const statusChanges = item ? {
    ...(status !== (item.status || '') && { status }),
    ...(itemBic !== (item.bic || '') && { bic: itemBic }),
    ...(dtId !== (item.dtIds?.[0] || '') && { dtId }),
  } : {};

  const canSubmit = !!itemId && !busy && (
    tab === 'note' ? !!text.trim()
      : tab === 'rfi' ? !!question.trim()
        : tab === 'vc' ? !!desc.trim()
          : Object.keys(statusChanges).length > 0
  );

  const submit = e => {
    e.preventDefault();
    if (!canSubmit) return;
    if (tab === 'note') {
      const vars = { itemId, type: noteType, text: text.trim(), ...(noteType === 'Action' && { bic, due: due || null, blocks }) };
      setText(''); setDue(''); setBlocks(false);
      createAction.mutate(vars, { onSuccess: r => done(noteType, r.row), onError: fail });
    } else if (tab === 'rfi') {
      const vars = { itemId, question: question.trim(), bic: rfiBic, due: rfiDue || null };
      setQuestion(''); setRfiDue('');
      createRfi.mutate(vars, { onSuccess: r => done(`RFI-${String(r.row.number).padStart(3, '0')}`, r.row), onError: fail });
    } else if (tab === 'vc') {
      const vars = { itemId, description: desc.trim(), raisedBy };
      setDesc('');
      createVc.mutate(vars, { onSuccess: r => done(r.row.code || 'Variation', r.row), onError: fail });
    } else {
      setEdits({ for: null });
      updateItem.mutate({ id: itemId, ...statusChanges, prev: { bic: item.bic, status: item.status } }, {
        onSuccess: r => done('Item update', r.row), onError: fail,
      });
    }
  };

  return (
    <Card className="flex flex-col min-w-0" aria-labelledby="capture-label">
      <div className="px-4 pt-4"><SectionLabel className="mb-0"><span id="capture-label">Quick capture</span></SectionLabel></div>
      <div className="px-4 pt-3"><Tabs tabs={TABS} value={tab} onChange={setTab} label="Capture type" /></div>
      <form id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} onSubmit={submit} className="p-4 flex flex-col gap-4 flex-1">
        <ProjectItemPicker lookups={lookups} projectId={projectId} setProjectId={setProjectId} itemId={itemId} setItemId={setItemId} />

        {tab === 'note' && (
          <>
            <RadioPill name="note-type" label="Type" options={['Action', 'Note']} value={noteType} onChange={setNoteType} />
            <Field label={noteType === 'Note' ? 'Note' : 'Action'} as="textarea" value={text} onChange={e => setText(e.target.value)} placeholder={noteType === 'Note' ? 'What happened…' : 'What needs doing…'} />
            {noteType === 'Action' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Ball in court" as="select" value={bic} onChange={e => setBic(e.target.value)}>
                    {lookups.actionBic.map(b => <option key={b} value={b}>{b}</option>)}
                  </Field>
                  <Field label="Due" type="date" value={due} min={boot.today} onChange={e => setDue(e.target.value)} />
                </div>
                <Checkbox label="Blocks this item" tone="danger" checked={blocks} onChange={setBlocks} />
              </>
            )}
          </>
        )}

        {tab === 'rfi' && (
          <>
            <Field label="Question" as="textarea" value={question} onChange={e => setQuestion(e.target.value)} placeholder="What do you need answered…" hint={`Will be logged as RFI-${String(lookups.nextRfi).padStart(3, '0')}`} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Ball in court" as="select" value={rfiBic} onChange={e => setRfiBic(e.target.value)} hint={rfiBic === 'DM' ? 'DM = still to raise (status Raise)' : 'Status Open, TBC by this party'}>
                {lookups.rfiTbcBy.map(b => <option key={b} value={b}>{b}</option>)}
              </Field>
              <Field label="Response due" type="date" value={rfiDue} min={boot.today} onChange={e => setRfiDue(e.target.value)} />
            </div>
            <button type="button" className="self-start bg-transparent border-0 p-0 font-mono text-[12px] text-muted hover:text-text cursor-pointer min-h-11" onClick={() => setRfiDue(in3Days(boot.today))}>
              Due in 3 days
            </button>
          </>
        )}

        {tab === 'vc' && (
          <>
            <Field label="Description" as="textarea" value={desc} onChange={e => setDesc(e.target.value)} placeholder="What changed and why…" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Raised by" as="select" value={raisedBy} onChange={e => setRaisedBy(e.target.value)}>
                {lookups.vcRaisedBy.map(b => <option key={b} value={b}>{b}</option>)}
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-text-2">VC number</span>
                <span className="min-h-11 px-3 inline-flex items-center border border-line font-mono text-[14px] text-accent">
                  VC-{String(lookups.nextVc).padStart(4, '0')} <span className="ml-2 text-muted text-[11px]">auto</span>
                </span>
              </div>
            </div>
          </>
        )}

        {tab === 'status' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Status" as="select" value={status} onChange={e => setStatus(e.target.value)} disabled={!item}>
              <option value="">—</option>
              {lookups.statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </Field>
            <Field label="Ball in court" as="select" value={itemBic} onChange={e => setItemBic(e.target.value)} disabled={!item}>
              <option value="">—</option>
              {lookups.bic.map(b => <option key={b} value={b}>{b}</option>)}
            </Field>
            <Field label="Assigned DT" as="select" value={dtId} onChange={e => setDtId(e.target.value)} disabled={!item}>
              <option value="">Unassigned</option>
              {lookups.dts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Field>
          </div>
        )}

        <div className="mt-auto pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-line">
          <a href={schedulingLink(projectId, itemId)} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-text-2 hover:text-accent no-underline inline-flex items-center gap-1.5 min-h-11">
            Change delivery date in Scheduling <ArrowRight size={13} aria-hidden="true" />
          </a>
          <Button type="submit" disabled={!canSubmit}>
            {tab === 'status' ? 'Update item' : tab === 'note' ? `Log ${noteType.toLowerCase()}` : tab === 'rfi' ? 'Log RFI' : 'Log variation'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ── Just logged ──────────────────────────────────────────────────────────────
function JustLogged({ boot, loading }) {
  const projects = useMemo(() => new Map((boot?.lookups.projects || []).map(p => [p.id, p.name])), [boot]);
  const items = useMemo(() => new Map((boot?.lookups.items || []).map(i => [i.id, i.name])), [boot]);
  const rows = (boot?.justLogged || []).slice(0, 6);
  const logUrl = import.meta.env.VITE_URL_ACTIVITY_LOG;

  return (
    <Card className="flex flex-col min-w-0" aria-labelledby="logged-label">
      <div className="px-4 pt-4">
        <SectionLabel right={logUrl && <a href={logUrl} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-text-2 hover:text-accent no-underline">Activity log →</a>}>
          <span id="logged-label">Just logged</span>
        </SectionLabel>
      </div>
      {loading ? <SkeletonRows rows={6} className="px-4 pb-4" /> : rows.length === 0 ? (
        <p className="px-4 pb-4 m-0 text-[14px] text-muted">Nothing logged yet. Entries from quick capture, Drawing Flow submissions and status or date changes appear here.</p>
      ) : (
        <ol className="m-0 p-0 list-none">
          {rows.map(e => (
            <li key={e.id} className={cx('px-4 py-3 border-t border-line flex gap-3 items-start', e.pending && 'opacity-70')}>
              <TypeTag kind={e.kind} blocking={e.blocking} />
              <div className="min-w-0 flex-1">
                <div className={cx('text-[14px] truncate', e.blocking ? 'text-danger' : 'text-text')} title={e.summary}>
                  {e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="text-inherit no-underline hover:underline">{e.summary}</a> : e.summary}
                </div>
                <div className="mt-1 font-mono text-[11px] text-muted truncate">
                  {[projects.get(e.projectId), items.get(e.itemId), e.source, e.pending ? 'saving…' : timeAgo(e.at)].filter(Boolean).join(' · ')}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ── Zone C: Launch tiles ─────────────────────────────────────────────────────
function LaunchTiles({ boot }) {
  return (
    <section aria-labelledby="tools-label">
      <SectionLabel><span id="tools-label">Tools</span></SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {TOOLS.map(t => (
          <ToolTile
            key={t.id}
            tool={t}
            count={boot?.tiles?.[t.id]}
            updatedAt={boot?.updatedAt?.[TOOL_SNAPSHOT[t.id]]}
            onHover={() => { preloadRoute(t.path); if (t.dbs) prefetchSnapshots(t.dbs); }}
          />
        ))}
      </div>
    </section>
  );
}

export default function Cockpit() {
  const { data: boot, isPending, error } = useBootstrap();
  const loading = isPending && !boot;

  return (
    <div className="hub">
      <AppHeader title="Cockpit" />
      <main className="mx-auto max-w-[1440px] px-4 sm:px-6 py-6 flex flex-col gap-8">
        {error && !boot && (
          <Card className="p-4 border-danger text-danger text-[14px]" role="alert">Couldn’t load the Hub data: {error.message}</Card>
        )}
        {boot?.empty && (
          <Card className="p-4 text-[14px] text-text-2" role="status">
            The snapshot hasn’t been built yet. Press <strong>Sync now</strong>, or wait for the first scheduled sync.
          </Card>
        )}
        <TodayStrip counts={boot?.counts} loading={loading} />
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3 items-stretch">
          {boot ? <QuickCapture boot={boot} /> : <Card className="p-4"><SkeletonRows rows={5} /></Card>}
          <JustLogged boot={boot} loading={loading} />
        </div>
        <LaunchTiles boot={boot} />
        <nav aria-label="Legacy pages" className="font-mono text-[12px] text-muted flex flex-wrap items-center gap-x-5">
          <span>Also in the Hub:</span>
          {[['/trackers/task-schedule', 'Task schedule'], ['/trackers/item-schedule', 'Item schedule'], ['/trackers/finishes-schedule', 'Finishes'], ['/drawings', 'Drawing register'], ['/timeline', 'DT schedule']].map(([to, l]) => (
            <Link key={to} to={to} onMouseEnter={() => preloadRoute(to)} className="text-text-2 hover:text-accent no-underline min-h-11 inline-flex items-center">{l}</Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
