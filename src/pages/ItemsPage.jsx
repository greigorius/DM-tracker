// Items: every Tasks-DB item with its status, owner, programme dates and
// open RFIs / VCs / drawings. Read from the snapshot.
import { useMemo } from 'react';
import { TrackerPage, fmtDate } from './TrackerPage.jsx';
import { StatusPill } from '../components/ui/table.jsx';
import { Badge } from '../components/ui/index.js';
import { ITEM_STATUS_COLORS } from '../data/colors.js';
import { stagesFor } from '../../hub-core/stage.js';
import { DONE_ITEM_STATUSES, isOpenRfi, isOpenVc, londonToday } from '../../hub-core/derive.js';

const today = londonToday();
const toneOf = s => {
  const c = ITEM_STATUS_COLORS[s]?.text || '';
  return c.includes('danger') ? 'danger' : c.includes('accent') ? 'accent' : c.includes('ok') ? 'ok' : c.includes('info') ? 'info' : 'muted';
};
const OPEN = { has: s => !DONE_ITEM_STATUSES.has(s) };
const dateCell = (d, done) => (d ? <span className={`font-mono text-[12px] whitespace-nowrap ${!done && d < today ? 'text-danger' : 'text-text-2'}`}>{fmtDate(d)}</span> : <span className="text-muted">—</span>);
const count = (n, tone) => (n ? <Badge tone={tone}>{n}</Badge> : <span className="text-muted">·</span>);

function useCounts(ctx) {
  return useMemo(() => {
    const by = (rows, pred) => {
      const m = new Map();
      for (const r of rows) if (!r.archived && pred(r)) for (const id of r.itemIds || []) m.set(id, (m.get(id) || 0) + 1);
      return m;
    };
    return {
      rfis: by(ctx.data.rfis || [], isOpenRfi),
      vcs: by(ctx.data.variations || [], isOpenVc),
      drawings: by(ctx.data.drawings || [], () => true),
      stages: stagesFor(ctx.data.tasks || [], ctx.data.drawings || [], ctx.data.submissions || []),
    };
  }, [ctx.data]);
}

function columns(ctx) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const c = useCounts(ctx);
  return [
    { key: 'title', label: 'Item', render: r => <a href={r.url} target="_blank" rel="noreferrer" className="text-text no-underline hover:underline min-w-[200px] inline-block">{r.title || 'Untitled'}</a> },
    { key: 'status', label: 'Status', width: 160, render: r => <StatusPill status={r.status} tone={toneOf(r.status)} /> },
    { key: 'stage', label: 'Stage', width: 170, sortValue: r => c.stages.get(r.id)?.label, csv: r => c.stages.get(r.id)?.label,
      render: r => { const s = c.stages.get(r.id); return s ? <span title={s.why}><Badge tone={s.tone}>{s.label}</Badge></span> : null; } },
    { key: 'bic', label: 'BIC', width: 110, cellClassName: 'font-mono text-[12px] text-text-2' },
    { key: 'dt', label: 'DT', width: 150, sortValue: r => ctx.team.get(r.dtIds[0]), render: r => <span className="text-text-2">{r.dtIds.map(id => ctx.team.get(id)).filter(Boolean).join(', ') || '—'}</span>, csv: r => r.dtIds.map(id => ctx.team.get(id)).join('; ') },
    { key: 'sub1', label: 'S4 sub', width: 104, sortValue: r => r.dates?.sub1, render: r => dateCell(r.dates?.sub1, !!r.dt?.s4DelAct), csv: r => r.dates?.sub1 },
    { key: 'sub2', label: 'S5 sub', width: 104, sortValue: r => r.dates?.sub2, render: r => dateCell(r.dates?.sub2, !!r.dt?.s5DelAct), csv: r => r.dates?.sub2 },
    { key: 'constrSub', label: 'C01 sub', width: 104, sortValue: r => r.dates?.constrSub, render: r => dateCell(r.dates?.constrSub, !!r.dt?.cDelAct), csv: r => r.dates?.constrSub },
    { key: 'production', label: 'Production', width: 110, sortValue: r => r.dates?.production, render: r => dateCell(r.dates?.production, !!r.dt?.productionAct), csv: r => r.dates?.production },
    { key: 'rfis', label: 'RFIs', width: 70, sortValue: r => c.rfis.get(r.id) || 0, render: r => count(c.rfis.get(r.id), 'info'), csv: r => c.rfis.get(r.id) || 0 },
    { key: 'vcs', label: 'VCs', width: 70, sortValue: r => c.vcs.get(r.id) || 0, render: r => count(c.vcs.get(r.id), 'accent'), csv: r => c.vcs.get(r.id) || 0 },
    { key: 'drawings', label: 'Dwgs', width: 70, sortValue: r => c.drawings.get(r.id) || 0, render: r => count(c.drawings.get(r.id), 'muted'), csv: r => c.drawings.get(r.id) || 0 },
    { key: 'blocker', label: 'Blocker', width: 200, sortValue: r => r.blocker.join(', '), render: r => (r.blocker.length ? <span className="text-danger text-[13px]">{r.blocker.join(', ')}</span> : null), csv: r => r.blocker.join('; ') },
    { key: 'project', label: 'Project', width: 180, sortValue: r => ctx.projects.get(r.projectId), render: r => <span className="text-text-2">{ctx.projects.get(r.projectId) || '—'}</span>, csv: r => ctx.projects.get(r.projectId) },
  ];
}

const GROUPINGS = [
  { value: 'project', label: 'Group: Project', key: r => r.projectId, name: (k, ctx) => ctx.projects.get(k) || 'No project' },
  { value: 'status', label: 'Group: Status', key: r => r.status, name: k => k || 'No status' },
  { value: 'bic', label: 'Group: Ball in court', key: r => r.bic, name: k => k || 'No ball in court' },
  { value: 'dt', label: 'Group: DT', key: r => r.dtIds[0] ?? null, name: (k, ctx) => ctx.team.get(k) || 'Unassigned' },
];

export default function ItemsPage() {
  return (
    <TrackerPage
      id="items"
      title="Items"
      subtitle="Status, owner and programme per item"
      db="tasks"
      extraDbs={['rfis', 'variations', 'drawings', 'submissions']}
      projectOf={r => r.projectId}
      statusOf={r => r.status}
      statusTone={toneOf}
      openStatuses={OPEN}
      openLabel="Active only"
      columns={columns}
      groupings={GROUPINGS}
      defaultGroup="project"
      searchText={(r, ctx) => [r.title, r.status, r.bic, ...r.dtIds.map(id => ctx.team.get(id))].filter(Boolean).join(' ')}
      initialSort={{ key: 'title', dir: 'asc' }}
      filename="items.csv"
    />
  );
}
