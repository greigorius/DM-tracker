// ⚙ Programme settings: project periods and squeeze minimums, and writing
// Adj dates to Notion.
import { useState } from 'react';
import { X } from 'lucide-react';
import { Button, cx, useToast } from '../../components/ui/index.js';
import { PERIOD_DEFAULTS, PERIOD_LABELS, PROJECT_PERIOD_KEYS, PERIOD_MINIMUMS, MIN_PROJECT_KEYS } from '../../../hub-core/programme/schedule.js';
import { useProgrammePlan, useApplyProgramme, useUpdateProgrammeProject } from '../../hooks/programme.js';

const MIN_LABELS = { approvalIssue: 'Approval Issue', revisionIssue: 'Revision Issue', constrIssue: 'Construction Issue', qa: 'QA' };
const MODE_TEXT = {
  on: 'Automatic: each Hub sync writes changed Adj dates.',
  dry: 'Review only: nothing is written until you press Write.',
  off: 'Off: nothing is written until you press Write.',
};

function NumberRow({ label, value, placeholder, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 min-h-11">
      <span className="text-[14px] text-text-2">{label}</span>
      <span className="inline-flex items-center gap-2">
        <input type="number" min="0" inputMode="numeric" value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-20 min-h-11 px-3 bg-ground border border-line-strong text-text text-right font-mono text-[14px] outline-none focus:border-accent" />
        <span className="font-mono text-[12px] text-muted w-4">d</span>
      </span>
    </label>
  );
}

export function SettingsPanel({ project, projectId, onClose, titleOf }) {
  const toast = useToast();
  const plan = useProgrammePlan(projectId);
  const apply = useApplyProgramme();
  const saveProject = useUpdateProgrammeProject();
  const sched = project?.sched || {};
  const [periods, setPeriods] = useState({});
  const [mins, setMins] = useState({});

  const dirty = Object.keys(periods).length + Object.keys(mins).length > 0;
  const save = () => saveProject.mutate({ id: project.id, periods, minimums: mins }, {
    onSuccess: r => {
      setPeriods({}); setMins({});
      const n = (r?.sync?.done || []).reduce((a, d) => a + d.count, 0);
      toast.show(`Periods saved${n ? ` · ${n} Adj date${n === 1 ? '' : 's'} written to Notion` : ''}${r?.sync?.remaining ? ` · ${r.sync.remaining} items left, press Write` : ''}`);
    },
    onError: e => toast.show(`Could not save: ${e.message}`, { tone: 'danger' }),
  });
  const write = ids => apply.mutate({ ids, projectId }, {
    onSuccess: r => {
      const n = r.done.reduce((a, d) => a + d.count, 0);
      toast.show(r.failed.length ? `${r.failed.length} item${r.failed.length === 1 ? '' : 's'} failed: ${r.failed[0].error}` : `${n} Adj date${n === 1 ? '' : 's'} written to ${r.done.length} item${r.done.length === 1 ? '' : 's'}${r.remaining ? ` · ${r.remaining} left, press again` : ''}`,
        { tone: r.failed.length ? 'danger' : undefined });
    },
    onError: e => toast.show(`Write failed: ${e.message}`, { tone: 'danger' }),
  });

  const p = plan.data;
  const dates = p ? p.changes.reduce((a, c) => a + c.count, 0) : 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="Programme settings" onClick={e => e.stopPropagation()}
        className="w-full max-w-[460px] h-full overflow-y-auto bg-bar border-l border-line-strong flex flex-col">
        <div className="sticky top-0 bg-bar border-b border-line px-5 min-h-16 flex items-center justify-between gap-3">
          <span className="flex flex-col"><span className="section-label text-[11px]">Programme settings</span><span className="text-[15px] font-semibold">{project?.title || 'All projects'}</span></span>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 inline-flex items-center justify-center bg-transparent border border-line-strong text-text-2 cursor-pointer"><X size={16} /></button>
        </div>

        <section className="px-5 py-4 flex flex-col gap-3 border-b border-line">
          <span className="section-label text-[11px]">Notion</span>
          {plan.isPending ? <span className="text-[14px] text-muted">Checking…</span> : plan.error ? <span className="text-[14px] text-danger">{plan.error.message}</span> : (
            <>
              <span className="text-[14px]">
                {dates ? <><b className="text-accent">{dates}</b> Adj date{dates === 1 ? '' : 's'} on <b>{p.changes.length}</b> item{p.changes.length === 1 ? '' : 's'} differ from Notion.</> : 'Notion is up to date.'}
              </span>
              <span className="text-[13px] text-muted">{MODE_TEXT[p.mode] || MODE_TEXT.dry} Only Adj dates are written — never Plan or Actual.</span>
              {p.changes.length > 0 && (
                <ul className="m-0 p-0 list-none flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {p.changes.map(c => (
                    <li key={c.id} className="flex justify-between gap-3 text-[13px]">
                      <span className="truncate">{c.title}{!projectId && <span className="text-muted"> · {titleOf(c.projectId)}</span>}</span>
                      <span className="font-mono text-muted whitespace-nowrap">{c.count}{c.snapped ? ` · ${c.snapped} issued` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Button onClick={() => write()} disabled={!p.changes.length || apply.isPending}>{apply.isPending ? 'Writing…' : 'Write to Notion'}</Button>
              {p.blocked.length > 0 && (
                <div className="flex flex-col gap-1 pt-2">
                  <span className="text-[13px] text-danger">{p.blocked.length} item{p.blocked.length === 1 ? '' : 's'} not written — order check:</span>
                  {p.blocked.map(b => <span key={b.id} className="text-[13px] text-text-2">{b.title}: {b.violations[0]?.text}</span>)}
                </div>
              )}
            </>
          )}
        </section>

        {project ? (
          <section className="px-5 py-4 flex flex-col gap-1">
            <span className="section-label text-[11px] mb-1">Periods (working days)</span>
            <span className="text-[12px] text-muted mb-2">Blank = default. Item exceptions and acceleration are set on the item in Notion.</span>
            {Object.keys(PERIOD_DEFAULTS).map(k => {
              const key = PROJECT_PERIOD_KEYS[k];
              return <NumberRow key={k} label={PERIOD_LABELS[k]} value={k in periods ? periods[k] : sched[key]} placeholder={String(PERIOD_DEFAULTS[k])} onChange={v => setPeriods(s => ({ ...s, [k]: v }))} />;
            })}
            <span className="section-label text-[11px] mt-4 mb-1">Squeeze minimums</span>
            <span className="text-[12px] text-muted mb-2">The shortest our side (DT, then QA) can be squeezed to. Never below 1 day; client periods are never squeezed.</span>
            {Object.keys(PERIOD_MINIMUMS).map(k => {
              const key = MIN_PROJECT_KEYS[k];
              return <NumberRow key={k} label={MIN_LABELS[k]} value={k in mins ? mins[k] : sched[key]} placeholder={String(PERIOD_MINIMUMS[k])} onChange={v => setMins(s => ({ ...s, [k]: v }))} />;
            })}
            <div className={cx('sticky bottom-0 bg-bar pt-3 pb-4 flex gap-2', !dirty && 'hidden')}>
              <Button onClick={save} disabled={saveProject.isPending}>{saveProject.isPending ? 'Saving…' : 'Save periods'}</Button>
              <Button variant="secondary" onClick={() => { setPeriods({}); setMins({}); }}>Discard</Button>
            </div>
          </section>
        ) : (
          <p className="px-5 py-4 m-0 text-[14px] text-muted">Pick a project to edit its periods and minimums.</p>
        )}
      </aside>
    </div>
  );
}
