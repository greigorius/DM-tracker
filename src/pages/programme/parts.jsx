// Building blocks shared by the Programme tabs.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { Badge, cx } from '../../components/ui/index.js';
import { fmt, splitSummary } from '../../../hub-core/programme/view.js';
import { REISSUE_REASONS } from '../../../hub-core/programme/schedule.js';

import { KIND, TONE_TEXT, TONE_BORDER } from './kinds.js';

// Dropdown menu: a button plus a panel; closes on outside click / Escape.
export function Menu({ label, icon, children, primary, align = 'right', width = 300, badge }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(o => !o)}
        className={cx('min-h-11 px-3.5 inline-flex items-center gap-2 border font-mono text-[12px] uppercase tracking-[0.08em] cursor-pointer',
          primary ? 'bg-accent text-ground border-accent hover:brightness-110' : 'bg-transparent text-text border-line-strong hover:bg-surface-hi')}
      >
        {icon}{label}
        {badge ? <span className="px-1 border border-accent/60 text-accent text-[10px] leading-4">{badge}</span> : null}
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div
          className={cx('fixed sm:absolute z-40 left-4 right-4 sm:left-auto mt-1 bg-surface border border-line-strong shadow-[0_12px_32px_rgba(0,0,0,0.5)] flex flex-col max-h-[70vh] overflow-y-auto', align === 'right' ? 'sm:right-0' : 'sm:left-0')}
          style={{ width: undefined, minWidth: Math.min(width, 360) }}
        >
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

export function MenuLabel({ children, first }) {
  return <span className={cx('px-4 pt-3 pb-1.5 section-label text-[11px]', !first && 'border-t border-line mt-1')}>{children}</span>;
}

export function MenuItem({ children, desc, onClick, active, count, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cx('min-h-11 px-4 py-2 flex items-center justify-between gap-3 border-0 text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
        active ? 'bg-surface-hi text-accent' : 'bg-transparent text-text hover:bg-surface-hi')}
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-[14px]">{children}</span>
        {desc && <span className="text-[12px] text-muted">{desc}</span>}
      </span>
      {count != null && <span className="font-mono text-[12px] text-muted">{count}</span>}
    </button>
  );
}

export function Flags({ flags, max = 4 }) {
  if (!flags.length) return <span className="font-mono text-[12px] text-ok">On track</span>;
  const shown = flags.slice(0, max);
  return (
    <span className="flex flex-wrap gap-1.5">
      {shown.map(f => <Badge key={f.text} tone={f.tone} className="py-1">{f.text}</Badge>)}
      {flags.length > max && <Badge className="py-1">+{flags.length - max}</Badge>}
    </span>
  );
}

export function DateText({ d, withYear, className }) {
  if (!d?.date) return <span className={cx('font-mono text-muted', className)}>—</span>;
  const k = KIND[d.kind] || KIND.fc;
  return (
    <span className={cx('inline-flex items-center gap-1.5 font-mono whitespace-nowrap', k.text, d.kind === 'fc' && 'italic', className)} title={k.label}>
      <span className={cx('w-1.5 h-1.5 shrink-0', k.dot)} aria-hidden="true" />
      {fmt(d.date, withYear)}
    </span>
  );
}

export function Legend() {
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[11px] text-muted">
      {['act', 'prog', 'manual', 'fc'].map(k => (
        <span key={k} className="inline-flex items-center gap-1.5"><span className={cx('w-2 h-2', KIND[k].dot)} aria-hidden="true" />{KIND[k].label}</span>
      ))}
    </span>
  );
}

// One stage: headline submission date + its DT dates and approval
export function StageCard({ s, today }) {
  if (s.na) {
    return (
      <div className="flex flex-col gap-2 p-4 border-t-[3px] border-t-line bg-surface">
        <span className="font-semibold">{s.label}</span>
        <span className="font-mono text-[13px] text-muted">N/A · no client approval</span>
      </div>
    );
  }
  const lines = [
    ['DT Start', s.start],
    ['DT Delivery', s.del],
    [s.key === 'c01' ? 'Sign-off' : 'Approval', s.appr],
  ];
  return (
    <div className={cx('flex flex-col gap-2 p-4 border-t-[3px] bg-surface min-w-0', TONE_BORDER[s.tone])}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{s.label}</span>
        <span className={cx('text-[12px] text-right', TONE_TEXT[s.tone])}>{s.tag}</span>
      </span>
      <DateText d={s.sub} withYear className="text-[20px]" />
      <span className="text-[12px] text-muted -mt-1">
        Submission{s.sub.kind === 'prog' ? ' · client programme' : s.sub.kind === 'act' ? ' · issued' : ''}{s.passed ? ' · passed' : ''}
        {s.issued ? ` · ${s.issued.done} of ${s.issued.n} drawings issued` : ''}
      </span>
      {lines.map(([k, d]) => (
        <span key={k} className="flex justify-between gap-3 text-[13px] text-text-2">{k}<DateText d={d} /></span>
      ))}
      {s.squeezed && <span className="text-[12px] text-accent">DT + QA squeezed to {s.squeezed.used} of {s.squeezed.std} days</span>}
      {s.conflict > 0 && <span className="text-[12px] text-danger">{s.conflict} day{s.conflict === 1 ? '' : 's'} short at the minimum periods{s.achievable ? ` · earliest ${fmt(s.achievable)}` : ''}</span>}
      {s.closedSub && <span className="text-[12px] text-muted">Previous issue {fmt(s.closedSub, true)}</span>}
      {s.past?.key === 'del' && <span className="text-[12px] text-accent">DT delivery {fmt(s.past.date)} overdue ({s.past.days}d)</span>}
      {s.past?.key === 'start' && <span className="text-[12px] text-danger">DT start {fmt(s.past.date)} has already passed — no time left to draw before the programme date</span>}
      {s.passed && s.sub.date < today && <span className="sr-only">Submission date has passed</span>}
    </div>
  );
}

export function ProductionCard({ prod }) {
  const late = prod.float != null && prod.float < 0;
  return (
    <div className={cx('flex flex-col gap-2 p-4 border-t-[3px] bg-surface', late ? 'border-t-danger' : 'border-t-line-strong')}>
      <span className="flex items-baseline justify-between gap-2"><span className="font-semibold">Production</span><span className="text-[12px] text-muted">Forecast</span></span>
      <span className="font-mono text-[20px] text-text">{prod.date ? fmt(prod.date, true) : '—'}</span>
      <span className="text-[12px] text-muted -mt-1">Sign-off + production pack</span>
      {prod.target && (
        <span className="flex justify-between gap-3 text-[13px] text-text-2">Target<span className="font-mono">{fmt(prod.target, true)}</span></span>
      )}
      {prod.float != null && (
        <span className="flex justify-between gap-3 text-[13px] text-text-2">Float<span className={cx('font-mono', late ? 'text-danger' : 'text-ok')}>{prod.float > 0 ? '+' : ''}{prod.float}d</span></span>
      )}
    </div>
  );
}

export function StageGrid({ item, today }) {
  return (
    <div className="grid gap-px bg-line border border-line" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
      {item.stages.map(s => <StageCard key={s.key} s={s} today={today} />)}
      <ProductionCard prod={item.prod} />
    </div>
  );
}

const POS_TONE = step => (step >= 5 ? 'border-l-ok' : step >= 3 ? 'border-l-info' : step >= 1 ? 'border-l-accent' : 'border-l-danger');

export function DrawingGrid({ item }) {
  const bd = item.drawings;
  if (!bd.dwgs.length) return <p className="m-0 text-[13px] text-muted">No drawings on the Master Drawing Schedule for this item.</p>;
  return (
    <div className="flex flex-col gap-2">
      <span className="flex justify-between gap-2 section-label text-[11px]">
        Drawings<span className="normal-case tracking-normal">{bd.split ? splitSummary(bd) : `${bd.counted} counted`}</span>
      </span>
      <ul className="m-0 p-0 list-none grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {bd.dwgs.map(d => (
          <li key={d.id} className={cx('flex flex-col gap-1 px-3 py-2 bg-surface border border-line border-l-[3px]', d.counted ? POS_TONE(d.pos.step) : 'border-l-line-strong opacity-70')}>
            <a href={d.url} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-text no-underline hover:underline">{d.no || '—'}{d.rev ? <span className="text-muted"> · {d.rev}</span> : null}</a>
            <span className="text-[12px] text-muted">{d.pos.label}{d.pos.status ? ` · ${d.pos.status}` : ''}{d.pos.date ? ` · ${fmt(d.pos.date)}` : ''}</span>
            {!d.counted && <span className="text-[11px] text-muted">{d.assigned || 'Not a drawing'} · not counted</span>}
            {d.behind && <span className="text-[11px] text-danger">Behind · holds the stage open</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Item inputs the Programme page can set. Everything else is set in Notion.
export function ItemInputs({ item, onSave, saving }) {
  const startStages = item.stages.filter(s => !s.na && (s.canStart || s.startManual));
  const [drafts, setDrafts] = useState({});
  const setDraft = (k, v) => setDrafts(d => ({ ...d, [k]: v }));
  const ctl = 'min-h-11 px-3 bg-ground border border-line-strong text-text text-[14px] outline-none focus:border-accent';
  return (
    <div className="flex flex-col gap-3 p-4 bg-surface border border-line">
      <span className="section-label text-[11px]">Item inputs</span>
      {startStages.map(s => {
        const val = drafts[s.key] ?? (s.startManual ? s.start.date : '');
        return (
          <div key={s.key} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-text-2">{s.label} DT Start {s.startManual ? '(set by hand)' : `(automatic: ${fmt(s.start.date)})`}</span>
              <input type="date" value={val || ''} onChange={e => setDraft(s.key, e.target.value)} className={ctl} />
            </label>
            <button type="button" disabled={saving || !val || val === (s.startManual ? s.start.date : '')} onClick={() => onSave({ manualDtStart: { [s.key]: val } })}
              className={cx(ctl, 'cursor-pointer font-mono text-[12px] uppercase tracking-[0.08em] text-accent border-accent/60 disabled:opacity-40 disabled:cursor-not-allowed')}>Set</button>
            {s.startManual && (
              <button type="button" disabled={saving} onClick={() => { setDraft(s.key, ''); onSave({ manualDtStart: { [s.key]: null } }); }}
                className={cx(ctl, 'cursor-pointer font-mono text-[12px] uppercase tracking-[0.08em] text-text-2')}>Automatic</button>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-text-2">Reissue reason</span>
          <select value={item.reissueReason || ''} disabled={saving} onChange={e => onSave({ reissueReason: e.target.value || null })} className={cx(ctl, 'cursor-pointer')}>
            <option value="">None</option>
            {REISSUE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="min-h-11 inline-flex items-center gap-2.5 text-[14px] cursor-pointer">
          <input type="checkbox" checked={item.prog} disabled={saving} onChange={e => onSave({ programmeDriven: e.target.checked })} className="w-[18px] h-[18px] accent-[var(--color-accent)]" />
          Programme-driven (Adj submission dates are client programme dates)
        </label>
      </div>
      <span className="text-[12px] text-muted">
        Plan and Actual dates are never written. Submission actuals come from the Master Drawing Schedule; other inputs are set in
        {' '}<a href={item.url} target="_blank" rel="noreferrer" className="text-accent inline-flex items-center gap-1">Notion <ExternalLink size={11} aria-hidden="true" /></a>.
      </span>
    </div>
  );
}
