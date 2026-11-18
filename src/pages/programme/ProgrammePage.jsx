// Programme: the Scheduling Tool's date engine inside the Hub.
//   Review   (landing) items grouped by what they need from you
//   Table    one row per item, stage by stage
//   Timeline client reviews on a date axis
// One Filter and one Export cover every tab; ⚙ holds periods, minimums and
// writing Adj dates to Notion. Dates are calculated in the browser from the
// cached snapshots — the same engine and inputs the server writes from.

import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Download, Filter, Settings2 } from 'lucide-react';
import { PageShell, Card, SkeletonRows, cx, useToast } from '../../components/ui/index.js';
import { ToolbarSelect, SearchBox } from '../../components/ui/table.jsx';
import { useProgramme, useProgrammePlan } from '../../hooks/programme.js';
import { RELEASE_STAGES, releaseRow } from '../../../hub-core/programme/release.js';
import { toISO } from '../../../hub-core/programme/schedule.js';
import { buildTimeline, STAGES } from '../../../hub-core/timeline.js';
import { drawnByFor, drawnByIds } from '../../../hub-core/drawnBy.js';
import { TimelineReport } from '../timeline/TimelineReport.jsx';
import { printReport } from '../timeline/format.js';
import { Menu, MenuItem, MenuLabel, Legend } from './parts.jsx';
import { ReviewTab } from './ReviewTab.jsx';
import { TableTab } from './TableTab.jsx';
import { TimelineTab } from './TimelineTab.jsx';
import { SettingsPanel } from './SettingsPanel.jsx';

const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
function useStored(key, initial) {
  const [v, setV] = useState(() => store.get(key, initial));
  return [v, x => { setV(x); store.set(key, x); }];
}

const TABS = [{ id: 'review', label: 'Review' }, { id: 'table', label: 'Table' }, { id: 'timeline', label: 'Timeline' }];
const SHOW = [
  { value: 'all', label: 'All items', test: () => true },
  { value: 'attention', label: 'Needs attention', test: i => ['fix', 'challenge', 'check'].includes(i.group) },
  { value: 'split', label: 'Split items', test: i => i.drawings.split },
  { value: 'prog', label: 'Programme-driven', test: i => i.prog },
];
const STAGE_NOW = [{ value: 'any', label: 'Any' }, { value: 's4', label: 'S4' }, { value: 's5', label: 'S5' }, { value: 'c01', label: 'A4.5 / PRD' }];
const ATTENTION = new Set(['fix', 'challenge']);
// The stage an item is working on: the first one not issued
const stageNow = i => i.stages.find(s => !s.na && s.state !== 'closed')?.key || 'done';

export default function ProgrammePage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t.id === params.get('tab')) ? params.get('tab') : 'review';
  const selected = params.get('item') || '';
  const toast = useToast();

  const [show, setShow] = useStored('hub.programme.show', 'all');
  const [stage, setStage] = useStored('hub.programme.stage', 'any');
  const [hideIdle, setHideIdle] = useStored('hub.programme.hideIdle', '1');
  const [q, setQ] = useState('');
  const [settings, setSettings] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { items: raw, today, data, live, isPending } = useProgramme(projectId);
  const plan = useProgrammePlan(projectId);
  const projects = useMemo(() => new Map(data.projects.map(p => [p.id, p])), [data.projects]);
  const clients = useMemo(() => new Map(data.clients.map(c => [c.id, c.title])), [data.clients]);
  const team = useMemo(() => new Map(data.team.map(t => [t.id, t.title])), [data.team]);
  const project = projects.get(projectId) || null;
  const titleOf = useCallback(id => projects.get(id)?.title || 'No project', [projects]);

  const all = useMemo(() => raw.map(i => ({ ...i, projectName: titleOf(i.projectId) }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true })), [raw, titleOf]);
  const showTest = SHOW.find(s => s.value === show)?.test || SHOW[0].test;
  const needle = q.trim().toLowerCase();
  const items = useMemo(() => all.filter(i => showTest(i)
    && (hideIdle !== '1' || i.group !== 'idle')
    && (stage === 'any' || stageNow(i) === stage)
    && (!needle || i.name.toLowerCase().includes(needle) || i.drawings.dwgs.some(d => (d.no || '').toLowerCase().includes(needle)))), [all, showTest, hideIdle, stage, needle]);
  const reviewCount = all.filter(i => ATTENTION.has(i.group)).length;
  const filterCount = (show !== 'all') + (stage !== 'any') + (hideIdle !== '1');

  const setTab = id => setParams(p => { const n = new URLSearchParams(p); n.set('tab', id); return n; });
  const select = useCallback((id, replace) => setParams(p => { const n = new URLSearchParams(p); n.set('item', id); return n; }, { replace: !!replace }), [setParams]);
  const openReview = id => setParams(p => { const n = new URLSearchParams(p); n.set('tab', 'review'); n.set('item', id); return n; });

  const projectOptions = useMemo(() => [
    { value: '', label: 'All live projects' },
    ...[...live].map(id => ({ value: id, label: titleOf(id) })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
  ], [live, titleOf]);

  // ── Exports ───────────────────────────────────────────────────────────────
  const name = project?.title || 'All live projects';
  const fileBase = `${name.replace(/[^\w-]+/g, '-')}_${today.slice(2).replace(/-/g, '')}`;
  const timelineRows = useMemo(() => {
    const ids = new Set(items.map(i => i.id));
    const tasks = data.tasks.filter(t => ids.has(t.id));
    const drawnBy = drawnByFor(data.submissions);
    return buildTimeline({ items: tasks, drawings: data.drawings, projects, today })
      .map(r => ({ ...r, drawnBy: drawnByIds(drawnBy, r.id) }))
      .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true }));
  }, [items, data.tasks, data.drawings, data.submissions, projects, today]);

  const run = async (label, fn) => {
    setExporting(true);
    try { await fn(); } catch (e) { toast.show(`${label} failed: ${e.message}`, { tone: 'danger' }); } finally { setExporting(false); }
  };
  const iso = d => (d ? toISO(d) : '');
  const exportGantt = () => run('Gantt export', async () => {
    const { exportGanttWorkbook } = await import('../../../hub-core/programme/ganttExport.js');
    const its = items.filter(i => i.group !== 'idle');
    await exportGanttWorkbook({
      projectName: name,
      items: its.map(i => ({ name: i.name, status: i.status, row: i.entry.row, c: i.entry.c })),
      data: its.map(({ name: n, projectName, entry: { c, row } }) => ({
        Project: projectName, Item: n, Status: row.status,
        'S4 DT Start (Adj)': iso(c.dtStart1A), 'S4 Submission (Adj)': iso(c.sub1A), 'S4 Approval (Adj)': iso(c.s4A),
        'S5 DT Start (Adj)': iso(c.st2A), 'S5 Submission (Adj)': iso(c.sub2A), 'S5 Approval (Adj)': iso(c.s5A),
        'A4.5/PRD DT Start (Adj)': iso(c.stCA), 'A4.5/PRD Submission (Adj)': iso(c.subCA), 'A4.5/PRD Sign Off (Adj)': iso(c.c01SignOffAdj),
        'Production (Adj)': iso(c.prodDateAdj), 'Target Production': row.prodDate || '', Float: c.floatDays ?? '',
        Holds: (c.holdLabels || []).join('; '),
      })),
      fileName: `${fileBase}_Programme.xlsx`,
    });
  });
  const exportRelease = () => run('Release schedule export', async () => {
    const { exportReleaseWorkbook } = await import('../../../hub-core/programme/ganttExport.js');
    await exportReleaseWorkbook({ projectName: name, rows: items.filter(i => i.group !== 'idle').map(i => releaseRow(i.entry.row, i.entry.c)), stages: RELEASE_STAGES, fileName: `${fileBase}_Release-Schedule.xlsx` });
  });
  const exportItems = () => run('Excel export', async () => {
    const { exportTimelineXlsx } = await import('../timeline/timelineXlsx.js');
    await exportTimelineXlsx({ rows: timelineRows, stages: STAGES, today, team, projects, filename: `${fileBase}_Items.xlsx`, grouped: !projectId });
  });

  const planText = plan.data
    ? plan.data.blocked.length ? `${plan.data.blocked.length} blocked by order check` : plan.data.changes.length ? `${plan.data.changes.reduce((a, c) => a + c.count, 0)} Adj dates to write` : 'Notion up to date'
    : null;

  return (
    <PageShell
      title="Programme"
      subtitle={project ? project.title : 'All live projects'}
      toolbar={<>
        <ToolbarSelect label="Project" value={projectId} onChange={v => navigate({ pathname: v ? `/programme/${v}` : '/programme', search: `?tab=${tab}` })} options={projectOptions} />
        <div role="tablist" aria-label="View" className="flex border-b border-line">
          {TABS.map(t => {
            const on = t.id === tab;
            return (
              <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.id)}
                className={cx('min-h-11 px-4 inline-flex items-center gap-2 border-0 border-b-2 -mb-px font-mono text-[12px] uppercase tracking-[0.1em] cursor-pointer',
                  on ? 'bg-surface-hi text-text border-accent' : 'bg-transparent text-muted border-transparent hover:text-text-2')}>
                {t.label}
                {t.id === 'review' && reviewCount > 0 && <span className="px-1.5 border border-danger/50 text-danger text-[10px] leading-4 tabular-nums">{reviewCount}</span>}
              </button>
            );
          })}
        </div>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Item or drawing no." />
          <Menu label="Filter" icon={<Filter size={14} aria-hidden="true" />} badge={filterCount || null}>
            <MenuLabel first>Show</MenuLabel>
            {SHOW.map(s => <MenuItem key={s.value} active={show === s.value} onClick={() => setShow(s.value)} count={all.filter(s.test).length}>{s.label}</MenuItem>)}
            <MenuLabel>Stage now</MenuLabel>
            <div className="flex flex-wrap gap-1.5 px-4 pb-3">
              {STAGE_NOW.map(s => (
                <button key={s.value} type="button" aria-pressed={stage === s.value} onClick={() => setStage(s.value)}
                  className={cx('min-h-9 px-3 border text-[13px] cursor-pointer', stage === s.value ? 'bg-surface-hi text-accent border-accent' : 'bg-transparent text-text-2 border-line-strong')}>{s.label}</button>
              ))}
            </div>
            <MenuLabel>Items</MenuLabel>
            <label className="min-h-11 px-4 flex items-center gap-2.5 text-[14px] cursor-pointer">
              <input type="checkbox" checked={hideIdle === '1'} onChange={e => setHideIdle(e.target.checked ? '1' : '0')} className="w-[18px] h-[18px] accent-[var(--color-accent)]" />
              Hide complete, omitted and unprogrammed
            </label>
            <span className="px-4 pb-3 text-[12px] text-muted">Applies to Review, Table and Timeline.</span>
            {filterCount > 0 && <MenuItem onClick={() => { setShow('all'); setStage('any'); setHideIdle('1'); }}>Clear filters</MenuItem>}
          </Menu>
          <Menu label={exporting ? 'Exporting…' : 'Export'} primary icon={<Download size={14} aria-hidden="true" />} width={320}>
            {close => <>
              <MenuItem disabled={!items.length || exporting} onClick={() => { close(); exportGantt(); }} desc="Submission → approval bars, production milestones">Gantt chart (Excel)</MenuItem>
              <MenuItem disabled={!items.length || exporting} onClick={() => { close(); exportRelease(); }} desc="First drawing number and count by planned issue date">Drawing release schedule (Excel)</MenuItem>
              <MenuItem disabled={!timelineRows.length} onClick={() => { close(); printReport(); }} desc="Item-level drawing programme, as filtered (print to PDF)">Programme (PDF)</MenuItem>
              <MenuItem disabled={!timelineRows.length || exporting} onClick={() => { close(); exportItems(); }} desc="Collapsed item rows only">Item rows (Excel)</MenuItem>
            </>}
          </Menu>
          <button type="button" onClick={() => setSettings(true)} aria-label="Programme settings — periods, minimums, write to Notion" title="Periods, minimums, write to Notion"
            className="w-11 h-11 inline-flex items-center justify-center bg-transparent border border-line-strong text-text-2 cursor-pointer hover:bg-surface-hi">
            <Settings2 size={16} aria-hidden="true" />
          </button>
        </span>
      </>}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 -mt-2">
        <span className="font-mono text-[12px] text-muted">
          {items.length} item{items.length === 1 ? '' : 's'}
          {planText && <> · <button type="button" onClick={() => setSettings(true)} className={cx('bg-transparent border-0 p-0 font-mono text-[12px] cursor-pointer underline-offset-2 hover:underline', plan.data?.blocked.length ? 'text-danger' : plan.data?.changes.length ? 'text-accent' : 'text-ok')}>{planText}</button></>}
        </span>
        <Legend />
      </div>

      {isPending ? <Card className="p-4"><SkeletonRows rows={8} /></Card>
        : tab === 'review' ? <ReviewTab items={items} today={today} selected={selected} onSelect={select} projectName={project?.title} />
          : tab === 'table' ? <TableTab items={items} today={today} grouped={!projectId} projectTitle={titleOf} onOpenReview={openReview} />
            : <TimelineTab items={items} today={today} selected={selected} onSelect={select} projectName={project?.title} />}

      {settings && <SettingsPanel key={projectId} project={project} projectId={projectId} titleOf={titleOf} onClose={() => setSettings(false)} />}

      <TimelineReport
        rows={timelineRows}
        stages={STAGES}
        today={today}
        projectTitle={name}
        clientName={project ? clients.get(project.clientIds?.[0]) : null}
        projects={projectId ? null : projects}
        clientOf={pid => clients.get(projects.get(pid)?.clientIds?.[0])}
      />
    </PageShell>
  );
}
