// Brief (workspace spec §4): its own tab with two views.
//   My day            what needs you today: overdue and due with you, drawing
//                     reviews, chases due, DT tasks due or blocked, RFIs late
//   Latest movements  what happened across the Hub, newest first
// One search box (item, project, drawing no., person, company) filters both.
import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Card, Badge, SkeletonRows, cx } from '../../components/ui/index.js';
import { SearchBox } from '../../components/ui/table.jsx';
import { useSnapshots, useBootstrap } from '../../hooks/hub.js';
import { addDays, isOpenRfi, isOpenAction, DONE_ITEM_STATUSES } from '../../../hub-core/derive.js';
import { rfiHolds, variationHolds } from '../../../netlify/functions/_statusRules.js';
import { fmtDay, useStored, latestSubmissions } from './shared.jsx';

const VIEWS = [{ id: 'day', label: 'My day' }, { id: 'moves', label: 'Latest movements' }];
const SPANS = [1, 3, 7, 14];
const KIND = {
  submission: { label: 'Drawing', tone: 'ok' }, returned: { label: 'Returned', tone: 'info' },
  action: { label: 'Action', tone: 'accent' }, closed: { label: 'Closed', tone: 'muted' }, note: { label: 'Note', tone: 'muted' },
  rfi: { label: 'RFI', tone: 'info' }, answered: { label: 'Answered', tone: 'ok' },
  vc: { label: 'Variation', tone: 'accent' }, decided: { label: 'Decided', tone: 'ok' },
  task: { label: 'Task', tone: 'ok' }, done: { label: 'Task done', tone: 'muted' },
  status: { label: 'Status', tone: 'info' }, bic: { label: 'BIC', tone: 'info' }, date: { label: 'Dates', tone: 'muted' }, log: { label: 'Log', tone: 'muted' },
};
const itemLink = (id, label) => (id ? <Link to={`/workspace/items?item=${id}`} className="text-info no-underline hover:underline">{label}</Link> : <span className="text-muted">{label}</span>);

function useBriefModel(d, todo, events, project) {
  return useMemo(() => {
    const t = d.today;
    const items = d.items_;
    const proj = id => d.projects.get(items.get(id)?.projectId) || '';
    const inScope = ids => !project || items.get(ids?.[0])?.projectId === project;
    const sup = new Map((d.all.suppliers || []).map(s => [s.id, s.title]));
    const drawingNo = new Map((d.all.drawings || []).map(x => [x.id, x.title]));
    const base = (r, itemIds, extra = []) => {
      const itemId = itemIds?.[0] || null;
      const item = items.get(itemId)?.title || '';
      return { itemId, item, project: proj(itemId), text: [r.title, item, proj(itemId), ...extra].filter(Boolean).join(' ').toLowerCase() };
    };
    const who = a => sup.get(a.companyIds?.[0]) || d.personName(a.personIds?.[0]) || a.contact || '';

    // ── My day ──
    const soon = addDays(t, 2);
    const open = d.openActions;
    const mine = open.filter(a => a.bic === 'DM');
    const day = {
      overdue: mine.filter(a => a.due && a.due < t).map(a => ({ ...a, ...base(a, a.itemIds), when: a.due })),
      dueSoon: mine.filter(a => a.due && a.due >= t && a.due <= soon).map(a => ({ ...a, ...base(a, a.itemIds), when: a.due })),
      reviews: latestSubmissions(d.submissions).filter(x => x.bic === 'DM' && x.status !== 'Complete')
        .map(x => ({ ...x, ...base(x, x.itemIds, (x.drawingIds || []).map(id => drawingNo.get(id))), when: x.bicSince || x.createdAt?.slice(0, 10) })),
      chases: open.filter(a => a.bic && a.bic !== 'DM' && ((a.chaseBy && a.chaseBy <= t) || (a.due && a.due < t)))
        .map(a => ({ ...a, ...base(a, a.itemIds, [who(a), a.bic]), who: who(a), when: a.chaseBy && a.chaseBy <= t ? a.chaseBy : a.due })),
      tasks: todo.filter(x => !x.archived && !x.done && inScope(x.itemIds) && ((x.end && x.end <= soon) || x.status === 'Blocked'))
        .map(x => ({ ...x, ...base(x, x.itemIds, [d.personName(x.personIds?.[0])]), who: d.personName(x.personIds?.[0]) || 'Unassigned', when: x.end })),
      rfis: d.rfis.filter(r => isOpenRfi(r) && ((r.due && r.due < t) || r.status === 'Raise'))
        .map(r => ({ ...r, ...base(r, r.itemIds, [r.tbcBy]), who: r.tbcBy || 'not issued', when: r.due || r.raised })),
    };
    // Blocked items: status Blocked or a Blocker set, or held by a blocking
    // action, a stop-work RFI or a variation that pauses the item
    const why = new Map();
    const add = (id, r) => { if (!id) return; if (!why.has(id)) why.set(id, []); why.get(id).push(r); };
    for (const i of d.items) {
      if (DONE_ITEM_STATUSES.has(i.status)) continue;
      if (i.status === 'Blocked') add(i.id, { kind: 'Status', text: i.blockerNote || 'Item status Blocked' });
      for (const b of i.blocker || []) add(i.id, { kind: 'Blocker', text: b });
    }
    for (const a of d.actions) if (isOpenAction(a) && a.blocks) for (const id of a.itemIds || []) add(id, { kind: 'Action', text: a.title, who: [a.bic, who(a)].filter(Boolean).join(' · '), url: a.url });
    for (const r of d.rfis) if (rfiHolds({ stopsWork: r.stopsWork, status: r.status, raised: r.raised, created: (r.createdAt || '').slice(0, 10), responded: r.responded, closed: r.closed }, t))
      for (const id of r.itemIds || []) add(id, { kind: 'RFI', text: `RFI-${String(r.number ?? '?').padStart(3, '0')} ${r.title || ''}`, who: r.tbcBy, url: r.url });
    for (const v of d.variations) if (variationHolds({ type: v.type, override: v.pauseOverride, status: v.status, requestDate: v.requested, decisionDate: v.decision }, t))
      for (const id of v.itemIds || []) add(id, { kind: 'Variation', text: `${v.code || 'VC'} ${v.title || ''}`, who: v.bic, url: v.url });
    day.blocked = [...why].map(([id, reasons]) => {
      const it = items.get(id);
      if (!it || it.archived || DONE_ITEM_STATUSES.has(it.status) || (project && it.projectId !== project)) return null;
      return { id, url: it.url, title: it.title, status: it.status, bic: it.bic, reasons, when: '', ...base({ title: it.title }, [id], reasons.map(x => `${x.text} ${x.who || ''}`)) };
    }).filter(Boolean).sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true }));

    for (const k of Object.keys(day)) if (k !== 'blocked') day[k].sort((a, b) => String(a.when || '9').localeCompare(String(b.when || '9')));

    // ── Latest movements ──
    const mv = [];
    const push = (kind, at, r, itemIds, summary, extra) => { if (at) mv.push({ id: `${kind}:${r.id}:${at}`, kind, at, url: r.url, summary, ...base({ title: summary }, itemIds, extra) }); };
    for (const x of d.submissions) {
      const dw = (x.drawingIds || []).map(id => drawingNo.get(id)).filter(Boolean);
      push('submission', x.createdAt, x, x.itemIds, `${x.title || dw.join(', ')} submitted${x.stage ? ` (${x.stage})` : ''}`, dw);
      if (x.grade && x.reviewed) push('returned', x.reviewed, x, x.itemIds, `${x.title || dw.join(', ')} returned: grade ${x.grade}`, dw);
    }
    for (const a of d.actions) {
      push(a.type === 'Note' ? 'note' : 'action', a.createdAt, a, a.itemIds, a.title || '(no text)', [who(a), a.bic]);
      if (a.done && a.closedOn) push('closed', a.closedOn, a, a.itemIds, `Closed: ${a.title || ''}`, [who(a)]);
    }
    for (const r of d.rfis) {
      const ref = `RFI-${String(r.number ?? '?').padStart(3, '0')}`;
      push('rfi', r.raised || r.createdAt, r, r.itemIds, `${ref} raised: ${r.title || ''}`, [r.tbcBy]);
      if (r.responded) push('answered', r.responded, r, r.itemIds, `${ref} answered`, [r.tbcBy]);
    }
    for (const v of d.variations) {
      push('vc', v.requested || v.createdAt, v, v.itemIds, `${v.code || 'VC'} raised: ${v.title || ''}`, [v.raisedBy]);
      if (v.decision) push('decided', v.decision, v, v.itemIds, `${v.code || 'VC'} ${v.status || 'decided'}`);
    }
    for (const x of todo) {
      if (x.archived || !inScope(x.itemIds)) continue;
      push('task', x.createdAt, x, x.itemIds, x.title || '(task)', [d.personName(x.personIds?.[0])]);
      if (x.done) push('done', x.editedAt, x, x.itemIds, `Done: ${x.title || ''}`, [d.personName(x.personIds?.[0])]);
    }
    for (const e of events) if (['status', 'bic', 'date'].includes(e.kind) && (!e.itemId || inScope([e.itemId]))) push(e.kind, e.at, { id: e.id, url: e.url, title: e.summary }, e.itemId ? [e.itemId] : [], e.summary);
    for (const x of d.activity) if (x.source !== 'A&I') push('log', x.at, x, x.itemIds, x.title || '');
    const seen = new Set();
    const moves = mv.filter(m => !seen.has(m.id) && seen.add(m.id)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return { day, moves };
  }, [d, todo, events, project]);
}

function Group({ title, tone, rows, render, empty }) {
  return (
    <Card className="p-0 overflow-hidden">
      <h2 className={cx('m-0 flex items-baseline justify-between px-4 py-3 border-b border-line font-mono text-[12px] font-medium uppercase tracking-[0.12em]', rows.length ? tone : 'text-muted')}>
        {title}<span className="text-muted">{rows.length}</span>
      </h2>
      {rows.length ? <ul className="m-0 p-0 list-none max-h-[360px] overflow-y-auto">{rows.map(r => <li key={r.id} className="px-4 py-2 border-b border-line last:border-b-0 flex flex-col gap-0.5">{render(r)}</li>)}</ul>
        : <p className="m-0 px-4 py-3 text-[13px] text-muted">{empty}</p>}
    </Card>
  );
}

const Line = ({ r, right, children }) => (
  <>
    <span className="flex justify-between gap-3 text-[14px]">
      <a href={r.url} target="_blank" rel="noreferrer" className="text-text no-underline hover:underline min-w-0 truncate">{children || r.title || '(no text)'}</a>
      {right}
    </span>
    <span className="font-mono text-[11px] text-muted truncate">{itemLink(r.itemId, r.item || 'No item')}{r.project ? ` · ${r.project}` : ''}{r.who ? ` · ${r.who}` : ''}</span>
  </>
);
const When = ({ date, today }) => (date ? <span className={cx('font-mono text-[12px] whitespace-nowrap', date < today ? 'text-danger' : 'text-text-2')}>{fmtDay(date)}</span> : null);

export default function BriefPage() {
  const { data: d, project } = useOutletContext();
  const { data: snaps } = useSnapshots(['todo', 'suppliers']);
  const { data: boot } = useBootstrap();
  const [view, setView] = useStored('hub.brief2.view', 'day');
  const [span, setSpan] = useStored('hub.brief2.span', '3');
  const [kinds, setKinds] = useState('');
  const [q, setQ] = useState('');
  const dd = useMemo(() => ({ ...d, all: { ...d.all, suppliers: snaps.suppliers } }), [d, snaps.suppliers]);
  const m = useBriefModel(dd, snaps.todo, boot?.justLogged || [], project);
  if (d.isPending) return <Card className="p-4"><SkeletonRows rows={10} /></Card>;

  const t = d.today;
  const needle = q.trim().toLowerCase();
  const hit = r => !needle || r.text.includes(needle);
  const g = Object.fromEntries(Object.entries(m.day).map(([k, v]) => [k, v.filter(hit)]));
  const since = addDays(t, -Number(span));
  const moves = m.moves.filter(x => String(x.at).slice(0, 10) >= since && String(x.at).slice(0, 10) <= t && hit(x) && (!kinds || x.kind === kinds || (kinds === 'action' && ['action', 'closed', 'note'].includes(x.kind)) || (kinds === 'submission' && x.kind === 'returned') || (kinds === 'rfi' && x.kind === 'answered') || (kinds === 'vc' && x.kind === 'decided') || (kinds === 'task' && x.kind === 'done')));
  const byDay = [];
  for (const x of moves) { const k = String(x.at).slice(0, 10); if (!byDay.length || byDay[byDay.length - 1][0] !== k) byDay.push([k, []]); byDay[byDay.length - 1][1].push(x); }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Brief view" className="flex border-b border-line">
          {VIEWS.map(v => (
            <button key={v.id} type="button" role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)}
              className={cx('min-h-11 px-4 border-0 border-b-2 -mb-px font-mono text-[12px] uppercase tracking-[0.1em] cursor-pointer', view === v.id ? 'bg-surface-hi text-text border-accent' : 'bg-transparent text-muted border-transparent hover:text-text-2')}>{v.label}</button>
          ))}
        </div>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Item, drawing no., DT, supplier" />
          <Link to="/brief/classic" className="min-h-11 px-3 inline-flex items-center font-mono text-[12px] text-muted no-underline hover:text-text-2">Classic brief →</Link>
        </span>
      </div>

      {view === 'day' ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[13px] text-muted">
            <span><b className="text-[20px] text-danger mr-1 tabular-nums">{g.blocked.length}</b>items blocked</span>
            <span><b className="text-[20px] text-danger mr-1 tabular-nums">{g.overdue.length}</b>overdue with me</span>
            <span><b className="text-[20px] text-accent mr-1 tabular-nums">{g.dueSoon.length}</b>due in 2 days</span>
            <span><b className="text-[20px] text-info mr-1 tabular-nums">{g.reviews.length}</b>drawings to review</span>
            <span><b className="text-[20px] text-text mr-1 tabular-nums">{g.chases.length}</b>to chase</span>
            <span><b className="text-[20px] text-ok mr-1 tabular-nums">{g.tasks.length}</b>DT tasks due / blocked</span>
          </div>
          <Card className="p-0 overflow-hidden">
            <h2 className={cx('m-0 flex items-baseline justify-between px-4 py-3 border-b border-line font-mono text-[12px] font-medium uppercase tracking-[0.12em]', g.blocked.length ? 'text-danger' : 'text-muted')}>
              Blocked items and what's blocking them<span className="text-muted">{g.blocked.length}</span>
            </h2>
            {g.blocked.length ? (
              <ul className="m-0 p-0 list-none max-h-[420px] overflow-y-auto">
                {g.blocked.map(r => (
                  <li key={r.id} className="grid md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-x-4 gap-y-1 px-4 py-2 border-b border-line last:border-b-0">
                    <span className="flex flex-col min-w-0">
                      {itemLink(r.itemId, r.title)}
                      <span className="font-mono text-[11px] text-muted truncate">{[r.project, r.status, r.bic && `BIC ${r.bic}`].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="flex flex-col gap-0.5 min-w-0">
                      {r.reasons.map((x, i) => (
                        <span key={i} className="text-[13px] truncate"><Badge tone={x.kind === 'Status' || x.kind === 'Blocker' ? 'muted' : 'danger'}>{x.kind}</Badge>{' '}
                          {x.url ? <a href={x.url} target="_blank" rel="noreferrer" className="text-text no-underline hover:underline">{x.text}</a> : <span className="text-text-2">{x.text}</span>}
                          {x.who && <span className="font-mono text-[11px] text-muted"> · {x.who}</span>}</span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="m-0 px-4 py-3 text-[13px] text-muted">Nothing blocked.</p>}
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Group title="Overdue with me" tone="text-danger" rows={g.overdue} empty="Nothing overdue." render={r => <Line r={r} right={<When date={r.due} today={t} />} />} />
            <Group title="Due in the next 2 days" tone="text-accent" rows={g.dueSoon} empty="Nothing due." render={r => <Line r={r} right={<When date={r.due} today={t} />} />} />
            <Group title="Drawings to review" tone="text-info" rows={g.reviews} empty="No submissions waiting on you." render={r => <Line r={r} right={<span className="font-mono text-[12px] text-text-2">{[r.stage, r.revision].filter(Boolean).join(' ')}</span>} />} />
            <Group title="Chases due" tone="text-text" rows={g.chases} empty="No chases due." render={r => <Line r={{ ...r, who: [r.bic, r.who].filter(Boolean).join(' · ') }} right={<When date={r.when} today={t} />} />} />
            <Group title="DT tasks due or blocked" tone="text-ok" rows={g.tasks} empty="No DT tasks due." render={r => <Line r={r} right={r.status === 'Blocked' ? <Badge tone="danger">Blocked</Badge> : <When date={r.end} today={t} />} />} />
            <Group title="RFIs late or not issued" tone="text-info" rows={g.rfis} empty="No late RFIs." render={r => <Line r={r}>{`RFI-${String(r.number ?? '?').padStart(3, '0')} ${r.title || ''}`}</Line>} />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {SPANS.map(n => <button key={n} type="button" aria-pressed={span === String(n)} onClick={() => setSpan(String(n))} className={cx('min-h-9 px-3 border font-mono text-[12px] cursor-pointer', span === String(n) ? 'bg-surface-hi border-accent text-accent' : 'bg-transparent border-line-strong text-muted')}>{n === 1 ? 'Today' : `${n} days`}</button>)}
            <span className="mx-1 w-px h-6 bg-line" />
            {[['', 'Everything'], ['submission', 'Drawings'], ['action', 'Actions'], ['rfi', 'RFIs'], ['vc', 'Variations'], ['task', 'DT tasks'], ['status', 'Status'], ['bic', 'Ball in court']].map(([k, l]) => (
              <button key={k || 'all'} type="button" aria-pressed={kinds === k} onClick={() => setKinds(k)} className={cx('min-h-9 px-3 border text-[13px] cursor-pointer', kinds === k ? 'bg-surface-hi border-accent text-accent' : 'bg-transparent border-line-strong text-text-2')}>{l}</button>
            ))}
            <span className="ml-auto font-mono text-[12px] text-muted">{moves.length} movement{moves.length === 1 ? '' : 's'}</span>
          </div>
          {!byDay.length ? <Card className="p-6 text-center text-[14px] text-muted">No movements in this window.</Card> : byDay.map(([day, list]) => (
            <Card key={day} className="p-0 overflow-hidden">
              <h2 className="m-0 px-4 py-2 border-b border-line font-mono text-[12px] uppercase tracking-[0.12em] text-text-2">{day === t ? 'Today' : fmtDay(day)} <span className="text-muted">· {list.length}</span></h2>
              <ul className="m-0 p-0 list-none">
                {list.map(x => (
                  <li key={x.id} className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 px-4 py-2 border-b border-line last:border-b-0 items-start">
                    <Badge tone={KIND[x.kind]?.tone || 'muted'} className="justify-center">{KIND[x.kind]?.label || x.kind}</Badge>
                    <span className="flex flex-col gap-0.5 min-w-0">
                      {x.url ? <a href={x.url} target="_blank" rel="noreferrer" className="text-[14px] text-text no-underline hover:underline truncate">{x.summary}</a> : <span className="text-[14px] truncate">{x.summary}</span>}
                      <span className="font-mono text-[11px] text-muted truncate">{itemLink(x.itemId, x.item || 'No item')}{x.project ? ` · ${x.project}` : ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
