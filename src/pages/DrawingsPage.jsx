// Drawings: the Master Drawing Schedule, with every revision issued in each
// stage — actual issue date and grade from the Drawing Flow (Submissions), or
// forecast from the programme where nothing is recorded (hub-core/drawingRevs.js).
import { TrackerPage, fmtDate } from './TrackerPage.jsx';
import { StatusPill } from '../components/ui/table.jsx';
import { Badge, cx } from '../components/ui/index.js';
import { buildProgramme } from '../../hub-core/programme/adapter.js';
import { buildDrawingRevs, revText } from '../../hub-core/drawingRevs.js';
import { londonToday } from '../../hub-core/derive.js';

const TONE = {
  'First Issue': 'info', 'DT Review': 'muted', 'DM Review': 'accent', 'Client Review': 'accent', 'Approval Updates': 'info',
  'Production Updates': 'info', 'As Built Updates': 'info', 'On Hold': 'danger', 'With Supplier': 'muted', Complete: 'ok',
  Schedule: 'accent', 'In Production': 'ok',
};
const OPEN = { has: s => s !== 'Complete' };
const gradeTone = g => (g === 'A' || g === 'Approved' ? 'ok' : g === 'B' ? 'accent' : g === 'C' || g === 'Rejected' ? 'danger' : 'muted');
const gradeLabel = g => (g === 'Signed off' ? 'Signed' : g === 'QA Rejected' ? 'Rej' : g);

// Revisions per drawing, built once per snapshot set
const revCache = new WeakMap();
function revsFor(ctx) {
  const key = ctx.data.drawings;
  if (!revCache.has(key)) {
    const live = new Set(ctx.data.projects.filter(p => /^in progress$/i.test(p.status || '')).map(p => p.id));
    const entries = buildProgramme(ctx.data, { today: londonToday(), include: t => live.has(t.projectId) });
    const programme = new Map(entries.map(e => [e.row.id, e]));
    revCache.set(key, buildDrawingRevs({ drawings: ctx.data.drawings, submissions: ctx.data.submissions || [], programme, today: londonToday() }));
  }
  return revCache.get(key);
}

function RevList({ entries, today }) {
  if (entries === null) return <span className="font-mono text-[12px] text-muted">N/A</span>;
  if (!entries?.length) return <span className="font-mono text-[12px] text-muted">—</span>;
  return (
    <span className="flex flex-col gap-1">
      {entries.map((e, i) => {
        const fcIssue = e.issued.kind === 'fc';
        const overdue = fcIssue && e.issued.date && e.issued.date < today;
        const tip = [e.source === 'schedule' && 'From the drawing schedule (before the Drawing Flow)', overdue && 'Forecast issue date has passed', e.note].filter(Boolean).join(' · ');
        return (
          <span key={i} className="flex items-center gap-1 whitespace-nowrap font-mono text-[11.5px]" title={tip || undefined}>
            <span className={cx('w-7 shrink-0', fcIssue ? 'text-muted' : 'text-text')}>{e.rev || '—'}</span>
            <span className={cx(overdue ? 'italic text-danger' : fcIssue ? 'italic text-muted' : 'text-text-2')} title={fcIssue ? 'Forecast issue' : 'Issued'}>
              {e.issued.date ? fmtDate(e.issued.date) : <span className="not-italic">{e.inFlight ? '—' : e.note || 'TBC'}</span>}
            </span>
            {e.result && <>
              <span className="text-muted" aria-hidden="true">→</span>
              {e.result.grade
                ? <Badge tone={gradeTone(e.result.grade)} title={e.result.date ? `Returned ${fmtDate(e.result.date)}` : undefined}>{gradeLabel(e.result.grade)}</Badge>
                : null}
              <span className={cx(e.result.kind === 'fc' ? 'italic text-muted' : 'text-text-2')} title={e.result.kind === 'fc' ? 'Forecast return' : 'Returned'}>
                {e.result.date ? fmtDate(e.result.date) : ''}
              </span>
            </>}
            {e.inFlight && <Badge tone="info" title={e.note}>{e.note === 'In QA' ? 'QA' : 'To issue'}</Badge>}
          </span>
        );
      })}
    </span>
  );
}

const lastDate = es => (es || []).reduce((m, e) => [e.issued.date, e.result?.date].reduce((a, b) => (b && b > a ? b : a), m), '');
const stageCol = (ctx, key, label, width = 210) => ({
  key, label, width,
  sortValue: r => lastDate(revsFor(ctx).get(r.id)?.[key]),
  render: r => <RevList entries={revsFor(ctx).get(r.id)?.[key]} today={londonToday()} />,
  csv: r => (revsFor(ctx).get(r.id)?.[key] || []).map(revText).join(' | '),
});

const columns = ctx => [
  // Number, title and (when not a drawing) type in one column; the current rev
  // is the last one in the stage columns
  {
    key: 'title', label: 'Drawing', width: 230,
    render: r => (
      <span className="flex flex-col gap-0.5 min-w-[200px] max-w-[260px]">
        <a href={r.url} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-info no-underline hover:underline break-all">{r.title || '—'}</a>
        {r.name && <span className="text-[13px] text-text-2 leading-snug">{r.name}</span>}
        {r.type && r.type !== 'Drawing' && <span><Badge>{r.type}</Badge></span>}
      </span>
    ),
    csv: r => [r.title, r.name, r.type !== 'Drawing' && r.type].filter(Boolean).join(' — '),
  },
  {
    key: 'status', label: 'Status', width: 130, sortValue: r => r.status,
    render: r => (
      <span className="flex flex-col items-start gap-1">
        <StatusPill status={r.status} tone={TONE[r.status]} />
        <span className="font-mono text-[11px] text-muted">{[r.stage?.split(' - ')[0], r.rev].filter(Boolean).join(' · ')}</span>
      </span>
    ),
    csv: r => [r.status, r.stage?.split(' - ')[0], r.rev].filter(Boolean).join(' '),
  },
  stageCol(ctx, 's4', 'S4'),
  stageCol(ctx, 's5', 'S5'),
  stageCol(ctx, 'c01', 'A4.5'),
  stageCol(ctx, 'prd', 'PRD', 180),
  { key: 'item', label: 'Item', width: 200, sortValue: r => ctx.itemOf(r)?.title, render: r => <span className="text-text-2">{ctx.itemOf(r)?.title || '—'}</span>, csv: r => ctx.itemOf(r)?.title },
  { key: 'project', label: 'Project', width: 170, sortValue: r => ctx.projects.get(ctx.projectOf(r)), render: r => <span className="text-text-2">{ctx.projects.get(ctx.projectOf(r)) || '—'}</span>, csv: r => ctx.projects.get(ctx.projectOf(r)) },
];

const GROUPINGS = [
  { value: 'item', label: 'Group: Item', key: r => r.itemIds?.[0] ?? null, name: (k, ctx) => ctx.items.get(k)?.title || 'No item', meta: (k, ctx) => ctx.projects.get(ctx.items.get(k)?.projectId) },
  { value: 'project', label: 'Group: Project', key: (r, ctx) => ctx.projectOf(r), name: (k, ctx) => ctx.projects.get(k) || 'No project' },
  { value: 'status', label: 'Group: Status', key: r => r.status, name: k => k || 'No status' },
  { value: 'type', label: 'Group: Type', key: r => r.type, name: k => k || 'No type' },
];

export default function DrawingsPage() {
  return (
    <TrackerPage
      id="drawings"
      title="Drawings"
      subtitle="Master Drawing Schedule"
      db="drawings"
      statusOf={r => r.status}
      statusTone={s => TONE[s] || 'muted'}
      openStatuses={OPEN}
      openLabel="Not complete"
      columns={columns}
      groupings={GROUPINGS}
      searchText={(r, ctx) => [r.title, r.name, r.status, r.rev, r.type, ctx.itemOf(r)?.title].filter(Boolean).join(' ')}
      initialSort={{ key: 'title', dir: 'asc' }}
      filename="drawings.csv"
      extraDbs={['submissions', 'variations', 'rfis']}
    />
  );
}
