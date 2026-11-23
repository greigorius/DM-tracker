// Brief (workspace spec §4): its own tab with two views.
//   My day            what needs you today: overdue and due with you, drawing
//                     reviews, chases due, DT tasks due or blocked, RFIs late
//   Latest movements  what happened across the Hub, newest first
// One search box (item, project, drawing no., person, company) filters both.
import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Card, Badge, SkeletonRows, cx } from '../../components/ui/index.js';
import { SearchBox } from '../../components/ui/table.jsx';
import { useSnapshots, useBootstrap, useUpdateRecord } from '../../hooks/hub.js';
import { addDays, isOpenRfi, isOpenAction, DONE_ITEM_STATUSES } from '../../../hub-core/derive.js';
import { rfiHolds, variationHolds } from '../../../netlify/functions/_statusRules.js';
import { vcPauses } from '../../../hub-core/item-bic.js';
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
    // Blocked items (spec §4): every open item that is Blocked, has a Blocker
    // tag, or is held by a blocking action, a stop-work RFI, a pausing
    // variation or a blocked DT task. Each reason is resolved to the actual
    // records behind it (RFI no., VC no., action, task, supplier), grouped
    // under the tag that names it.
    const late = () => ''; // lateness shows as its own red flag
    const rfiRef = r => `RFI-${String(r.number ?? '?').padStart(3, '0')}`;
    const tdRef = x => (x.number != null ? `TD-${String(x.number).padStart(3, '0')}` : 'Task');
    const recA = a => ({ id: a.id, kind: 'Action', ref: a.blocks ? 'Blocks' : 'Action', text: a.title || '(no text)', url: a.url,
      who: [a.bic, who(a), a.contact && sup.get(a.companyIds?.[0]) ? a.contact : null].filter(Boolean).join(' · '), when: a.due && `due ${fmtDay(a.due)}${late(a.due)}`, late: !!(a.due && a.due < t) });
    const recR = r => ({ id: r.id, kind: 'RFI', ref: rfiRef(r), text: r.title || '', url: r.url, who: [r.status, r.tbcBy && `TBC ${r.tbcBy}`].filter(Boolean).join(' · '),
      when: r.due ? `due ${fmtDay(r.due)}${late(r.due)}` : 'no response date', late: !!(r.due && r.due < t), stop: r.stopsWork });
    const recV = v => ({ id: v.id, kind: 'Variation', ref: v.code || 'VC', text: v.title || '', url: v.url,
      who: [v.status, v.bic && `with ${v.bic}`, v.type].filter(Boolean).join(' · '), when: v.requested && `raised ${fmtDay(v.requested)}` });
    const recT = x => ({ id: x.id, kind: 'Task', ref: tdRef(x), text: x.title || '', url: x.url, who: [x.status, d.personName(x.personIds?.[0])].filter(Boolean).join(' · '),
      when: x.end && `end ${fmtDay(x.end)}${late(x.end)}`, late: !!(x.end && x.end < t) });
    const on = (rows, id) => rows.filter(r => (r.itemIds || []).includes(id));
    const openVcs = d.variations.filter(v => !v.archived && ['Awaiting Design Info', 'Awaiting Instruction'].includes(v.status));
    const openRfis = d.rfis.filter(isOpenRfi);
    const openActs = d.actions.filter(isOpenAction);
    const openTodos = todo.filter(x => !x.archived && !x.done);
    const holdsR = r => rfiHolds({ stopsWork: r.stopsWork, status: r.status, raised: r.raised, created: (r.createdAt || '').slice(0, 10), responded: r.responded, closed: r.closed }, t);
    const holdsV = v => variationHolds({ type: v.type, override: v.pauseOverride, status: v.status, requestDate: v.requested, decisionDate: v.decision }, t);
    // Which records a Blocker tag points at
    const forTag = (tag, id) => {
      const x = tag.toLowerCase();
      // Only variations that pause the item block it; logged-only ones are reported as a stale tag
      if (/instruction/.test(x)) return on(openVcs, id).filter(v => v.status === 'Awaiting Instruction' && vcPauses(v)).map(recV);
      if (/design info/.test(x)) return [...on(openVcs, id).filter(v => v.status === 'Awaiting Design Info' && vcPauses(v)).map(recV), ...on(openActs, id).filter(a => a.bic && a.bic !== 'DM' && a.bic !== 'DT').map(recA)];
      if (/rfi/.test(x)) return on(openRfis, id).map(recR);
      if (/supplier/.test(x)) return [...on(openActs, id).filter(a => a.bic === 'Supplier').map(recA), ...on(openRfis, id).filter(r => /supplier/i.test(r.tbcBy || '')).map(recR)];
      const party = ['client', 'architect', 'consultant', 'contractor', 'site', 'production'].find(p => x.includes(p));
      if (party) return [...on(openActs, id).filter(a => (a.bic || '').toLowerCase() === party).map(recA), ...on(openRfis, id).filter(r => (r.tbcBy || '').toLowerCase().includes(party)).map(recR)];
      if (/dt|drawing|task/.test(x)) return on(openTodos, id).map(recT);
      return on(openActs, id).filter(a => a.bic && a.bic !== 'DM').map(recA);
    };
    const blocked = [];
    const staleTags = [];
    for (const it of d.items) {
      if (it.archived || DONE_ITEM_STATUSES.has(it.status) || (project && it.projectId !== project)) continue;
      const groups = [];
      const used = new Set();
      const take = recs => recs.filter(r => !used.has(r.id) && used.add(r.id));
      const stale = [];
      for (const tag of it.blocker || []) {
        const recs = take(forTag(tag, it.id));
        const logged = /instruction|design info/i.test(tag) ? on(openVcs, it.id).filter(v => !vcPauses(v) && (/instruction/i.test(tag) ? v.status === 'Awaiting Instruction' : v.status === 'Awaiting Design Info')) : [];
        if (!recs.length && logged.length) stale.push({ tag, recs: logged.map(recV) }); // tag only backed by variations that don't pause
        else groups.push({ label: tag, tag: true, recs });
      }
      const direct = [
        ...on(openActs, it.id).filter(a => a.blocks).map(recA),
        ...on(openRfis, it.id).filter(holdsR).map(r => ({ ...recR(r), ref: `${rfiRef(r)} stop work` })),
        ...on(d.variations, it.id).filter(holdsV).map(v => ({ ...recV(v), ref: `${v.code || 'VC'} pauses` })),
        ...on(openTodos, it.id).filter(x => x.status === 'Blocked').map(recT),
      ];
      const rest = take(direct);
      if (rest.length) groups.push({ label: it.blocker?.length ? 'Also holding it' : 'Holding it', recs: rest });
      if (!groups.length && it.status !== 'Blocked') {
        if (stale.length) staleTags.push({ id: it.id, url: it.url, title: it.title, status: it.status, blocker: it.blocker, stale, ...base({ title: it.title }, [it.id], stale.flatMap(x => x.recs.map(r => `${r.ref} ${r.text}`))) });
        continue;
      }
      blocked.push({ id: it.id, url: it.url, title: it.title, status: it.status, bic: it.bic, note: it.blockerNote, groups, stale, blocker: it.blocker, when: '',
        ...base({ title: it.title }, [it.id], groups.flatMap(g => [g.label, ...g.recs.map(r => `${r.ref} ${r.text} ${r.who}`)])) });
    }
    day.blocked = blocked.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true }));
    day.staleTags = staleTags.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true }));

    for (const k of Object.keys(day)) if (!['blocked', 'staleTags'].includes(k)) day[k].sort((a, b) => String(a.when || '9').localeCompare(String(b.when || '9')));

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

// A Blocker tag backed only by logged-only variations, with a one-click clear
function StaleTag({ item, st }) {
  const save = useUpdateRecord('tasks');
  const [done, setDone] = useState(false);
  const clear = () => save.mutate({ id: item.id, set: { blocker: (item.blocker || []).filter(b => b !== st.tag) } }, { onSuccess: () => setDone(true) });
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-accent">
        {st.tag} · not blocking
        {done ? <span className="normal-case tracking-normal text-ok">tag cleared</span>
          : <button type="button" onClick={clear} disabled={save.isPending} className="min-h-7 px-2 border border-line-strong bg-transparent text-text-2 hover:bg-surface-hi normal-case tracking-normal cursor-pointer">Clear tag</button>}
      </span>
      {st.recs.map(x => (
        <span key={x.id} className="text-[12px] text-muted"><Badge tone="muted">{x.ref}</Badge> {x.text} <span className="font-mono text-[11px]">· doesn't pause</span></span>
      ))}
    </span>
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
            {g.staleTags.length > 0 && <span><b className="text-[20px] text-accent mr-1 tabular-nums">{g.staleTags.length}</b>tags to clear</span>}
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
                  <li key={r.id} className="grid lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] gap-x-6 gap-y-2 px-4 py-3 border-b border-line last:border-b-0">
                    <span className="flex flex-col gap-0.5 min-w-0">
                      {itemLink(r.itemId, r.title)}
                      <span className="font-mono text-[11px] text-muted">{[r.project, r.status, r.bic && `BIC ${r.bic}`].filter(Boolean).join(' · ')}</span>
                      {r.note && <span className="text-[12px] text-text-2">{r.note}</span>}
                    </span>
                    <span className="flex flex-col gap-1.5 min-w-0">
                      {!r.groups.length && <span className="text-[13px] text-muted">Status Blocked, with no Blocker tag or linked record: add what it's waiting on.</span>}
                      {r.stale?.map(st => <StaleTag key={st.tag} item={r} st={st} />)}
                      {r.groups.map(gr => (
                        <span key={gr.label} className="flex flex-col gap-0.5">
                          <span className={cx('font-mono text-[11px] uppercase tracking-[0.08em]', gr.tag ? 'text-text-2' : 'text-danger')}>{gr.label}</span>
                          {gr.recs.length ? gr.recs.map(x => (
                            <span key={x.id} className="grid grid-cols-[minmax(84px,auto)_minmax(0,1fr)] gap-2 text-[13px] items-baseline">
                              <Badge tone={x.kind === 'RFI' ? 'info' : x.kind === 'Task' ? 'ok' : x.kind === 'Variation' ? 'accent' : x.ref === 'Blocks' ? 'danger' : 'muted'} className="justify-center">{x.ref}</Badge>
                              <span className="min-w-0">
                                {x.url ? <a href={x.url} target="_blank" rel="noreferrer" className="text-text no-underline hover:underline">{x.text}</a> : x.text}
                                <span className="font-mono text-[11px] text-muted">{[x.who, x.when].filter(Boolean).map(v => ` · ${v}`).join('')}</span>
                                {x.late && <span className="font-mono text-[11px] text-danger"> · late</span>}
                              </span>
                            </span>
                          )) : <span className="text-[12px] text-accent">Nothing linked on this item yet: add the RFI, variation or action it's waiting on</span>}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="m-0 px-4 py-3 text-[13px] text-muted">Nothing blocked.</p>}
          </Card>
          {g.staleTags.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <h2 className="m-0 flex items-baseline justify-between px-4 py-3 border-b border-line font-mono text-[12px] font-medium uppercase tracking-[0.12em] text-accent">
                Tagged as blocked, but nothing is blocking them<span className="text-muted">{g.staleTags.length}</span>
              </h2>
              <p className="m-0 px-4 pt-2 text-[12px] text-muted">Their Blocker tag only points at variations that don't pause the item, so they're not counted as blocked. Clear the tag if that's right.</p>
              <ul className="m-0 p-0 list-none max-h-[320px] overflow-y-auto">
                {g.staleTags.map(r => (
                  <li key={r.id} className="grid lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] gap-x-6 gap-y-1 px-4 py-2 border-b border-line last:border-b-0">
                    <span className="flex flex-col min-w-0">{itemLink(r.itemId, r.title)}<span className="font-mono text-[11px] text-muted">{[r.project, r.status].filter(Boolean).join(' · ')}</span></span>
                    <span className="flex flex-col gap-1">{r.stale.map(st => <StaleTag key={st.tag} item={r} st={st} />)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
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
