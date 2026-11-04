// Daily Brief: one read of what's next, upcoming and past due, plus everything
// to chase. Read-only; Triage is where rows are changed.
import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Card, SectionLabel, Badge, Tabs, SkeletonRows, TypeTag, cx } from '../../components/ui/index.js';
import { DataTable } from '../../components/ui/table.jsx';
import { addDays } from '../../../hub-core/derive.js';
import { groupOf, ageDays, fmtDay, bicTone, CHASE_ITEM_STATUSES, latestSubmissions, useStored } from './shared.jsx';
import { ChevronDown, ChevronRight } from 'lucide-react';

const ext = (url, label) => <a href={url} target="_blank" rel="noreferrer" className="text-text no-underline hover:underline">{label || '—'}</a>;
const muted = v => <span className="text-text-2">{v || '—'}</span>;
const num = v => <span className="font-mono text-[13px] tabular-nums">{v ?? '—'}</span>;

function Section({ id, title, note, right, children }) {
  return (
    <Card aria-labelledby={id}>
      <div className="px-4 pt-4">
        <SectionLabel as="h2" right={right}><span id={id}>{title}</span></SectionLabel>
        {note && <p className="m-0 -mt-1 mb-3 text-[13px] text-muted max-w-[80ch]">{note}</p>}
      </div>
      <div className="border-t border-line">{children}</div>
    </Card>
  );
}

const TONE_TEXT = { danger: 'text-danger', accent: 'text-accent', info: 'text-info', ok: 'text-ok' };

function Kpi({ label, value, sub, tone, to }) {
  const body = (
    <>
      <div className="font-mono text-[12px] uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className={cx('figure mt-3 tabular-nums', value ? (TONE_TEXT[tone] || 'text-text') : 'text-muted')}>{value ?? '—'}</div>
      <div className="mt-2 font-mono text-[12px] text-muted">{sub}</div>
    </>
  );
  const cls = 'block bg-surface border border-line p-4 min-h-[124px] no-underline text-text';
  return to ? <Link to={to} className={cx(cls, 'hover:bg-surface-hi hover:border-line-strong')}>{body}</Link> : <div className={cls}>{body}</div>;
}

const BUCKETS = ['Overdue', 'Due this week', 'Drawing review', 'No due date', 'Later'];
const bucketTone = { Overdue: 'danger', 'Due this week': 'accent', 'Drawing review': 'info' };

export default function DailyBrief() {
  const { data: d } = useOutletContext();
  const t = d.today;
  const [bucket, setBucket] = useState('All');
  const [chaseTab, setChaseTab] = useState('ext');
  const [pickedDt, setPickedDt] = useStored('hub.brief.dt', '');
  const [view, setView] = useStored('hub.brief.view', 'section');

  const m = useMemo(() => {
    const week = addDays(t, 7);
    const mine = d.openActions.filter(a => a.bic === 'DM').map(a => ({
      ...a,
      bucket: a.due && a.due < t ? 'Overdue' : a.due && a.due <= week ? 'Due this week' : a.source === 'Submission' ? 'Drawing review' : !a.due ? 'No due date' : 'Later',
      age: ageDays(a.received || a.createdAt, t),
    })).sort((a, b) => BUCKETS.indexOf(a.bucket) - BUCKETS.indexOf(b.bucket) || (a.due || '9').localeCompare(b.due || '9') || b.age - a.age);

    const chaseActions = d.openActions.filter(a => a.bic && a.bic !== 'DM').map(a => ({
      ...a, grp: groupOf(a.bic), item: d.itemName(a.itemIds), who: d.personName(a.personIds[0]) || (a.bic === 'DT' ? 'Unassigned' : a.from || ''),
      age: ageDays(a.received || a.createdAt, t),
    })).sort((a, b) => b.age - a.age);

    const chaseItems = d.items.filter(i => CHASE_ITEM_STATUSES.has(i.status) && i.bic && i.bic !== 'DM').map(i => ({
      ...i, grp: groupOf(i.bic), who: i.dtIds.map(d.personName).filter(Boolean).join(', '), age: ageDays(i.editedAt, t),
    })).sort((a, b) => b.age - a.age);

    const dtDrawings = latestSubmissions(d.submissions)
      .filter(x => x.bic === 'DT' && !['A', 'Approved'].includes(x.grade))
      .map(x => ({ ...x, dt: d.personName(x.dtIds[0]) || 'Unassigned', age: ageDays(x.bicSince || x.reviewed || x.createdAt, t) }))
      .sort((a, b) => b.age - a.age);

    const dtSummary = (() => {
      const map = new Map();
      const row = name => { if (!map.has(name)) map.set(name, { id: name, dt: name, actions: 0, overdue: 0, drawings: 0, items: 0, oldest: 0 }); return map.get(name); };
      for (const a of chaseActions.filter(x => x.grp === 'dt')) { const r = row(a.who); r.actions++; if (a.due && a.due < t) r.overdue++; r.oldest = Math.max(r.oldest, a.age || 0); }
      for (const x of dtDrawings) { const r = row(x.dt); r.drawings++; r.oldest = Math.max(r.oldest, x.age || 0); }
      for (const i of chaseItems.filter(x => x.grp === 'dt')) { const r = row(i.who || 'Unassigned'); r.items++; }
      return [...map.values()].sort((a, b) => b.actions + b.drawings + b.items - (a.actions + a.drawings + a.items));
    })();

    const programme = d.items.filter(i => CHASE_ITEM_STATUSES.has(i.status) || i.status === 'Ongoing').flatMap(i => {
      const x = i.dt || {}, dd = i.dates || {};
      return [
        ['S4 submission', dd.sub1], ['S5 DT start', !x.s5StartAct && x.s5Start], ['S5 DT delivery', !x.s5DelAct && x.s5Del],
        ['S5 submission', dd.sub2], ['C01 DT start', !x.cStartAct && x.cStart], ['C01 DT delivery', !x.cDelAct && x.cDel], ['C01 submission', dd.constrSub],
      ].filter(([, date]) => date && date >= addDays(t, -21) && date <= addDays(t, 14))
        .map(([milestone, date]) => ({ id: `${i.id}#${milestone}`, itemId: i.id, url: i.url, item: i.title, milestone, date, bic: i.bic, days: ageDays(t, date) }));
    }).sort((a, b) => a.date.localeCompare(b.date));

    const rfis = d.openRfis.map(r => ({ ...r, days: ageDays(r.raised, t) })).sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
    const since = addDays(t, -3);
    const activity = d.activity.filter(x => (x.at || '').slice(0, 10) >= since && x.source !== 'A&I')
      .sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 60);

    const count = g => ({
      actions: chaseActions.filter(a => a.grp === g).length,
      items: chaseItems.filter(i => i.grp === g).length,
      drawings: g === 'dt' ? dtDrawings.length : 0,
    });
    const tot = g => { const c = count(g); return c.actions + c.items + c.drawings; };
    return {
      mine, chaseActions, chaseItems, dtDrawings, dtSummary, programme, rfis, activity, count, tot,
      overdue: mine.filter(a => a.bucket === 'Overdue').length,
      reviews: mine.filter(a => a.source === 'Submission').length,
    };
  }, [d, t]);

  if (d.isPending) return <Card className="p-4"><SkeletonRows rows={10} /></Card>;

  const mineRows = bucket === 'All' ? m.mine : m.mine.filter(a => a.bucket === bucket);
  const byDt = r => !pickedDt || r === pickedDt;

  const actionCols = withCol => [
    withCol === 'who' ? { key: 'who', label: 'DT', width: 160, render: r => muted(r.who) } : { key: 'bic', label: 'With', width: 140, render: r => <Badge tone={bicTone(r.bic)}>{r.bic}</Badge> },
    { key: 'title', label: 'Action', render: r => ext(r.url, r.title) },
    { key: 'item', label: 'Item', width: 220, render: r => muted(r.item) },
    { key: 'due', label: 'Due', width: 120, render: r => (r.due ? <Badge tone={r.due < t ? 'danger' : 'muted'}>{fmtDay(r.due)}</Badge> : muted()) },
    { key: 'age', label: 'Waiting (days)', width: 130, render: r => num(r.age) },
  ];
  const itemCols = [
    { key: 'bic', label: 'With', width: 140, render: r => <Badge tone={bicTone(r.bic)}>{r.bic}</Badge> },
    { key: 'title', label: 'Item', render: r => ext(r.url, r.title) },
    { key: 'status', label: 'Status', width: 150, render: r => muted(r.status) },
    { key: 'blocker', label: 'Blocker', width: 200, sortValue: r => r.blocker.join(', '), render: r => muted(r.blocker.join(', ')) },
    { key: 'who', label: 'DT', width: 160, render: r => muted(r.who) },
    { key: 'age', label: 'Last touched (days)', width: 150, render: r => num(r.age) },
  ];
  const chase = m.chaseActions.filter(a => a.grp === chaseTab);
  const chaseI = m.chaseItems.filter(i => i.grp === chaseTab);

  return (
    <>
      <p className="m-0 text-[15px] text-text-2 max-w-[90ch]">
        <b className="text-danger">{m.overdue}</b> of your actions are overdue and <b className="text-info">{m.reviews}</b> drawing reviews are waiting on you.
        To chase: <b className="text-text">{m.tot('ext')}</b> external, <b className="text-text">{m.tot('int')}</b> internal, and <b className="text-text">{m.tot('dt')}</b> with your DTs.
        {' '}<Link to="/triage" className="text-accent">Act on these in Triage →</Link>
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="My overdue" value={m.overdue} sub="Ball with DM, past due" tone="danger" to="/triage?tab=mine&due=overdue" />
        <Kpi label="My open actions" value={m.mine.length} sub="All rows with BIC = DM" tone="accent" to="/triage?tab=mine" />
        <Kpi label="Drawing reviews" value={m.reviews} sub="Submissions awaiting QA" tone="info" />
        <Kpi label="External" value={m.tot('ext')} sub="Client, architect, contractor, consultant" to="/triage?tab=ext" />
        <Kpi label="Internal" value={m.tot('int')} sub="Team, production, site, supplier" to="/triage?tab=int" />
        <Kpi label="With DT team" value={m.tot('dt')} sub="Actions, returned drawings, items" tone="ok" to="/triage?tab=dt" />
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="View">
        <span className="section-label mr-2">View</span>
        {[['section', 'By section'], ['item', 'By item']].map(([k, l]) => (
          <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}
            className={cx('min-h-11 px-4 border font-mono text-[12px] uppercase tracking-[0.08em] cursor-pointer', view === k ? 'bg-surface-hi border-accent text-accent' : 'bg-transparent border-line-strong text-muted hover:text-text-2')}>
            {l}
          </button>
        ))}
      </div>

      {view === 'item' ? <ByItem m={m} d={d} /> : <>
      <Section id="my-moves" title="My moves" note="Open actions where the ball is with you, most urgent first." right={<span className="font-mono text-[12px] text-muted">{mineRows.length}</span>}>
        <div className="flex flex-wrap gap-2 px-4 py-3">
          {['All', ...BUCKETS].map(b => {
            const n = b === 'All' ? m.mine.length : m.mine.filter(a => a.bucket === b).length;
            return (
              <button key={b} type="button" aria-pressed={bucket === b} onClick={() => setBucket(b)}
                className={cx('min-h-11 px-3 border font-mono text-[12px] cursor-pointer', bucket === b ? 'bg-surface-hi border-accent text-accent' : 'bg-transparent border-line-strong text-muted hover:text-text-2')}>
                {b} <span className="tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>
        <DataTable rows={mineRows} empty="Nothing with you. Nice." columns={[
          { key: 'bucket', label: 'Status', width: 150, sortValue: r => BUCKETS.indexOf(r.bucket), render: r => <Badge tone={bucketTone[r.bucket] || 'muted'}>{r.bucket}</Badge> },
          { key: 'title', label: 'Action', render: r => ext(r.url, r.title) },
          { key: 'item', label: 'Item', width: 220, sortValue: r => d.itemName(r.itemIds), render: r => muted(d.itemName(r.itemIds)) },
          { key: 'due', label: 'Due', width: 120, render: r => muted(fmtDay(r.due)) },
          { key: 'age', label: 'Age (days)', width: 110, render: r => num(r.age) },
        ]} />
      </Section>

      <Section id="chase" title="Chase list" note="Out of your direct control, but yours to chase. External = outside the business; internal = inside it but not with a DT.">
        <div className="px-4 pt-2">
          <Tabs label="Chase list" value={chaseTab} onChange={setChaseTab} tabs={[
            { id: 'ext', label: `External · ${m.tot('ext')}` },
            { id: 'int', label: `Internal · ${m.tot('int')}` },
            { id: 'dt', label: `DT team · ${m.tot('dt')}` },
          ]} />
        </div>
        <div role="tabpanel" className="flex flex-col">
          {chaseTab === 'dt' && (
            <>
              <h3 className="m-0 px-4 pt-4 pb-2 section-label">By person {pickedDt && <button type="button" onClick={() => setPickedDt('')} className="ml-3 bg-transparent border-0 p-0 font-mono text-[12px] text-accent cursor-pointer normal-case tracking-normal">Show everyone</button>}</h3>
              <DataTable rows={m.dtSummary} empty="Nothing with the DT team." columns={[
                { key: 'dt', label: 'DT', render: r => <button type="button" onClick={() => setPickedDt(r.dt === pickedDt ? '' : r.dt)} className={cx('bg-transparent border-0 p-0 cursor-pointer text-[14px] min-h-8', r.dt === pickedDt ? 'text-accent' : 'text-text hover:underline')}>{r.dt}</button> },
                { key: 'actions', label: 'Actions', width: 100, render: r => num(r.actions) },
                { key: 'overdue', label: 'Overdue', width: 100, render: r => <span className={cx('font-mono text-[13px]', r.overdue && 'text-danger')}>{r.overdue}</span> },
                { key: 'drawings', label: 'Drawings', width: 100, render: r => num(r.drawings) },
                { key: 'items', label: 'Items', width: 100, render: r => num(r.items) },
                { key: 'oldest', label: 'Oldest (days)', width: 130, render: r => num(r.oldest) },
              ]} />
            </>
          )}
          <h3 className="m-0 px-4 pt-4 pb-2 section-label border-t border-line">Open actions · {chase.filter(a => chaseTab !== 'dt' || byDt(a.who)).length}</h3>
          <DataTable rows={chase.filter(a => chaseTab !== 'dt' || byDt(a.who))} columns={actionCols(chaseTab === 'dt' ? 'who' : 'bic')} empty="No open actions." />
          {chaseTab === 'dt' && (
            <>
              <h3 className="m-0 px-4 pt-4 pb-2 section-label border-t border-line">Drawings back with the DT · {m.dtDrawings.filter(x => byDt(x.dt)).length}</h3>
              <p className="m-0 px-4 pb-2 text-[13px] text-muted">Latest submission of each drawing where Drawing Flow has the ball with the DT: QA bounces, client B/C grades and rejections awaiting resubmission.</p>
              <DataTable rows={m.dtDrawings.filter(x => byDt(x.dt))} empty="No drawings back with DTs." columns={[
                { key: 'dt', label: 'DT', width: 160, render: r => muted(r.dt) },
                { key: 'title', label: 'Submission', render: r => ext(r.url, r.title) },
                { key: 'stage', label: 'Stage', width: 90, render: r => muted(r.stage) },
                { key: 'status', label: 'Status', width: 120, render: r => muted(r.status) },
                { key: 'grade', label: 'Grade', width: 90, render: r => muted(r.grade) },
                { key: 'qaRound', label: 'QA round', width: 100, render: r => num(r.qaRound) },
                { key: 'age', label: 'With DT (days)', width: 130, render: r => num(r.age) },
              ]} />
            </>
          )}
          <h3 className="m-0 px-4 pt-4 pb-2 section-label border-t border-line">{chaseTab === 'dt' ? 'Items with the DT' : 'Blocked items'} · {chaseI.filter(i => chaseTab !== 'dt' || byDt(i.who || 'Unassigned')).length}</h3>
          <DataTable rows={chaseI.filter(i => chaseTab !== 'dt' || byDt(i.who || 'Unassigned'))} columns={itemCols} empty="No items." />
        </div>
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section id="programme" title="Programme: overdue and next 14 days" note="Adjusted submission and DT dates from the Tasks database. DT start and delivery drop off once an actual date is entered." right={<span className="font-mono text-[12px] text-muted">{m.programme.length}</span>}>
          <DataTable rows={m.programme} empty="Nothing due in this window." columns={[
            { key: 'date', label: 'Date', width: 120, render: r => <Badge tone={r.date < t ? 'danger' : 'muted'}>{fmtDay(r.date)}</Badge> },
            { key: 'item', label: 'Item', render: r => ext(r.url, r.item) },
            { key: 'milestone', label: 'Milestone', width: 150, render: r => muted(r.milestone) },
            { key: 'bic', label: 'BIC', width: 110, render: r => (r.bic ? <Badge tone={bicTone(r.bic)}>{r.bic}</Badge> : muted()) },
          ]} />
        </Section>
        <Section id="rfis" title="Open RFIs" note="Raise, Open and Close Out, oldest first." right={<span className="font-mono text-[12px] text-muted">{m.rfis.length}</span>}>
          <DataTable rows={m.rfis} empty="No open RFIs." columns={[
            { key: 'number', label: 'RFI', width: 96, render: r => <a href={r.url} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-info no-underline hover:underline">RFI-{String(r.number ?? '?').padStart(3, '0')}</a> },
            { key: 'title', label: 'Description', render: r => r.title },
            { key: 'status', label: 'Status', width: 110, render: r => muted(r.status) },
            { key: 'tbcBy', label: 'TBC by', width: 150, render: r => muted(r.tbcBy) },
            { key: 'stopsWork', label: 'Stops', width: 80, render: r => (r.stopsWork ? <Badge tone="danger">Yes</Badge> : null) },
            { key: 'days', label: 'Open (days)', width: 110, render: r => num(r.days) },
          ]} />
        </Section>
      </div>

      <Section id="movement" title="Recent movement" note="Item activity log, last 3 days (drawing flow, RFIs, variations; new A&I rows left out)." right={<span className="font-mono text-[12px] text-muted">{m.activity.length}</span>}>
        <DataTable rows={m.activity} empty="No movement in the last 3 days." columns={[
          { key: 'at', label: 'When', width: 150, render: r => muted(fmtDay(r.at)) },
          { key: 'title', label: 'Entry', render: r => ext(r.url, r.title) },
          { key: 'item', label: 'Item', width: 220, sortValue: r => d.itemName(r.itemIds), render: r => muted(d.itemName(r.itemIds)) },
          { key: 'tag', label: 'Tag', width: 120, render: r => muted(r.tag) },
          { key: 'source', label: 'Source', width: 130, render: r => muted(r.source) },
        ]} />
      </Section>
      </>}
    </>
  );
}

// ── By item: everything the Brief knows, gathered under each item ───────────
function ByItem({ m, d }) {
  const t = d.today;
  const groups = useMemo(() => {
    const by = new Map();
    const add = (itemId, row) => {
      const k = itemId || 'none';
      if (!by.has(k)) by.set(k, { id: k, item: d.items_.get(itemId), rows: [] });
      by.get(k).rows.push(row);
    };
    for (const a of m.mine) add(a.itemIds[0], { key: a.id, kind: a.type === 'Note' ? 'note' : 'action', title: a.title, url: a.url, with: 'DM', due: a.due, late: a.due && a.due < t, sub: a.bucket });
    for (const a of m.chaseActions) add(a.itemIds[0], { key: a.id, kind: 'action', title: a.title, url: a.url, with: a.bic, due: a.due, late: a.due && a.due < t, sub: [a.who, `${a.age ?? '–'}d waiting`].filter(Boolean).join(' · ') });
    for (const x of m.dtDrawings) add(x.itemIds[0], { key: x.id, kind: 'submission', title: x.title, url: x.url, with: 'DT', sub: [x.dt, x.grade && `grade ${x.grade}`, `${x.age ?? '–'}d with DT`].filter(Boolean).join(' · ') });
    for (const r of d.openRfis) add(r.itemIds[0], { key: r.id, kind: 'rfi', title: `RFI-${String(r.number ?? '?').padStart(3, '0')} ${r.title || ''}`, url: r.url, with: r.tbcBy || r.bic, due: r.due, late: r.due && r.due < t, blocking: r.stopsWork, sub: [r.status, r.stopsWork && 'stops work'].filter(Boolean).join(' · ') });
    for (const v of d.openVcs) add(v.itemIds[0], { key: v.id, kind: 'vc', title: `${v.code || 'VC'} ${v.title || ''}`, url: v.url, with: v.bic, sub: [v.status, v.type].filter(Boolean).join(' · ') });
    for (const p of m.programme) add(p.itemId, { key: p.id, kind: 'date', title: p.milestone, url: p.url, due: p.date, late: p.date < t });
    for (const x of m.activity) add(x.itemIds[0], { key: x.id, kind: 'status', title: x.title, url: x.url, sub: [x.source, fmtDay(x.at)].filter(Boolean).join(' · '), recent: true });
    const score = g => g.rows.filter(r => r.late).length * 10 + g.rows.filter(r => r.blocking).length * 5 + g.rows.filter(r => !r.recent).length;
    return [...by.values()]
      .filter(g => g.rows.some(r => !r.recent))
      .map(g => ({ ...g, late: g.rows.filter(r => r.late).length, score: score(g) }))
      .sort((a, b) => b.score - a.score || (a.item?.title || '~').localeCompare(b.item?.title || '~', undefined, { numeric: true }));
  }, [m, d, t]);
  const [closed, setClosed] = useState(() => new Set());
  const toggle = id => setClosed(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const order = { action: 0, note: 1, rfi: 2, vc: 3, submission: 4, date: 5, status: 6 };

  if (!groups.length) return <Card className="p-6 text-center text-[14px] text-muted">Nothing open against any item.</Card>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button type="button" onClick={() => setClosed(new Set())} className="min-h-11 px-3 border border-line-strong bg-transparent text-text-2 hover:bg-surface-hi font-mono text-[12px] uppercase tracking-[0.08em] cursor-pointer">Expand all</button>
        <button type="button" onClick={() => setClosed(new Set(groups.map(g => g.id)))} className="min-h-11 px-3 border border-line-strong bg-transparent text-text-2 hover:bg-surface-hi font-mono text-[12px] uppercase tracking-[0.08em] cursor-pointer">Collapse all</button>
        <span className="ml-auto self-center font-mono text-[12px] text-muted">{groups.length} items · most urgent first</span>
      </div>
      {groups.map(g => {
        const open = !closed.has(g.id);
        const rows = [...g.rows].sort((a, b) => order[a.kind] - order[b.kind] || (a.due || '9').localeCompare(b.due || '9'));
        return (
          <Card key={g.id}>
            <h2 className="m-0">
              <button type="button" aria-expanded={open} onClick={() => toggle(g.id)} className="w-full min-h-12 px-4 flex items-center gap-3 bg-transparent border-0 cursor-pointer text-left text-text hover:bg-surface-hi">
                {open ? <ChevronDown size={16} className="text-muted" /> : <ChevronRight size={16} className="text-muted" />}
                <span className="text-[15px] font-semibold truncate">{g.item?.title || 'Not linked to an item'}</span>
                {g.item && <span className="hidden sm:inline font-mono text-[12px] text-muted truncate">{[d.projects.get(g.item.projectId), g.item.status, g.item.bic && `BIC ${g.item.bic}`].filter(Boolean).join(' · ')}</span>}
                <span className="ml-auto flex gap-2 shrink-0">
                  {g.late > 0 && <Badge tone="danger">{g.late} overdue</Badge>}
                  <Badge>{g.rows.filter(r => !r.recent).length} open</Badge>
                </span>
              </button>
            </h2>
            {open && (
              <ul className="m-0 p-0 list-none border-t border-line">
                {rows.map(r => (
                  <li key={r.key} className="px-4 py-2.5 border-t border-line first:border-t-0 flex items-start gap-3">
                    <TypeTag kind={r.kind} blocking={r.blocking} />
                    <div className="min-w-0 flex-1">
                      <a href={r.url} target="_blank" rel="noreferrer" className={cx('text-[14px] no-underline hover:underline', r.recent ? 'text-text-2' : 'text-text')}>{r.title || 'Untitled'}</a>
                      {r.sub && <div className="font-mono text-[11px] text-muted">{r.sub}</div>}
                    </div>
                    <span className="flex items-center gap-2 shrink-0">
                      {r.with && <Badge tone={bicTone(r.with)}>{r.with}</Badge>}
                      {r.due && <Badge tone={r.late ? 'danger' : 'muted'}>{fmtDay(r.due)}</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
