// Workspace › Projects (workspace spec §5.1): live projects on the left with
// progress; the peek shows the project overview: every item with its position,
// ball in court, next date and progress % from drawing stages.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, Badge, SkeletonRows, cx } from '../../components/ui/index.js';
import { SearchBox, StatusPill } from '../../components/ui/table.jsx';
import { useSnapshots } from '../../hooks/hub.js';
import { useProgramme } from '../../hooks/programme.js';
import { useBriefData } from '../brief/shared.jsx';
import { WorkspaceShell } from './WorkspaceShell.jsx';
import { itemProgress, projectProgress, DONE_STATUSES } from '../../../hub-core/progress.js';
import { isOpenAction, isOpenRfi } from '../../../hub-core/derive.js';
import { ITEM_STATUS_COLORS } from '../../data/colors.js';
import { fmt } from '../../../hub-core/programme/view.js';
import { coordIndex } from '../items/coordination.js';

const EXTERNAL = new Set(['Client', 'Architect', 'Contractor', 'Consultant']);
const toneOf = s => { const c = ITEM_STATUS_COLORS[s]?.text || ''; return c.includes('danger') ? 'danger' : c.includes('accent') ? 'accent' : c.includes('ok') ? 'ok' : c.includes('info') ? 'info' : 'muted'; };
const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true });

function Bar({ pct, wide }) {
  if (pct == null) return <span className="font-mono text-[11px] text-muted">—</span>;
  return (
    <span className={cx('flex items-center gap-2', wide ? 'w-full' : 'w-[140px]')}>
      <span className="flex-1 h-1.5 bg-line"><span className={cx('block h-full', pct >= 90 ? 'bg-ok' : pct >= 50 ? 'bg-info' : 'bg-accent')} style={{ width: `${pct}%` }} /></span>
      <span className="w-9 text-right font-mono text-[12px] tabular-nums text-text-2">{pct}%</span>
    </span>
  );
}

export default function ProjectsLens() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('id') || '';
  const [q, setQ] = useState('');
  const d = useBriefData('');
  const { data: s } = useSnapshots(['clients']);
  const clients = useMemo(() => new Map(s.clients.map(c => [c.id, c.title])), [s.clients]);
  const prog = useMemo(() => itemProgress(d.all.tasks, d.all.drawings), [d.all.tasks, d.all.drawings]);

  // Per-item open counts
  const counts = useMemo(() => {
    const m = new Map();
    const get = id => { if (!m.has(id)) m.set(id, { actions: 0, overdue: 0, blocking: 0, supplier: 0, external: 0, rfis: 0 }); return m.get(id); };
    for (const a of d.all.actions) if (isOpenAction(a)) for (const id of a.itemIds || []) {
      const c = get(id); c.actions++;
      if (a.due && a.due < d.today) c.overdue++;
      if (a.blocks) c.blocking++;
      if (a.bic === 'Supplier') c.supplier++;
      if (EXTERNAL.has(a.bic)) c.external++;
    }
    for (const r of d.all.rfis) if (isOpenRfi(r)) for (const id of r.itemIds || []) get(id).rfis++;
    return id => m.get(id) || { actions: 0, overdue: 0, blocking: 0, supplier: 0, external: 0, rfis: 0 };
  }, [d.all.actions, d.all.rfis, d.today]);

  const live = useMemo(() => d.all.projects.filter(p => !p.archived && /^in progress$/i.test(p.status || '')), [d.all.projects]);
  const needle = q.trim().toLowerCase();
  const list = useMemo(() => live.filter(p => !needle || (p.title || '').toLowerCase().includes(needle) || (clients.get(p.clientIds?.[0]) || '').toLowerCase().includes(needle))
    .map(p => {
      const its = d.all.tasks.filter(t => !t.archived && t.projectId === p.id);
      const sum = its.reduce((a, t) => { const c = counts(t.id); a.overdue += c.overdue; a.blocking += c.blocking; a.supplier += c.supplier; return a; }, { overdue: 0, blocking: 0, supplier: 0 });
      return { ...p, pct: projectProgress(p.id, d.all.tasks, prog), open: its.filter(t => !DONE_STATUSES.has(t.status) && t.status !== 'Omitted').length, ...sum };
    }).sort(byTitle), [live, needle, clients, d.all.tasks, counts, prog]);

  // A project picked from search that isn't live is still shown
  const extra = selected && !list.some(p => p.id === selected) ? d.all.projects.find(p => p.id === selected) : null;
  const sel = list.find(p => p.id === selected) || (extra ? { ...extra, pct: projectProgress(extra.id, d.all.tasks, prog) } : null) || list[0] || null;
  useEffect(() => { if (sel && sel.id !== selected) setParams(p => { const n = new URLSearchParams(p); n.set('id', sel.id); return n; }, { replace: true }); }, [sel, selected, setParams]);

  return (
    <WorkspaceShell lens="projects" subtitle="Every live project and where its items are" toolbar={<SearchBox value={q} onChange={setQ} placeholder="Project or client" />}>
      {d.isPending ? <Card className="p-4"><SkeletonRows rows={8} /></Card> : (
        <div className="flex flex-col lg:flex-row items-start gap-6">
          <nav aria-label="Projects" className="w-full lg:w-[340px] lg:shrink-0 flex flex-col gap-2 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-1">
            {list.map(p => {
              const on = sel?.id === p.id;
              return (
                <button key={p.id} type="button" onClick={() => setParams(x => { const n = new URLSearchParams(x); n.set('id', p.id); return n; }, { replace: true })} aria-pressed={on}
                  className={cx('flex flex-col gap-1.5 px-4 py-3 border text-left cursor-pointer text-text', on ? 'bg-surface-hi border-accent' : 'bg-surface border-line hover:border-line-strong')}>
                  <span className="text-[15px] font-semibold leading-snug">{p.title}</span>
                  <span className="font-mono text-[11px] text-muted">{clients.get(p.clientIds?.[0]) || 'No client'} · {p.open} open item{p.open === 1 ? '' : 's'}</span>
                  <Bar pct={p.pct} wide />
                  {(p.overdue + p.blocking + p.supplier) > 0 && (
                    <span className="flex flex-wrap gap-1.5">
                      {p.overdue > 0 && <Badge tone="danger">{p.overdue} overdue</Badge>}
                      {p.blocking > 0 && <Badge tone="danger">{p.blocking} blocking</Badge>}
                      {p.supplier > 0 && <Badge tone="accent">{p.supplier} with suppliers</Badge>}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
          {sel && <ProjectPeek key={sel.id} p={sel} d={d} client={clients.get(sel.clientIds?.[0])} prog={prog} counts={counts} />}
        </div>
      )}
    </WorkspaceShell>
  );
}

const SORTS = {
  name: byTitle,
  progress: (a, b) => a.pct - b.pct || byTitle(a, b),
  attention: (a, b) => (b.c.blocking * 3 + b.c.overdue * 2 + b.c.actions) - (a.c.blocking * 3 + a.c.overdue * 2 + a.c.actions) || byTitle(a, b),
};

function ProjectPeek({ p, d, client, prog, counts }) {
  const [showClosed, setShowClosed] = useState(false);
  const [sort, setSort] = useState('name');
  const { items: progItems } = useProgramme(p.id);
  const next = useMemo(() => new Map(progItems.map(i => [i.id, i.next])), [progItems]);
  const coord = useMemo(() => coordIndex(d.all.tasks).get(p.id)?.item?.id, [d.all.tasks, p.id]);
  const all = d.all.tasks.filter(t => !t.archived && t.projectId === p.id && t.status !== 'Omitted');
  const rows = all.filter(t => showClosed || !DONE_STATUSES.has(t.status))
    .map(t => ({ ...t, pct: prog.get(t.id)?.pct ?? 0, n: prog.get(t.id)?.n ?? 0, c: counts(t.id), next: next.get(t.id) }))
    .sort((a, b) => (b.id === coord) - (a.id === coord) || SORTS[sort](a, b));
  const tot = all.reduce((a, t) => { const c = counts(t.id); a.actions += c.actions; a.overdue += c.overdue; a.supplier += c.supplier; a.external += c.external; a.rfis += c.rfis; if (c.blocking) a.blocked++; return a; }, { actions: 0, overdue: 0, supplier: 0, external: 0, rfis: 0, blocked: 0 });
  const done = all.filter(t => DONE_STATUSES.has(t.status)).length;

  return (
    <section aria-label="Selected project" className="flex-1 min-w-0 w-full flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[12px] text-muted">{[client, p.status].filter(Boolean).join(' · ')}</span>
          <h2 className="m-0 text-[24px] font-semibold leading-tight">{p.title}</h2>
        </div>
        <span className="flex gap-2">
          <Link to={`/workspace/items?project=${p.id}`} className="min-h-11 px-3 inline-flex items-center border border-line-strong text-text-2 no-underline font-mono text-[12px] uppercase tracking-[0.08em] hover:bg-surface-hi">Items</Link>
          <Link to={`/programme/${p.id}`} className="min-h-11 px-3 inline-flex items-center border border-line-strong text-text-2 no-underline font-mono text-[12px] uppercase tracking-[0.08em] hover:bg-surface-hi">Programme</Link>
          <a href={p.url} target="_blank" rel="noreferrer" className="min-h-11 px-3 inline-flex items-center border border-line-strong text-text-2 no-underline font-mono text-[12px] uppercase tracking-[0.08em] hover:bg-surface-hi">Notion</a>
        </span>
      </div>

      <div className="grid gap-px bg-line border border-line" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <div className="flex flex-col gap-2 p-4 bg-surface"><span className="section-label text-[11px]">Progress</span><Bar pct={p.pct} wide /></div>
        {[['Items done', `${done} / ${all.length}`], ['Open actions', tot.actions], ['Overdue', tot.overdue, 'danger'], ['Items blocked', tot.blocked, 'danger'], ['With suppliers', tot.supplier, 'accent'], ['With client side', tot.external], ['Open RFIs', tot.rfis]].map(([k, v, tone]) => (
          <div key={k} className="flex flex-col gap-1 p-4 bg-surface"><span className="section-label text-[11px]">{k}</span><span className={cx('font-mono text-[20px]', tone && v ? `text-${tone}` : 'text-text')}>{v}</span></div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Sort</span>
        {[['name', 'Name'], ['progress', 'Least progress'], ['attention', 'Needs attention']].map(([k, l]) => (
          <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)} className={cx('min-h-9 px-3 border text-[13px] cursor-pointer', sort === k ? 'bg-surface-hi border-accent text-accent' : 'bg-transparent border-line-strong text-text-2')}>{l}</button>
        ))}
        <label className="ml-auto min-h-9 inline-flex items-center gap-2 text-[13px] text-text-2 cursor-pointer">
          <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} className="w-[18px] h-[18px] accent-[var(--color-accent)]" /> Show closed
        </label>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="hidden md:grid grid-cols-[minmax(0,1fr)_150px_110px_130px_150px_150px] gap-3 px-4 py-2 border-b border-line font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
          <span>Item</span><span>Status</span><span>Ball in court</span><span>Next</span><span>Progress</span><span>Open</span>
        </div>
        <ul className="m-0 p-0 list-none">
          {rows.map(t => (
            <li key={t.id} className={cx('grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_150px_110px_130px_150px_150px] gap-x-3 gap-y-1 px-4 py-2.5 border-b border-line last:border-b-0 items-center hover:bg-surface-hi', DONE_STATUSES.has(t.status) && 'opacity-60')}>
              <Link to={`/workspace/items?item=${t.id}`} className="text-[14px] text-text no-underline hover:underline truncate">{t.title}{t.id === coord && <span className="ml-2 font-mono text-[11px] text-muted">coordination</span>}</Link>
              <span><StatusPill status={t.status} tone={toneOf(t.status)} /></span>
              <span className="font-mono text-[12px] text-text-2">{t.bic || '—'}</span>
              <span className="font-mono text-[12px] text-text-2 whitespace-nowrap">{t.next ? `${t.next.label} ${fmt(t.next.date)}` : '—'}</span>
              <span title={t.n ? `${t.n} drawing${t.n === 1 ? '' : 's'}` : 'No drawings yet'}><Bar pct={t.pct} /></span>
              <span className="flex flex-wrap gap-1">
                {t.c.blocking > 0 && <Badge tone="danger">blocking</Badge>}
                {t.c.overdue > 0 && <Badge tone="danger">{t.c.overdue} late</Badge>}
                {t.c.actions > 0 && <Badge tone="muted">{t.c.actions} act</Badge>}
                {t.c.rfis > 0 && <Badge tone="info">{t.c.rfis} RFI</Badge>}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <p className="m-0 font-mono text-[11px] text-muted max-w-[100ch]">Progress from drawing stages: S4 issued 20 · S4 A/B 35 · S5 issued 50 · S5 A/B 65 · A4.5/PRD issued 80 · signed off 90 · production 100 (S5 NA skips S5). Item = average of its drawings; closed items 100; project = average of its items.</p>
    </section>
  );
}
