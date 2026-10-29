// Programme strip: one row per item, DT and review spans plus submission,
// production and install markers. Dates come from the Tasks snapshot; the
// Scheduling Tool is where they are set.
import { useMemo } from 'react';
import { addDays } from '../../../hub-core/derive.js';
import { cx } from './primitives.jsx';

const pick = (act, plan) => act || plan || null;
const dayIndex = (from, d) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5);

export function spansFor(i) {
  const x = i.dt || {}, d = i.dates || {};
  const s4s = pick(x.s4StartAct, x.s4Start), s4d = pick(x.s4DelAct, x.s4Del);
  const s5s = pick(x.s5StartAct, x.s5Start), s5d = pick(x.s5DelAct, x.s5Del);
  const cs = pick(x.cStartAct, x.cStart), cd = pick(x.cDelAct, x.cDel);
  return {
    spans: [
      { from: s4s, to: s4d, label: 'S4 drawing', cls: 'bg-info', done: !!x.s4DelAct },
      { from: d.sub1, to: s5s, label: 'S4 review', cls: 'bg-accent/35' },
      { from: s5s, to: s5d, label: 'S5 drawing', cls: 'bg-info', done: !!x.s5DelAct },
      { from: d.sub2, to: cs, label: 'S5 review', cls: 'bg-accent/35' },
      { from: cs, to: cd, label: 'C01 drawing', cls: 'bg-info', done: !!x.cDelAct },
    ].filter(s => s.from && s.to && s.to >= s.from),
    marks: [
      { at: d.sub1, label: 'S4 submission', cls: 'bg-accent' },
      { at: d.sub2, label: 'S5 submission', cls: 'bg-accent' },
      { at: d.constrSub, label: 'C01 submission', cls: 'bg-accent' },
      { at: d.production, label: 'Production', cls: 'bg-ok' },
      { at: d.install, label: 'Install', cls: 'bg-text-2' },
    ].filter(m => m.at),
  };
}

export function Gantt({ items, today, weeks = 12, back = 2, labelOf = i => i.title, subOf }) {
  const from = useMemo(() => {
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
    return addDays(today, -(dow - 1) - back * 7); // Monday, `back` weeks ago
  }, [today, back]);
  const days = weeks * 7;
  const pct = d => `${Math.max(0, Math.min(100, (dayIndex(from, d) / days) * 100))}%`;
  const inRange = d => d && dayIndex(from, d) >= 0 && dayIndex(from, d) <= days;
  const todayPct = pct(today);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="flex border-b border-line">
          <div className="w-64 shrink-0 px-4 py-2 section-label text-[11px]">Item</div>
          <div className="relative flex-1 h-9">
            {Array.from({ length: weeks }, (_, w) => {
              const d = addDays(from, w * 7);
              return (
                <div key={w} className="absolute top-0 bottom-0 border-l border-line pl-1.5 pt-2 font-mono text-[11px] text-muted" style={{ left: `${(w / weeks) * 100}%` }}>
                  {new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </div>
              );
            })}
          </div>
        </div>
        {items.length === 0 && <p className="m-0 px-4 py-4 text-[14px] text-muted">No items with programme dates in this window.</p>}
        {items.map(i => {
          const { spans, marks } = spansFor(i);
          return (
            <div key={i.id} className="flex border-b border-line last:border-b-0 hover:bg-surface-hi">
              <div className="w-64 shrink-0 px-4 py-2 min-w-0">
                <a href={i.url} target="_blank" rel="noreferrer" className="block text-[13px] text-text no-underline hover:underline truncate" title={labelOf(i)}>{labelOf(i)}</a>
                {subOf && <div className="font-mono text-[11px] text-muted truncate">{subOf(i)}</div>}
              </div>
              <div className="relative flex-1 min-h-11">
                {Array.from({ length: weeks }, (_, w) => <div key={w} className="absolute top-0 bottom-0 border-l border-line/60" style={{ left: `${(w / weeks) * 100}%` }} />)}
                {spans.filter(s => s.to >= from && dayIndex(from, s.from) <= days).map(s => (
                  <div key={s.label} title={`${s.label}: ${s.from} → ${s.to}`}
                    className={cx('absolute top-1/2 -translate-y-1/2 h-3', s.cls, s.done && 'opacity-50')}
                    style={{ left: pct(s.from), width: `calc(${pct(addDays(s.to, 1))} - ${pct(s.from)})` }} />
                ))}
                {marks.filter(m => inRange(m.at)).map(m => (
                  <div key={m.label} title={`${m.label}: ${m.at}`} className={cx('absolute top-1/2 w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45', m.cls)} style={{ left: pct(m.at) }} />
                ))}
                <div className="absolute top-0 bottom-0 w-px bg-danger" style={{ left: todayPct }} aria-hidden="true" />
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-4 px-4 py-3 border-t border-line font-mono text-[11px] text-muted">
          <span className="inline-flex items-center gap-2"><span className="w-4 h-2.5 bg-info" />DT drawing</span>
          <span className="inline-flex items-center gap-2"><span className="w-4 h-2.5 bg-accent/35" />Client review</span>
          <span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rotate-45 bg-accent" />Submission</span>
          <span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rotate-45 bg-ok" />Production</span>
          <span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rotate-45 bg-text-2" />Install</span>
          <span className="inline-flex items-center gap-2"><span className="w-px h-3 bg-danger" />Today</span>
          <span>Faded = delivered</span>
        </div>
      </div>
    </div>
  );
}

// Does this item have anything inside the window?
export function inWindow(i, today, weeks = 12, back = 2) {
  const from = addDays(today, -back * 7 - 7), to = addDays(today, weeks * 7);
  const { spans, marks } = spansFor(i);
  return spans.some(s => s.to >= from && s.from <= to) || marks.some(m => m.at >= from && m.at <= to);
}
