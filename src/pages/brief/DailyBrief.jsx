// Daily Brief: one read of what's next, upcoming and past due, plus everything
// to chase. Read-only; Triage is where rows are changed.
import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Card, SectionLabel, Badge, Tabs, SkeletonRows, cx } from '../../components/ui/index.js';
import { DataTable } from '../../components/ui/table.jsx';
import { addDays } from '../../../hub-core/derive.js';
import { groupOf, ageDays, fmtDay, bicTone, CHASE_ITEM_STATUSES, latestSubmissions } from './shared.jsx';

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
  const [pickedDt, setPickedDt] = useState('');

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
        .map(([milestone, date]) => ({ id: `${i.id}#${milestone}`, url: i.url, item: i.title, milestone, date, bic: i.bic, days: ageDays(t, date) }));
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
        {' '}<Link to="/brief/triage" className="text-accent">Act on these in Triage →</Link>
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="My overdue" value={m.overdue} sub="Ball with DM, past due" tone="danger" to="/brief/triage?tab=mine&due=overdue" />
        <Kpi label="My open actions" value={m.mine.length} sub="All rows with BIC = DM" tone="accent" to="/brief/triage?tab=mine" />
        <Kpi label="Drawing reviews" value={m.reviews} sub="Submissions awaiting QA" tone="info" />
        <Kpi label="External" value={m.tot('ext')} sub="Client, architect, contractor, consultant" to="/brief/triage?tab=ext" />
        <Kpi label="Internal" value={m.tot('int')} sub="Team, production, site, supplier" to="/brief/triage?tab=int" />
        <Kpi label="With DT team" value={m.tot('dt')} sub="Actions, returned drawings, items" tone="ok" to="/brief/triage?tab=dt" />
      </div>

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
    </>
  );
}
