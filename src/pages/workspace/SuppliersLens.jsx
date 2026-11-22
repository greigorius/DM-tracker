// Workspace › Suppliers (workspace spec §5.4): companies on the left; the peek
// shows everything open with that company across projects (actions with
// contact, chase-by and next action, editable), items linked to the supplier,
// a quick "new chase" line and what closed recently.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, Badge, SkeletonRows, cx, useToast } from '../../components/ui/index.js';
import { SearchBox, StatusPill } from '../../components/ui/table.jsx';
import { useBootstrap, useCreateAction, useSnapshots } from '../../hooks/hub.js';
import { useBriefData, fmtDay } from '../brief/shared.jsx';
import { ActionRow } from '../items/ItemPanel.jsx';
import { WorkspaceShell } from './WorkspaceShell.jsx';
import { useActiveMeeting } from '../meetings/useMeeting.js';
import { addDays, isOpenAction } from '../../../hub-core/derive.js';

const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true });
const CLOSED = new Set(['Complete', 'PC Approved', 'Close Out', 'Omitted']);
const ctl = 'min-h-11 px-3 bg-ground border border-line-strong text-text text-[14px] outline-none focus:border-accent';

function Sec({ title, count, children }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="m-0 section-label text-[11px] font-normal">{title}{count != null && <span className="text-muted"> · {count}</span>}</h3>
      {children}
    </section>
  );
}

export default function SuppliersLens() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('id') || '';
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const d = useBriefData('');
  const { data: s } = useSnapshots(['suppliers']);
  const { data: boot } = useBootstrap();
  const lookups = boot?.lookups || {};

  const stats = useMemo(() => {
    const m = new Map();
    for (const a of d.all.actions) {
      if (!isOpenAction(a)) continue;
      for (const c of a.companyIds || []) {
        if (!m.has(c)) m.set(c, { open: 0, overdue: 0, blocking: 0, chase: 0, oldest: null });
        const x = m.get(c); x.open++;
        if (a.due && a.due < d.today) x.overdue++;
        if (a.blocks) x.blocking++;
        if (a.chaseBy && a.chaseBy <= d.today) x.chase++;
        const r = (a.received || a.createdAt || '').slice(0, 10);
        if (r && (!x.oldest || r < x.oldest)) x.oldest = r;
      }
    }
    return id => m.get(id) || { open: 0, overdue: 0, blocking: 0, chase: 0, oldest: null };
  }, [d.all.actions, d.today]);

  const needle = q.trim().toLowerCase();
  const list = useMemo(() => s.suppliers.filter(c => !c.archived && (all || stats(c.id).open || c.id === selected)
    && (!needle || [c.title, c.contact, ...(c.category || [])].filter(Boolean).join(' ').toLowerCase().includes(needle)))
    .sort((a, b) => stats(b.id).overdue - stats(a.id).overdue || stats(b.id).open - stats(a.id).open || byTitle(a, b)), [s.suppliers, all, stats, needle, selected]);
  const sel = list.find(c => c.id === selected) || list[0] || null;
  useEffect(() => { if (sel && sel.id !== selected) setParams(p => { const n = new URLSearchParams(p); n.set('id', sel.id); return n; }, { replace: true }); }, [sel, selected, setParams]);
  const suppliers = useMemo(() => s.suppliers.filter(x => !x.archived).map(x => ({ value: x.id, label: x.title || 'Untitled' })).sort((a, b) => a.label.localeCompare(b.label)), [s.suppliers]);

  return (
    <WorkspaceShell lens="suppliers" subtitle="Everything open with each company, across projects"
      toolbar={<>
        <SearchBox value={q} onChange={setQ} placeholder="Company, contact or category" />
        <label className="min-h-11 px-3 inline-flex items-center gap-2 border border-line-strong text-[13px] text-text-2 cursor-pointer">
          <input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} className="w-[18px] h-[18px] accent-[var(--color-accent)]" /> Show all companies
        </label>
      </>}>
      {d.isPending ? <Card className="p-4"><SkeletonRows rows={8} /></Card> : !list.length ? (
        <Card className="p-6 text-[14px] text-muted">No companies have open actions. Tick “Show all companies” to see the whole Suppliers list.</Card>
      ) : (
        <div className="flex flex-col lg:flex-row items-start gap-6">
          <nav aria-label="Companies" className="w-full lg:w-[320px] lg:shrink-0 flex flex-col gap-2 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-1">
            {list.map(c => {
              const x = stats(c.id), on = sel?.id === c.id;
              return (
                <button key={c.id} type="button" onClick={() => setParams(p => { const n = new URLSearchParams(p); n.set('id', c.id); return n; }, { replace: true })} aria-pressed={on}
                  className={cx('flex flex-col gap-1.5 px-4 py-3 border text-left cursor-pointer text-text', on ? 'bg-surface-hi border-accent' : 'bg-surface border-line hover:border-line-strong', !x.open && 'opacity-60')}>
                  <span className="flex justify-between gap-3"><span className="text-[15px] font-semibold">{c.title}</span>{c.contact && <span className="font-mono text-[11px] text-muted truncate">{c.contact}</span>}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {x.open > 0 ? <Badge tone="accent">{x.open} open</Badge> : <Badge tone="muted">nothing open</Badge>}
                    {x.overdue > 0 && <Badge tone="danger">{x.overdue} overdue</Badge>}
                    {x.blocking > 0 && <Badge tone="danger">{x.blocking} blocking</Badge>}
                    {x.chase > 0 && <Badge tone="info">{x.chase} chase due</Badge>}
                  </span>
                  {x.oldest && <span className="font-mono text-[11px] text-muted">oldest open since {fmtDay(x.oldest)}</span>}
                </button>
              );
            })}
          </nav>
          {sel && <CompanyPeek key={sel.id} c={sel} d={d} lookups={lookups} suppliers={suppliers} />}
        </div>
      )}
    </WorkspaceShell>
  );
}

function CompanyPeek({ c, d, lookups, suppliers }) {
  const t = d.today;
  const toast = useToast();
  const create = useCreateAction();
  const { id: meetingId } = useActiveMeeting();
  const [text, setText] = useState('');
  const [proj, setProj] = useState('');
  const [itemId, setItemId] = useState('');
  const [due, setDue] = useState('');
  const projectOf = ids => d.projects.get(d.items_.get(ids?.[0])?.projectId) || 'No project';
  const open = d.all.actions.filter(a => isOpenAction(a) && (a.companyIds || []).includes(c.id))
    .sort((a, b) => String(a.chaseBy || a.due || '9').localeCompare(String(b.chaseBy || b.due || '9')));
  const closed = d.all.actions.filter(a => !a.archived && a.done && (a.companyIds || []).includes(c.id) && (a.closedOn || '') >= addDays(t, -30))
    .sort((a, b) => String(b.closedOn).localeCompare(String(a.closedOn)));
  const items = d.all.tasks.filter(i => !i.archived && !CLOSED.has(i.status) && (c.itemIds || []).includes(i.id)).sort(byTitle);
  const groups = (() => { const m = new Map(); for (const a of open) { const k = projectOf(a.itemIds); if (!m.has(k)) m.set(k, []); m.get(k).push(a); } return [...m]; })();
  const projItems = d.all.tasks.filter(i => !i.archived && i.projectId === proj && !CLOSED.has(i.status)).sort(byTitle);

  const add = () => {
    if (!text.trim()) return;
    create.mutate({ type: 'Action', ...(meetingId && { meetingId }), text: text.trim(), itemId: itemId || null, bic: 'Supplier', companyId: c.id, contact: c.contact || null, due: due || null }, {
      onSuccess: () => toast.show(`Chase added for ${c.title}${itemId ? '' : ' (no item: it waits in the Inbox)'}`), onError: e => toast.show(`Not added: ${e.message}`, { tone: 'danger' }),
    });
    setText('');
  };

  return (
    <section aria-label="Selected company" className="flex-1 min-w-0 w-full flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[12px] text-muted">{[(c.category || []).join(', ').toLowerCase(), c.contact, c.email, c.phone].filter(Boolean).join(' · ') || 'Supplier'}</span>
          <h2 className="m-0 text-[24px] font-semibold leading-tight">{c.title}</h2>
        </div>
        <span className="flex gap-2">
          <Link to={`/trackers/actions?company=${c.id}`} className="min-h-11 px-3 inline-flex items-center border border-line-strong text-text-2 no-underline font-mono text-[12px] uppercase tracking-[0.08em] hover:bg-surface-hi">Chase list · Excel</Link>
          {c.email && <a href={`mailto:${c.email}`} className="min-h-11 px-3 inline-flex items-center border border-line-strong text-text-2 no-underline font-mono text-[12px] uppercase tracking-[0.08em] hover:bg-surface-hi">Email</a>}
          <a href={c.url} target="_blank" rel="noreferrer" className="min-h-11 px-3 inline-flex items-center border border-line-strong text-text-2 no-underline font-mono text-[12px] uppercase tracking-[0.08em] hover:bg-surface-hi">Notion</a>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3 bg-surface border border-line">
        <input type="text" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} placeholder={`New chase with ${c.title}…`} aria-label="New chase" className={cx(ctl, 'flex-1 min-w-[240px]')} />
        <select aria-label="Project" value={proj} onChange={e => { setProj(e.target.value); setItemId(''); }} className={cx(ctl, 'max-w-[220px]')}><option value="">Project…</option>{d.projectOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <select aria-label="Item" value={itemId} onChange={e => setItemId(e.target.value)} disabled={!proj} className={cx(ctl, 'max-w-[240px]')}><option value="">{proj ? 'Item…' : 'Pick a project'}</option>{projItems.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</select>
        <input type="date" aria-label="Due" value={due} onChange={e => setDue(e.target.value)} className={ctl} />
        <button type="button" onClick={add} disabled={!text.trim()} className="min-h-11 px-4 border border-accent text-accent bg-transparent font-mono text-[12px] uppercase tracking-[0.08em] cursor-pointer disabled:opacity-40">Add</button>
      </div>

      <Sec title="Open with them" count={open.length}>
        {open.length ? groups.map(([pname, rows]) => (
          <div key={pname} className="flex flex-col gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">{pname}</span>
            <div className="flex flex-col gap-3">{rows.map(a => (
              <div key={a.id} className="flex flex-col gap-0.5">
                <span className="font-mono text-[11px] pl-3 text-info">{d.items_.get(a.itemIds?.[0])?.title || 'No item'}
                  <span className="text-muted">{[a.contact && ` · ${a.contact}`, a.chaseBy && ` · chase ${fmtDay(a.chaseBy)}`, a.nextAction && ` · → ${a.nextAction}`].filter(Boolean).join('')}</span></span>
                <ul className="m-0 p-0 list-none"><ActionRow a={a} itemId={a.itemIds?.[0]} lookups={lookups} today={t} team={d.all.team} suppliers={suppliers} /></ul>
              </div>
            ))}</div>
          </div>
        )) : <span className="text-[13px] text-muted">Nothing open with {c.title}.</span>}
      </Sec>

      <Sec title="Items they supply" count={items.length}>
        {items.length ? (
          <ul className="m-0 p-0 list-none grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {items.map(i => (
              <li key={i.id}><Link to={`/workspace/items?item=${i.id}`} className="flex flex-col gap-1 px-3 py-2 bg-surface border border-line hover:border-line-strong no-underline text-text">
                <span className="text-[14px] font-medium truncate">{i.title}</span>
                <span className="flex flex-wrap items-center gap-1.5"><StatusPill status={i.status} tone="muted" /><span className="font-mono text-[11px] text-muted truncate">{d.projects.get(i.projectId)}</span></span>
              </Link></li>
            ))}
          </ul>
        ) : <span className="text-[13px] text-muted">No open items linked to {c.title} in Notion (Tasks → Suppliers).</span>}
      </Sec>

      <Sec title="Closed in the last 30 days" count={closed.length}>
        {closed.length ? (
          <ul className="m-0 p-0 list-none flex flex-col gap-1">
            {closed.map(a => (
              <li key={a.id} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 text-[13px]">
                <span className="font-mono text-[12px] text-muted">{fmtDay(a.closedOn)}</span>
                <span className="min-w-0 truncate"><a href={a.url} target="_blank" rel="noreferrer" className="text-text-2 no-underline hover:underline">{a.title}</a> <span className="font-mono text-[11px] text-muted">· {d.items_.get(a.itemIds?.[0])?.title || 'No item'}</span></span>
              </li>
            ))}
          </ul>
        ) : <span className="text-[13px] text-muted">Nothing closed recently.</span>}
      </Sec>
    </section>
  );
}
