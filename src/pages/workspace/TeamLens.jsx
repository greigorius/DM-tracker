// Workspace › Team (workspace spec §5.3): team members on the left; the peek
// shows everything one person has across projects: items they're on, their
// to-dos (with hours), actions they're responsible for and drawings they drew.
// Replaces the Team and Tasks pages; the DT summary email lives here.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { Card, Badge, SkeletonRows, cx } from '../../components/ui/index.js';
import { ToolbarSelect, SearchBox, StatusPill } from '../../components/ui/table.jsx';
import { useBootstrap, useSnapshots } from '../../hooks/hub.js';
import { useBriefData, latestSubmissions, fmtDay } from '../brief/shared.jsx';
import { ActionRow, TodoRow } from '../items/ItemPanel.jsx';
import { EmailPreview } from '../team/EmailPreview.jsx';
import { WorkspaceShell } from './WorkspaceShell.jsx';
import { addDays } from '../../../hub-core/derive.js';

const ROLE_ORDER = { DT: 0, DM: 1, DC: 2, Outsourced: 3 };
const HIDE_ROLES = new Set(['Client', 'Supplier']);
const CLOSED = new Set(['Complete', 'PC Approved', 'Close Out', 'Omitted']);
const has = (ids, id) => (ids || []).includes(id);
const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true });

function Sec({ title, count, right, children }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="m-0 flex items-center justify-between gap-3 section-label text-[11px] font-normal"><span>{title}{count != null && <span className="text-muted"> · {count}</span>}</span>{right}</h3>
      {children}
    </section>
  );
}

export default function TeamLens() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('id') || '';
  const project = params.get('project') || '';
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [email, setEmail] = useState(null);
  const d = useBriefData('');
  const { data: s } = useSnapshots(['todo', 'suppliers']);
  const { data: boot } = useBootstrap();
  const lookups = boot?.lookups || {};
  const t = d.today;
  const twoWeeks = addDays(t, 14);
  const suppliers = useMemo(() => s.suppliers.filter(x => !x.archived).map(x => ({ value: x.id, label: x.title || 'Untitled' })).sort((a, b) => a.label.localeCompare(b.label)), [s.suppliers]);
  const people = useMemo(() => d.all.team.filter(p => !p.archived).map(p => ({ value: p.id, label: p.role ? `${p.title} (${p.role})` : p.title })).sort((a, b) => a.label.localeCompare(b.label)), [d.all.team]);
  const inProject = ids => !project || d.items_.get(ids?.[0])?.projectId === project;

  // Per-person load, worked out once
  const load = useMemo(() => {
    const m = new Map();
    const get = id => { if (!m.has(id)) m.set(id, { todos: 0, overdue: 0, est: 0, actions: 0, items: 0, blocked: 0 }); return m.get(id); };
    for (const x of s.todo) {
      if (x.archived || x.done || !inProject(x.itemIds)) continue;
      for (const pid of x.personIds || []) {
        const r = get(pid); r.todos++;
        if (x.end && x.end < t) r.overdue++;
        if (x.status === 'Blocked') r.blocked++;
        if (Number(x.hours) > 0 && (!x.end || x.end <= twoWeeks)) r.est += Number(x.hours);
      }
    }
    for (const a of d.all.actions) if (!a.archived && !a.done && a.type !== 'Note' && inProject(a.itemIds)) for (const pid of a.personIds || []) { const r = get(pid); r.actions++; if (a.due && a.due < t) r.overdue++; }
    for (const i of d.all.tasks) if (!i.archived && !CLOSED.has(i.status) && (!project || i.projectId === project)) for (const pid of d.itemDts(i)) get(pid).items++;
    return id => m.get(id) || { todos: 0, overdue: 0, est: 0, actions: 0, items: 0, blocked: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.todo, d.all, project, t, twoWeeks]);

  const needle = q.trim().toLowerCase();
  const list = useMemo(() => d.all.team.filter(p => !p.archived && !HIDE_ROLES.has(p.role) && (!role || p.role === role) && (!needle || (p.title || '').toLowerCase().includes(needle)))
    .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || (load(b.id).todos + load(b.id).actions) - (load(a.id).todos + load(a.id).actions) || byTitle(a, b)), [d.all.team, role, needle, load]);
  const sel = list.find(p => p.id === selected) || list[0] || null;
  useEffect(() => { if (sel && sel.id !== selected) setParams(p => { const n = new URLSearchParams(p); n.set('id', sel.id); return n; }, { replace: true }); }, [sel, selected, setParams]);

  const projectOptions = [{ value: '', label: 'All projects' }, ...d.projectOptions];
  const roleOptions = [{ value: '', label: 'Everyone' }, ...['DT', 'DM', 'DC', 'Outsourced'].map(r => ({ value: r, label: r }))];

  return (
    <WorkspaceShell lens="team" subtitle="What each person has, across every project"
      toolbar={<>
        <ToolbarSelect label="Project" value={project} onChange={v => setParams(p => { const n = new URLSearchParams(p); if (v) n.set('project', v); else n.delete('project'); return n; })} options={projectOptions} />
        <ToolbarSelect label="Role" value={role} onChange={setRole} options={roleOptions} />
        <SearchBox value={q} onChange={setQ} placeholder="Name" />
      </>}>
      {d.isPending ? <Card className="p-4"><SkeletonRows rows={8} /></Card> : (
        <div className="flex flex-col lg:flex-row items-start gap-6">
          <nav aria-label="Team" className="w-full lg:w-[340px] lg:shrink-0 flex flex-col gap-2 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-1">
            {list.map(p => {
              const l = load(p.id), on = sel?.id === p.id;
              const cap = Number(p.capacity) || 0;
              const pct = cap ? Math.round((l.est / (cap * 2)) * 100) : null;
              return (
                <button key={p.id} type="button" onClick={() => setParams(x => { const n = new URLSearchParams(x); n.set('id', p.id); return n; }, { replace: true })} aria-pressed={on}
                  className={cx('flex flex-col gap-1.5 px-4 py-3 border text-left cursor-pointer text-text', on ? 'bg-surface-hi border-accent' : 'bg-surface border-line hover:border-line-strong')}>
                  <span className="flex justify-between gap-3"><span className="text-[15px] font-semibold">{p.title}</span><span className="font-mono text-[11px] text-muted">{p.role}</span></span>
                  <span className="flex flex-wrap gap-1.5">
                    {l.items > 0 && <Badge tone="info">{l.items} item{l.items === 1 ? '' : 's'}</Badge>}
                    {l.todos > 0 && <Badge tone="ok">{l.todos} to-do{l.todos === 1 ? '' : 's'}</Badge>}
                    {l.actions > 0 && <Badge tone="accent">{l.actions} action{l.actions === 1 ? '' : 's'}</Badge>}
                    {l.overdue > 0 && <Badge tone="danger">{l.overdue} overdue</Badge>}
                    {l.blocked > 0 && <Badge tone="danger">{l.blocked} blocked</Badge>}
                  </span>
                  {(l.est > 0 || cap > 0) && (
                    <span className="flex items-center gap-2 font-mono text-[11px] text-muted">
                      <span className="flex-1 h-1.5 bg-line"><span className={cx('block h-full', pct > 100 ? 'bg-danger' : 'bg-ok')} style={{ width: `${Math.min(100, pct ?? 0)}%` }} /></span>
                      {Math.round(l.est)} h{cap ? ` / ${cap * 2} h · 2 wks` : ' est'}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
          {sel && <PersonPeek key={sel.id} p={sel} d={d} todos={s.todo} lookups={lookups} people={people} suppliers={suppliers} project={project} onEmail={() => setEmail([sel.id])} />}
          {email && <EmailPreview dtIds={email} onClose={() => setEmail(null)} />}
        </div>
      )}
    </WorkspaceShell>
  );
}

function PersonPeek({ p, d, todos, lookups, people, suppliers, project, onEmail }) {
  const t = d.today;
  const [showDone, setShowDone] = useState(false);
  const inProject = ids => !project || d.items_.get(ids?.[0])?.projectId === project;
  const projectOf = ids => d.projects.get(d.items_.get(ids?.[0])?.projectId) || 'No project';

  // Items they started (item DT) plus items where they're drawing a sheet
  const items = d.all.tasks.filter(i => !i.archived && !CLOSED.has(i.status) && d.itemDts(i).includes(p.id) && (!project || i.projectId === project)).sort(byTitle);
  const myTodos = todos.filter(x => !x.archived && has(x.personIds, p.id) && inProject(x.itemIds) && (showDone || !x.done))
    .sort((a, b) => (a.done - b.done) || String(a.end || '9').localeCompare(String(b.end || '9')));
  const myActions = d.all.actions.filter(a => !a.archived && !a.done && a.type !== 'Note' && has(a.personIds, p.id) && inProject(a.itemIds))
    .sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9')));
  const drawings = latestSubmissions(d.all.submissions.filter(x => !x.archived && has(x.dtIds, p.id) && inProject(x.itemIds)))
    .filter(x => x.status !== 'Complete').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 40);
  const est = myTodos.filter(x => !x.done).reduce((n, x) => n + (Number(x.hours) || 0), 0);

  // Group to-dos and actions by project so a multi-project load reads clearly
  const groupBy = rows => { const m = new Map(); for (const r of rows) { const k = projectOf(r.itemIds); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return [...m]; };

  return (
    <section aria-label="Selected person" className="flex-1 min-w-0 w-full flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[12px] text-muted">{[p.role, p.email, p.capacity ? `${p.capacity} h/week` : null].filter(Boolean).join(' · ')}</span>
          <h2 className="m-0 text-[24px] font-semibold leading-tight">{p.title}</h2>
        </div>
        <span className="flex gap-2">
          {p.role === 'DT' && <button type="button" onClick={onEmail} className="min-h-11 px-3 inline-flex items-center gap-2 border border-line-strong bg-transparent text-text-2 hover:bg-surface-hi font-mono text-[12px] uppercase tracking-[0.08em] cursor-pointer"><Mail size={14} aria-hidden="true" /> Email summary</button>}
          <a href={p.url} target="_blank" rel="noreferrer" className="min-h-11 px-3 inline-flex items-center border border-line-strong text-text-2 no-underline font-mono text-[12px] uppercase tracking-[0.08em] hover:bg-surface-hi">Notion</a>
        </span>
      </div>

      <div className="grid gap-px bg-line border border-line" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {[['Items', items.length], ['Open to-dos', myTodos.filter(x => !x.done).length], ['Est hours open', Math.round(est)], ['Actions', myActions.length], ['Overdue', myTodos.filter(x => !x.done && x.end && x.end < t).length + myActions.filter(a => a.due && a.due < t).length]].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 p-4 bg-surface"><span className="section-label text-[11px]">{k}</span><span className={cx('font-mono text-[20px]', k === 'Overdue' && v ? 'text-danger' : 'text-text')}>{v}</span></div>
        ))}
      </div>

      <Sec title="Items" count={items.length}>
        {items.length ? (
          <ul className="m-0 p-0 list-none grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {items.map(i => (
              <li key={i.id}><Link to={`/workspace/items?item=${i.id}`} className="flex flex-col gap-1 px-3 py-2 bg-surface border border-line hover:border-line-strong no-underline text-text">
                <span className="text-[14px] font-medium truncate">{i.title}</span>
                <span className="flex flex-wrap items-center gap-1.5"><StatusPill status={i.status} tone="muted" />{i.bic && <Badge tone="muted">{i.bic}</Badge>}{has(i.dtIds, p.id) ? <Badge tone="ok">Lead</Badge> : <span title={`Item DT: ${i.dtIds.map(d.personName).filter(Boolean).join(', ') || 'none'}`}><Badge tone="info">Drawings</Badge></span>}<span className="font-mono text-[11px] text-muted truncate">{d.projects.get(i.projectId)}</span></span>
              </Link></li>
            ))}
          </ul>
        ) : <span className="text-[13px] text-muted">Not assigned to any open item.</span>}
      </Sec>

      <Sec title="To-dos" count={myTodos.filter(x => !x.done).length}
        right={<button type="button" onClick={() => setShowDone(v => !v)} className="bg-transparent border-0 p-0 font-mono text-[11px] text-muted cursor-pointer hover:text-text-2 normal-case tracking-normal">{showDone ? 'Hide done' : 'Show done'}</button>}>
        {myTodos.length ? groupBy(myTodos).map(([proj, rows]) => (
          <div key={proj} className="flex flex-col gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">{proj}</span>
            <div className="flex flex-col gap-3">{rows.map(x => (
              <div key={x.id} className="flex flex-col gap-0.5">
                <span className="font-mono text-[11px] text-info pl-3">{d.items_.get(x.itemIds?.[0])?.title || 'No item'}</span>
                <ul className="m-0 p-0 list-none"><TodoRow t={x} people={people} actions={d.all.actions} lookups={lookups} /></ul>
              </div>
            ))}</div>
          </div>
        )) : <span className="text-[13px] text-muted">No to-dos.</span>}
      </Sec>

      <Sec title="Actions they're responsible for" count={myActions.length}>
        {myActions.length ? groupBy(myActions).map(([proj, rows]) => (
          <div key={proj} className="flex flex-col gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">{proj}</span>
            <div className="flex flex-col gap-3">{rows.map(a => (
              <div key={a.id} className="flex flex-col gap-0.5">
                <span className="font-mono text-[11px] text-info pl-3">{d.items_.get(a.itemIds?.[0])?.title || 'No item'}</span>
                <ul className="m-0 p-0 list-none"><ActionRow a={a} itemId={a.itemIds?.[0]} lookups={lookups} today={t} team={d.all.team} suppliers={suppliers} /></ul>
              </div>
            ))}</div>
          </div>
        )) : <span className="text-[13px] text-muted">No open actions.</span>}
      </Sec>

      <Sec title="Drawings in progress" count={drawings.length}>
        {drawings.length ? (
          <ul className="m-0 p-0 list-none flex flex-col gap-1">
            {drawings.map(x => (
              <li key={x.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-[13px]">
                <span className="min-w-0 truncate"><a href={x.url} target="_blank" rel="noreferrer" className="text-text no-underline hover:underline">{x.title}</a> <span className="font-mono text-[11px] text-muted">· {d.items_.get(x.itemIds?.[0])?.title || ''}</span></span>
                <span className="font-mono text-[12px] text-text-2 whitespace-nowrap">{[x.stage, x.revision, x.status, x.grade && `grade ${x.grade}`, x.bic && `with ${x.bic}`].filter(Boolean).join(' · ')} · {fmtDay(x.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : <span className="text-[13px] text-muted">No drawings in Drawing Flow.</span>}
      </Sec>
    </section>
  );
}
