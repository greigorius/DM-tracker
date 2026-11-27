// Drawings: the Master Drawing Schedule, with every revision issued in each
// stage — actual issue date and grade from the Drawing Flow (Submissions), or
// forecast where nothing is recorded, chained from the drawing's own latest actual
// (hub-core/drawingRevs.js). Each stage shows the item's Current baseline (Programme
// Dates) as a marker, coloured by RAG against the drawing's issue.
// Views (columns, filters, sort, group, saved views, export) come from RegisterPage.
import { RegisterPage } from './registers/RegisterPage.jsx';
import { commonFields } from './registers/common.jsx';
import { fmtDate } from './registers/engine.js';
import { StatusPill } from '../components/ui/table.jsx';
import { Badge, cx } from '../components/ui/index.js';
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
const stageCode = s => (s ? s.split(' - ')[0] : null);

// Revisions per drawing, built once per snapshot set
const revCache = new WeakMap();
function revsFor(ctx) {
  const key = ctx.data.drawings;
  if (!revCache.has(key)) {
    revCache.set(key, buildDrawingRevs({
      drawings: ctx.data.drawings, submissions: ctx.data.submissions || [], programmeRows: ctx.data.programme || [],
      tasks: ctx.data.tasks || [], projects: ctx.data.projects || [], today: londonToday(),
    }));
  }
  return revCache.get(key);
}

const RAG_CLASS = { Red: 'text-danger', Amber: 'text-accent', Green: 'text-ok', Done: 'text-muted' };
function BaselineMark({ meta }) {
  if (!meta?.baseline) return null;
  const v = meta.variance;
  const tip = `Baseline issue ${fmtDate(meta.baseline)}${v != null && meta.rag !== 'Done' ? ` · ${v > 0 ? `${v} WD late` : v < 0 ? `${-v} WD ahead` : 'on baseline'}` : ''}`;
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap font-mono text-[11px] text-muted" title={tip}>
      <span className={cx('w-8 shrink-0', RAG_CLASS[meta.rag] || 'text-muted')} aria-label={meta.rag || undefined}>◆</span>
      <span>BL {fmtDate(meta.baseline)}</span>
      {meta.rag && meta.rag !== 'Done' && v ? <span className={RAG_CLASS[meta.rag]}>{v > 0 ? `+${v}` : v}</span> : null}
      {meta.unverified ? <span className="text-accent" title="S4 DT Days not entered: provisional 10 WD">DT?</span> : null}
    </span>
  );
}

function RevList({ entries, today, meta }) {
  if (entries === null) return <span className="font-mono text-[12px] text-muted">N/A</span>;
  if (!entries?.length) return <span className="font-mono text-[12px] text-muted">—</span>;
  return (
    <span className="flex flex-col gap-1">
      <BaselineMark meta={meta} />
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
              {e.result.grade ? <Badge tone={gradeTone(e.result.grade)}>{gradeLabel(e.result.grade)}</Badge> : null}
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

const STAGES = [['s4', 'S4'], ['s5', 'S5'], ['c01', 'A4.5'], ['prd', 'PRD']];
const lastDate = es => (es || []).reduce((m, e) => [e.issued.date, e.result?.date].reduce((a, b) => (b && b > a ? b : a), m), '');

// Flat, filterable facts per stage, from the revision chain
function stageFields(ctx, k, L) {
  const es = r => revsFor(ctx).get(r.id)?.[k] || [];
  const meta = r => revsFor(ctx).get(r.id)?.meta?.[k] || {};
  const lastAct = r => [...es(r)].reverse().find(e => e.issued.kind === 'act' && e.issued.date);
  const nextFc = r => es(r).find(e => e.issued.kind === 'fc' && e.issued.date);
  const lastRes = r => [...es(r)].reverse().find(e => e.result?.date || e.result?.grade);
  return [
    { key: k, label: `${L} revisions`, type: 'text', width: 210, filter: false, group: false, hint: 'issue → grade, with baseline',
      sortValue: r => lastDate(es(r)) || null, get: r => (es(r) || []).map(revText).join(' | '),
      render: r => <RevList entries={revsFor(ctx).get(r.id)?.[k]} meta={meta(r)} today={londonToday()} /> },
    { key: `${k}Rev`, label: `${L} latest rev`, type: 'select', width: 90, get: r => es(r).filter(e => e.issued.kind === 'act').at(-1)?.rev || null },
    { key: `${k}Issued`, label: `${L} last issued`, type: 'date', width: 110, get: r => lastAct(r)?.issued.date || null },
    { key: `${k}First`, label: `${L} first issued`, type: 'date', width: 110, get: r => es(r).find(e => e.issued.kind === 'act' && e.issued.date)?.issued.date || null },
    { key: `${k}Forecast`, label: `${L} forecast issue`, type: 'date', width: 110, get: r => nextFc(r)?.issued.date || null },
    { key: `${k}Grade`, label: `${L} latest grade`, type: 'select', width: 100, get: r => lastRes(r)?.result?.grade || null,
      render: r => { const g = lastRes(r)?.result?.grade; return g ? <Badge tone={gradeTone(g)}>{gradeLabel(g)}</Badge> : <span className="text-muted">—</span>; } },
    { key: `${k}Returned`, label: `${L} returned`, type: 'date', width: 110, get: r => { const e = lastRes(r); return e?.result?.kind === 'fc' ? null : e?.result?.date || null; } },
    { key: `${k}Baseline`, label: `${L} baseline`, type: 'date', width: 110, get: r => meta(r).baseline || null },
    { key: `${k}Variance`, label: `${L} vs baseline (WD)`, type: 'number', width: 100, get: r => meta(r).variance ?? null },
    { key: `${k}Rag`, label: `${L} RAG`, type: 'select', width: 80, options: ['Red', 'Amber', 'Green', 'Done'], get: r => meta(r).rag || null,
      render: r => { const g = meta(r).rag; return g ? <span className={cx('font-mono text-[12px]', RAG_CLASS[g])}>◆ {g}</span> : <span className="text-muted">—</span>; } },
  ];
}

const fields = ctx => [
  { key: 'title', label: 'Drawing', type: 'text', width: 230,
    render: r => (
      <span className="flex flex-col gap-0.5 min-w-[180px] max-w-[240px]">
        <a href={r.url} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-info no-underline hover:underline break-all">{r.title || '—'}</a>
        {r.name && <span className="text-[12px] text-text-2 leading-snug">{r.name}</span>}
        {r.type && r.type !== 'Drawing' && <span><Badge>{r.type}</Badge></span>}
      </span>
    ),
    get: r => r.title, csv: r => r.title },
  { key: 'name', label: 'Drawing title', type: 'text', width: 200, get: r => r.name, hint: 'already under the number' },
  { key: 'type', label: 'Type', type: 'select', width: 100, get: r => r.type },
  { key: 'status', label: 'Status', type: 'select', width: 130, get: r => r.status,
    render: r => (
      <span className="flex flex-col items-start gap-1">
        <StatusPill status={r.status} tone={TONE[r.status]} />
        <span className="font-mono text-[11px] text-muted">{[stageCode(r.stage), r.rev].filter(Boolean).join(' · ')}</span>
      </span>
    ) },
  { key: 'stage', label: 'Stage', type: 'select', width: 80, options: ['S2', 'S3', 'S4', 'S5', 'A4.5', 'PRD', 'AB'], get: r => stageCode(r.stage) },
  { key: 'rev', label: 'Rev', type: 'select', width: 70, get: r => r.rev },
  { key: 'drawingDt', label: 'Drawing DT', type: 'select', width: 150, get: r => (r.dtIds || []).map(id => ctx.team.get(id)).filter(Boolean) },
  ...STAGES.flatMap(([k, L]) => stageFields(ctx, k, L)),
  { key: 's4Submitted', label: 'S4 submit date (schedule)', type: 'date', width: 120, get: r => r.s4?.submitted || null },
  { key: 's4Status', label: 'S4 status (schedule)', type: 'select', width: 90, get: r => r.s4?.status || null },
  { key: 's4StatusDate', label: 'S4 status date (schedule)', type: 'date', width: 120, get: r => r.s4?.statusDate || null },
  { key: 's5Submitted', label: 'S5 submit date (schedule)', type: 'date', width: 120, get: r => r.s5?.submitted || null },
  { key: 's5Status', label: 'S5 status (schedule)', type: 'select', width: 90, get: r => r.s5?.status || null },
  { key: 's5StatusDate', label: 'S5 status date (schedule)', type: 'date', width: 120, get: r => r.s5?.statusDate || null },
  { key: 'c01Submitted', label: 'A4.5 submit date (schedule)', type: 'date', width: 120, get: r => r.c01?.submitted || null },
  { key: 'c01SignOff', label: 'A4.5 signed off', type: 'date', width: 120, get: r => r.c01?.signOff || null },
  { key: 'prdStatus', label: 'PRD status', type: 'select', width: 100, get: r => r.prd?.status || null },
  { key: 'prdStatusDate', label: 'PRD status date', type: 'date', width: 120, get: r => r.prd?.statusDate || null },
  { key: 'prdScheduled', label: 'Production scheduled', type: 'date', width: 120, get: r => r.prd?.scheduled || null },
  { key: 'productionStage', label: 'Production stage', type: 'select', width: 150, get: r => r.productionStage || null },
  { key: 'lockStatus', label: 'Status locked', type: 'bool', width: 90, get: r => !!r.lockStatus },
  { key: 'noClientApproval', label: 'No client approval', type: 'bool', width: 100, get: r => !!r.noClientApproval },
  { key: 'holdNotes', label: 'Hold notes', type: 'text', width: 220, get: r => r.holdNotes },
  ...commonFields(ctx),
];

const DEFAULT_COLUMNS = ['title', 'status', 's4', 's5', 'c01', 'prd', 'item', 'project'];
const STARTERS = [
  { id: 's4', name: 'S4 drawings · submission dates', statusMode: 'all', group: 'project', sort: { key: 's4Issued', dir: 'asc' },
    filters: [{ field: 'stage', op: 'any', value: ['S4'] }],
    columns: ['title', 'rev', 's4First', 's4Issued', 's4Grade', 's4Returned', 's4Baseline', 's4Rag', 'drawingDt', 'status'] },
  { id: 'issued-s4', name: 'Everything issued at S4', statusMode: 'all', group: 'project', sort: { key: 's4First', dir: 'asc' },
    filters: [{ field: 's4First', op: 'not_empty', value: null }],
    columns: ['title', 's4First', 's4Issued', 's4Rev', 's4Grade', 's4Returned', 'stage', 'item'] },
  { id: 'overdue', name: 'Forecast issues overdue', statusMode: 'open', group: 'item', match: 'any',
    filters: STAGES.map(([k]) => ({ field: `${k}Forecast`, op: 'past', value: null })),
    columns: ['title', 'status', 's4Forecast', 's5Forecast', 'c01Forecast', 'prdForecast', 'drawingDt', 'itemDt', 'project'] },
  { id: 'red', name: 'Behind baseline (red)', statusMode: 'open', group: 'project', match: 'any',
    filters: STAGES.map(([k]) => ({ field: `${k}Rag`, op: 'any', value: ['Red'] })),
    columns: ['title', 'status', 's4', 's5', 'c01', 'prd', 'item'] },
  { id: 'client', name: 'With the client for review', statusMode: 'all', group: 'project', statuses: ['Client Review'],
    columns: ['title', 'stage', 'rev', 's4Issued', 's5Issued', 'c01Issued', 'item'] },
  { id: 'by-dt', name: 'By DT', statusMode: 'open', group: 'drawingDt', columns: ['title', 'status', 'stage', 'rev', 'item', 'project'] },
  { id: 'production', name: 'Production', statusMode: 'all', group: 'productionStage', filters: [{ field: 'c01SignOff', op: 'not_empty', value: null }],
    columns: ['title', 'c01SignOff', 'prdScheduled', 'productionStage', 'prdStatus', 'item', 'project'] },
];

export default function DrawingsPage() {
  return (
    <RegisterPage
      id="drawings"
      title="Drawings"
      subtitle="Master Drawing Schedule"
      db="drawings"
      statusOf={r => r.status}
      statusTone={s => TONE[s] || 'muted'}
      openStatuses={OPEN}
      openLabel="Not complete"
      fields={fields}
      defaultColumns={DEFAULT_COLUMNS}
      starterViews={STARTERS}
      searchText={(r, ctx) => [r.title, r.name, r.status, r.rev, r.type, ctx.itemOf(r)?.title].filter(Boolean).join(' ')}
      initialSort={{ key: 'title', dir: 'asc' }}
      defaultGroup="item"
      filename="Drawings"
      extraDbs={['submissions', 'programme']}
    />
  );
}
