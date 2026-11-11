// Timeline: one row per item, showing the first drawing number and how many
// drawings it has, then submitted / returned dates for each stage (S4, S5,
// A4.5 or PRD). Click an item to see its drawings. Read-only: planned dates
// come from the Scheduling Tool.

import { Fragment, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, FileDown, Sheet } from 'lucide-react';
import { PageShell, Card, Badge, SkeletonRows, cx, useToast } from '../components/ui/index.js';
import { ToolbarSelect, ToolbarButton, TableGroup, useGroups } from '../components/ui/table.jsx';
import { useSnapshots, useBootstrap } from '../hooks/hub.js';
import { drawnByFor, drawnByIds } from '../../hub-core/drawnBy.js';
import { isActiveItem, londonToday } from '../../hub-core/derive.js';
import { buildTimeline, STAGES, SHOW } from '../../hub-core/timeline.js';
import { TimelineReport } from './timeline/TimelineReport.jsx';
import { fmtDay, gradeTone, printReport } from './timeline/format.js';

const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
function useStored(key, initial) {
  const [v, setV] = useState(() => store.get(key, initial));
  return [v, x => { setV(x); store.set(key, x); }];
}

const STAGE_OPTIONS = [{ value: 'all', label: 'All stages' }, ...STAGES.map(s => ({ value: s.key, label: s.code }))];

// ── Cells ────────────────────────────────────────────────────────────────────
function Late({ days }) {
  return <span className="font-mono text-[11px] text-danger">{days} day{days === 1 ? '' : 's'} late</span>;
}

export function SubCell({ c, today, na }) {
  if (na) return <span className="font-mono text-[12px] text-muted">N/A</span>;
  if (!c) return <span className="font-mono text-[12px] text-line-strong">—</span>;
  const partial = c.total && c.issued < c.total;
  return (
    <span className="flex flex-col gap-0.5">
      <span className={cx('font-mono text-[12px] whitespace-nowrap', c.kind === 'plan' ? (c.late ? 'text-danger italic' : 'text-muted italic') : 'text-text')}>
        {c.reissue && <span className="text-accent not-italic mr-1.5" title={`Reissue pending (last issued ${fmtDay(c.actual, today) || '—'})`}>R</span>}
        {c.date ? fmtDay(c.date, today) : <span className="text-muted">No forecast</span>}
      </span>
      {partial && <span className="font-mono text-[11px] text-muted">{c.issued}/{c.total} issued</span>}
      {c.late > 0 && <Late days={c.late} />}
    </span>
  );
}

export function RetCell({ c, today, na }) {
  if (na) return <span className="font-mono text-[12px] text-muted">N/A</span>;
  if (!c) return <span className="font-mono text-[12px] text-line-strong">—</span>;
  if (c.kind === 'act') {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        {c.grade === 'Approved' ? <ApprovedTick /> : c.grade && <Badge tone={gradeTone(c.grade)}>{c.grade}</Badge>}
        <span className="font-mono text-[12px] text-text">{fmtDay(c.date, today)}</span>
      </span>
    );
  }
  // Forecast (not stored in Notion): submission + the Scheduling Tool's review / sign-off period
  return (
    <span className="flex flex-col gap-0.5">
      <span className={cx('font-mono text-[12px] italic whitespace-nowrap', c.late ? 'text-danger' : 'text-muted')}>
        {c.date ? fmtDay(c.date, today) : 'No forecast'}
      </span>
      {c.awaiting && <span className="font-mono text-[11px] text-text-2">Awaiting{c.total > 1 ? ` · ${c.back}/${c.total} back` : ''}{c.grade ? ` · ${c.grade}` : ''}</span>}
      {c.late > 0 && <Late days={c.late} />}
    </span>
  );
}

// Approved (A4.5 sign-off / PRD) as a green tick in a box
function ApprovedTick() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" role="img" aria-label="Approved" className="shrink-0 text-ok">
      <rect x="0.5" y="0.5" width="17" height="17" fill="none" stroke="currentColor" strokeOpacity="0.5" />
      <path d="M4.5 9.2 7.6 12.2 13.5 5.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
    </svg>
  );
}

const BIC_TONE = { DM: 'accent', DT: 'info' };

// ── Table ────────────────────────────────────────────────────────────────────
function TimelineTable({ rows, stages, today, team }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = id => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const th = 'px-2.5 py-2 text-left font-normal section-label text-[11px] whitespace-nowrap';
  const edge = 'border-l border-line';

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[14px]" style={{ minWidth: 560 + stages.length * 270 }}>
        <thead>
          <tr className="bg-bar">
            <th colSpan={4} className="p-0" aria-hidden="true" />
            {stages.map(s => (
              <th key={s.key} colSpan={2} scope="colgroup" className={cx('px-3 pt-2.5 pb-1 text-left font-normal', edge)}>
                <span className="font-mono text-[13px] text-text">{s.key === 'con' ? 'A4.5 / PRD' : s.code}</span>
                <span className="ml-2 text-[12px] text-muted">{s.name}</span>
              </th>
            ))}
          </tr>
          <tr className="bg-bar border-b border-line">
            <th scope="col" className={th} style={{ width: 250 }}>Item</th>
            <th scope="col" className={th} style={{ width: 200 }}>Drawings</th>
            <th scope="col" className={th} style={{ width: 72 }} title="Lead DT, then anyone else who has submitted drawings for the item">DT</th>
            <th scope="col" className={th} style={{ width: 92 }}>BIC</th>
            {stages.map(s => (
              <Fragment key={s.key}>
                <th scope="col" className={cx(th, edge)}>Submitted</th>
                <th scope="col" className={th}>Comments / status</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const isOpen = open.has(r.id);
            const lead = r.dtIds.map(id => team.get(id)).filter(Boolean);
            const others = r.drawnBy.filter(id => !r.dtIds.includes(id)).map(id => team.get(id)).filter(Boolean);
            const dts = [...lead, ...others];
            const dtTitle = [lead.length && `Lead: ${lead.join(', ')}`, others.length && `Also drawn by: ${others.join(', ')}`].filter(Boolean).join(' · ');
            return (
              <Fragment key={r.id}>
                <tr className={cx('border-b border-line align-top', isOpen ? 'bg-surface-hi' : 'hover:bg-surface-hi')}>
                  <td className="p-0">
                    <button
                      type="button"
                      onClick={() => toggle(r.id)}
                      aria-expanded={isOpen}
                      className="w-full min-h-12 px-3 py-2.5 flex items-start gap-2 bg-transparent border-0 text-left text-text cursor-pointer"
                    >
                      {isOpen ? <ChevronDown size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" /> : <ChevronRight size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />}
                      <span className="text-[14px] font-medium leading-snug">{r.title}</span>
                    </button>
                  </td>
                  <td className="px-2.5 py-2.5">
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <span className="font-mono text-[12px] text-text">{r.first}</span>
                      {r.count > 1 && <Badge>+{r.count - 1}</Badge>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-text-2 whitespace-nowrap" title={dtTitle}>{lead.map(initials).join(', ')}{others.length > 0 && <span className="text-muted">{lead.length ? ' + ' : ''}{others.map(initials).join(', ')}</span>}{!dts.length && '—'}</td>
                  <td className="px-2.5 py-2.5">{r.bic ? <Badge tone={BIC_TONE[r.bic] || 'muted'}>{r.bic}</Badge> : <span className="text-muted">—</span>}</td>
                  {stages.map(s => (
                    <Fragment key={s.key}>
                      <td className={cx('px-2.5 py-2.5', edge)}><SubCell c={r.stages[s.key].sub} na={r.stages[s.key].na} today={today} /></td>
                      <td className="px-2.5 py-2.5">
                        <RetCell c={r.stages[s.key].ret} na={r.stages[s.key].na} today={today} />
                        {s.key === 'con' && r.stages.con.sub && <span className="block mt-0.5 font-mono text-[10px] text-muted">{r.prd ? 'PRD' : 'A4.5'}</span>}
                      </td>
                    </Fragment>
                  ))}
                </tr>
                {isOpen && r.drawings.map(d => (
                  <tr key={d.id} className="border-b border-line bg-bar align-top">
                    <td className="pl-10 pr-3 py-2 text-[13px] text-text-2">{d.name || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <a href={d.url} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-info no-underline hover:underline">{d.title}</a>
                      {d.rev && <span className="ml-2 font-mono text-[11px] text-muted">{d.rev}</span>}
                    </td>
                    <td /><td />
                    {stages.map(s => (
                      <Fragment key={s.key}>
                        <td className={cx('px-3 py-2', edge)}><SubCell c={d.stages[s.key].sub} na={d.stages[s.key].na} today={today} /></td>
                        <td className="px-3 py-2"><RetCell c={d.stages[s.key].ret} na={d.stages[s.key].na} today={today} /></td>
                      </Fragment>
                    ))}
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const initials = name => name.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase();

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] text-muted">
      <span className="text-text">16 Sep actual</span>
      <span className="italic">16 Sep planned</span>
      <span className="text-danger">late</span>
      <span className="inline-flex items-center gap-1"><Badge tone="ok">A</Badge><Badge tone="accent">B</Badge><Badge tone="danger">C</Badge> grade</span>
      <span className="inline-flex items-center gap-1.5"><ApprovedTick /> approved</span>
      <span><span className="text-accent">R</span> reissue pending</span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function TimelinePage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: boot } = useBootstrap();
  const today = boot?.today || londonToday();
  const { data, isPending } = useSnapshots(['tasks', 'drawings', 'projects', 'clients', 'team', 'submissions']);

  const [show, setShow] = useStored('hub.timeline.show', 'all');
  const [stage, setStage] = useStored('hub.timeline.stage', 'all');
  const [bic, setBic] = useStored('hub.timeline.bic', 'all');
  const [dt, setDt] = useStored('hub.timeline.dt', 'all');
  const [exporting, setExporting] = useState(false);

  const projects = useMemo(() => new Map(data.projects.map(p => [p.id, p])), [data.projects]);
  const clients = useMemo(() => new Map(data.clients.map(c => [c.id, c.title])), [data.clients]);
  const team = useMemo(() => new Map(data.team.map(t => [t.id, t.title])), [data.team]);

  // Every active item with drawings, built once; filters run on top.
  const all = useMemo(() => {
    const items = data.tasks.filter(i => isActiveItem(i) && (!projectId || i.projectId === projectId));
    const drawnBy = drawnByFor(data.submissions);
    return buildTimeline({ items, drawings: data.drawings, projects, today })
      .map(r => ({ ...r, drawnBy: drawnByIds(drawnBy, r.id) }))
      .filter(r => r.count > 0)
      .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true }));
  }, [data.tasks, data.drawings, data.submissions, projects, projectId, today]);

  const showTest = SHOW.find(s => s.value === show)?.test || SHOW[0].test;
  const rows = useMemo(() => all.filter(r => showTest(r)
    && (bic === 'all' || r.bic === bic)
    && (dt === 'all' || r.dtIds.includes(dt) || r.drawnBy.includes(dt))), [all, showTest, bic, dt]);

  const stages = stage === 'all' ? STAGES : STAGES.filter(s => s.key === stage);
  const { groups, isOpen, toggle } = useGroups(rows, projectId ? null : r => r.projectId, k => projects.get(k)?.title || 'No project');

  const project = projects.get(projectId);
  const clientName = project ? clients.get(project.clientIds?.[0]) : null;

  const projectOptions = useMemo(() => [
    { value: '', label: 'All projects' },
    ...[...new Set(data.tasks.filter(isActiveItem).map(i => i.projectId).filter(Boolean))]
      .map(id => ({ value: id, label: projects.get(id)?.title || 'Unknown project' }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ], [data.tasks, projects]);
  const showOptions = SHOW.map(s => ({ value: s.value, label: `${s.label} (${all.filter(s.test).length})` }));
  const bicOptions = [{ value: 'all', label: 'Any ball in court' }, ...[...new Set(all.map(r => r.bic).filter(Boolean))].sort().map(b => ({ value: b, label: `BIC: ${b}` }))];
  const dtOptions = [{ value: 'all', label: 'All DTs' }, ...[...new Set(all.flatMap(r => [...r.dtIds, ...r.drawnBy]))].map(id => ({ value: id, label: team.get(id) || 'Unknown' })).sort((a, b) => a.label.localeCompare(b.label))];

  const exportName = `${(project?.title || 'All-projects').replace(/[^\w-]+/g, '-')}_Timeline_${today.slice(2).replace(/-/g, '')}`;

  const onExcel = async () => {
    setExporting(true);
    try {
      const { exportTimelineXlsx } = await import('./timeline/timelineXlsx.js');
      await exportTimelineXlsx({ rows, stages, today, team, projects, filename: `${exportName}.xlsx`, grouped: !projectId });
    } catch (e) {
      toast.show(`Excel export failed: ${e.message}`, { tone: 'danger' });
    } finally { setExporting(false); }
  };

  return (
    <PageShell
      title="Timeline"
      subtitle={project ? project.title : 'Drawing programme for active items'}
      toolbar={<>
        <ToolbarSelect label="Project" value={projectId} onChange={v => navigate(v ? `/timeline/${v}` : '/timeline')} options={projectOptions} />
        <ToolbarSelect label="Show" value={show} onChange={setShow} options={showOptions} />
        <ToolbarSelect label="Stage" value={stage} onChange={setStage} options={STAGE_OPTIONS} />
        <ToolbarSelect label="Ball in court" value={bic} onChange={setBic} options={bicOptions} />
        <ToolbarSelect label="DT" value={dt} onChange={setDt} options={dtOptions} />
        <span className="ml-auto inline-flex">
          <ToolbarButton onClick={printReport} disabled={!rows.length} aria-label="Export PDF"><FileDown size={14} aria-hidden="true" /> PDF</ToolbarButton>
          <ToolbarButton onClick={onExcel} disabled={!rows.length || exporting} className="-ml-px" aria-label="Export Excel (item rows only)" title="Item rows only">
            <Sheet size={14} aria-hidden="true" /> {exporting ? 'Exporting…' : 'Excel'}
          </ToolbarButton>
        </span>
      </>}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 -mt-2">
        <span className="font-mono text-[12px] text-muted">{rows.length} item{rows.length === 1 ? '' : 's'} · forecasts are the Scheduling Tool's Adj dates</span>
        <Legend />
      </div>

      {isPending ? <Card className="p-4"><SkeletonRows rows={8} /></Card> : rows.length === 0 ? (
        <Card className="p-4 text-[14px] text-muted">No items match these filters.</Card>
      ) : projectId ? (
        <Card><TimelineTable rows={rows} stages={stages} today={today} team={team} /></Card>
      ) : groups.map(g => (
        <TableGroup key={g.key} title={g.label} count={g.rows.length} open={isOpen(g.key)} onToggle={() => toggle(g.key)}>
          <TimelineTable rows={g.rows} stages={stages} today={today} team={team} />
        </TableGroup>
      ))}

      <TimelineReport
        rows={rows}
        stages={stages}
        today={today}
        projectTitle={project?.title || 'All active projects'}
        clientName={clientName}
        projects={projectId ? null : projects}
        clientOf={pid => clients.get(projects.get(pid)?.clientIds?.[0])}
      />
    </PageShell>
  );
}
