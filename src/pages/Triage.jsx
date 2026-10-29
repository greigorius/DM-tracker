// Triage (/triage?filter=<key>): the lists behind each Cockpit count card,
// read from cached snapshots. First cut is read-only with links to Notion;
// multi-field editing is the next step for this page.

import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppHeader, SectionLabel, Card, Badge, TypeTag, SkeletonRows, cx } from '../components/ui/index.js';
import { useSnapshots, useBootstrap } from '../hooks/hub.js';
import { FILTERS, weekEnd } from '../../hub-core/derive.js';

const DBS = ['tasks', 'actions', 'rfis', 'variations', 'projects', 'team'];

function Row({ kind, title, url, meta, right, danger }) {
  return (
    <li className="px-4 py-3 border-t border-line flex gap-3 items-start">
      <TypeTag kind={kind} blocking={danger} />
      <div className="min-w-0 flex-1">
        <div className={cx('text-[14px]', danger ? 'text-danger' : 'text-text')}>
          {url ? <a href={url} target="_blank" rel="noreferrer" className="text-inherit no-underline hover:underline">{title || 'Untitled'}</a> : title}
        </div>
        <div className="mt-1 font-mono text-[11px] text-muted">{meta.filter(Boolean).join(' · ')}</div>
      </div>
      {right}
    </li>
  );
}

export default function Triage() {
  const [params, setParams] = useSearchParams();
  const key = FILTERS[params.get('filter')] ? params.get('filter') : 'bic-dm';
  const { data: boot } = useBootstrap();
  const { data: s, isPending } = useSnapshots(DBS);

  const ctx = useMemo(() => {
    const items = new Map(s.tasks.map(i => [i.id, i]));
    const projects = new Map(s.projects.map(p => [p.id, p.title]));
    const team = new Map(s.team.map(t => [t.id, t.title]));
    const where = ids => { const it = items.get(ids?.[0]); return it ? [projects.get(it.projectId), it.title] : []; };
    return { items, projects, team, where };
  }, [s]);

  const today = boot?.today || new Date().toISOString().slice(0, 10);
  const result = useMemo(() => FILTERS[key].match(s, { today, weekEnd: weekEnd(today) }), [key, s, today]);
  const sections = [
    ['items', 'Items', result.items],
    ['actions', 'Actions', result.actions],
    ['rfis', 'RFIs', result.rfis],
    ['variations', 'Variations', result.variations],
  ].filter(([, , rows]) => rows);

  const due = d => d && <Badge tone={d < today ? 'danger' : 'muted'}>{d}</Badge>;

  return (
    <div className="hub">
      <AppHeader title="Triage" back="/" />
      <main className="mx-auto max-w-[1100px] px-4 sm:px-6 py-6 flex flex-col gap-6">
        <nav aria-label="Filters" className="flex flex-wrap gap-2">
          {Object.entries(FILTERS).map(([k, f]) => (
            <button
              key={k}
              type="button"
              onClick={() => setParams({ filter: k })}
              aria-pressed={k === key}
              className={cx('min-h-11 px-3 border font-mono text-[12px] uppercase tracking-[0.08em] cursor-pointer',
                k === key ? 'bg-surface-hi border-accent text-accent' : 'bg-transparent border-line-strong text-muted hover:text-text-2')}
            >
              {f.label} {boot?.counts?.[k] ? <span className="ml-1 tabular-nums">{boot.counts[k].value}</span> : null}
            </button>
          ))}
        </nav>

        {isPending ? <Card className="p-4"><SkeletonRows rows={8} /></Card> : sections.map(([id, label, rows]) => (
          <Card key={id} aria-labelledby={`sec-${id}`}>
            <div className="px-4 pt-4"><SectionLabel right={<span className="font-mono text-[12px] text-muted">{rows.length}</span>}><span id={`sec-${id}`}>{label}</span></SectionLabel></div>
            {rows.length === 0 ? <p className="px-4 pb-4 m-0 text-[14px] text-muted">Nothing here.</p> : (
              <ul className="m-0 p-0 list-none">
                {id === 'items' && rows.map(i => (
                  <Row key={i.id} kind="item" title={i.title} url={i.url} danger={i.blocker?.length > 0}
                    meta={[ctx.projects.get(i.projectId), i.status, `BIC ${i.bic || '—'}`, i.dtIds.map(d => ctx.team.get(d)).filter(Boolean).join(', '), i.blockerNote]} />
                ))}
                {id === 'actions' && rows.map(a => (
                  <Row key={a.id} kind={a.type === 'Note' ? 'note' : 'action'} title={a.title} url={a.url} danger={a.blocks}
                    meta={[...ctx.where(a.itemIds), `BIC ${a.bic || '—'}`, a.source]} right={due(a.due)} />
                ))}
                {id === 'rfis' && rows.map(r => (
                  <Row key={r.id} kind="rfi" title={`RFI-${String(r.number ?? '?').padStart(3, '0')} ${r.title || ''}`} url={r.url} danger={r.stopsWork}
                    meta={[...ctx.where(r.itemIds), r.status, r.tbcBy && `TBC ${r.tbcBy}`, r.stopsWork && 'stops work']} right={due(r.due)} />
                ))}
                {id === 'variations' && rows.map(v => (
                  <Row key={v.id} kind="vc" title={`${v.code || 'VC'} ${v.title || ''}`} url={v.url}
                    meta={[...ctx.where(v.itemIds), v.status, v.type, v.raisedBy && `raised by ${v.raisedBy}`]} right={v.requested && <Badge>{v.requested}</Badge>} />
                ))}
              </ul>
            )}
          </Card>
        ))}
        <p className="m-0 font-mono text-[12px] text-muted">
          Read-only for now: open a row in Notion to edit, or use <Link to="/" className="text-text-2 hover:text-accent">quick capture</Link> for one-field changes.
        </p>
      </main>
    </div>
  );
}
