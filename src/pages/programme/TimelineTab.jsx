// Timeline: each stage as its client review (submission → approval / sign-off)
// on a shared date axis, production as a diamond, today as a line. Pick a row
// to see its dates beside the chart.
import { useMemo } from 'react';
import { Card, cx } from '../../components/ui/index.js';
import { fmt } from '../../../hub-core/programme/view.js';
import { StageCard, ProductionCard, Flags } from './parts.jsx';

const DAY = 86_400_000;
const t = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STAGE_COLOUR = { s4: '#6AA8F0', s5: '#B08CF0', c01: '#F2A33A' };

function bars(item) {
  const out = [];
  for (const s of item.stages) {
    if (s.na || !s.sub.date) continue;
    if (s.closedSub) out.push({ key: `${s.key}-closed`, stage: s.key, label: `${s.label} prev`, from: s.closedSub, to: s.closedSub, actual: true, faded: true });
    const end = s.appr.date && s.appr.date >= s.sub.date ? s.appr.date : s.sub.date;
    out.push({
      key: s.key, stage: s.key, label: s.label, from: s.sub.date, to: end,
      actual: s.sub.kind === 'act' && s.appr.kind === 'act', subActual: s.sub.kind === 'act', prog: s.sub.kind === 'prog',
      tone: s.tone,
    });
  }
  return out;
}

export function TimelineTab({ items, today, selected, onSelect, projectName }) {
  const rows = useMemo(() => items.map(i => ({ item: i, bars: bars(i) })), [items]);
  // Axis: from a month before today (or the earliest open stage) to the last production date
  const [lo, hi] = useMemo(() => {
    let a = t(today) - 45 * DAY, b = t(today) + 60 * DAY;
    for (const r of rows) {
      for (const bar of r.bars) a = Math.min(a, t(bar.from) - 7 * DAY);
      for (const bar of r.bars) b = Math.max(b, t(bar.to) + 7 * DAY);
      if (r.item.prod.date) b = Math.max(b, t(r.item.prod.date) + 10 * DAY);
    }
    return [Math.max(a, t(today) - 365 * DAY), Math.min(b, t(today) + 730 * DAY)];
  }, [rows, today]);
  const pct = iso => Math.min(100, Math.max(0, ((t(iso) - lo) / (hi - lo)) * 100));
  const months = useMemo(() => {
    const out = []; const d = new Date(lo); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
    while (d.getTime() < hi) { out.push({ at: ((d.getTime() - lo) / (hi - lo)) * 100, label: `${MONTHS[d.getUTCMonth()]}${d.getUTCMonth() === 0 ? ` ${String(d.getUTCFullYear()).slice(2)}` : ''}` }); d.setUTCMonth(d.getUTCMonth() + 1); }
    return out;
  }, [lo, hi]);
  const sel = items.find(i => i.id === selected) || null;
  const todayAt = pct(today);

  if (!items.length) return <Card className="p-4 text-[14px] text-muted">No items match these filters.</Card>;

  return (
    <div className="flex flex-col xl:flex-row items-start gap-6">
      <Card className="flex-1 min-w-0 w-full">
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 px-4 py-3 border-b border-line font-mono text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="w-4 h-2.5 bg-text-2" aria-hidden="true" />Issued → approved</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-4 h-2.5 border border-text-2 bg-[repeating-linear-gradient(135deg,transparent_0_3px,#B7BAC055_3px_5px)]" aria-hidden="true" />Forecast review</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-0.5 h-3 bg-accent" aria-hidden="true" />Client programme date</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rotate-45 bg-text" aria-hidden="true" />Production</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-0.5 h-3 bg-danger" aria-hidden="true" />Today</span>
          {Object.entries({ S4: 's4', S5: 's5', 'A4.5 / PRD': 'c01' }).map(([l, k]) => (
            <span key={k} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5" style={{ background: STAGE_COLOUR[k] }} aria-hidden="true" />{l}</span>
          ))}
        </div>
        <div className="overflow-x-auto">
          <div style={{ minWidth: 860 }}>
            <div className="flex border-b border-line bg-bar">
              <span className="w-[240px] shrink-0 px-3 py-2 section-label text-[11px]">Item</span>
              <div className="relative flex-1 h-8">
                {months.map(m => <span key={m.at} className="absolute top-2 font-mono text-[11px] text-muted -translate-x-1/2" style={{ left: `${m.at}%` }}>{m.label}</span>)}
              </div>
            </div>
            {rows.map(({ item, bars: bs }) => {
              const on = sel?.id === item.id;
              return (
                <button key={item.id} type="button" onClick={() => onSelect(item.id)} aria-pressed={on}
                  className={cx('w-full flex items-stretch border-0 border-b border-line text-left cursor-pointer text-text p-0', on ? 'bg-surface-hi' : 'bg-transparent hover:bg-surface-hi')}>
                  <span className="w-[240px] shrink-0 px-3 py-2.5 flex flex-col gap-0.5 min-w-0">
                    <span className="text-[13px] font-medium truncate">{item.name}</span>
                    <span className={cx('text-[11px] truncate', item.group === 'ok' || item.group === 'idle' ? 'text-muted' : item.group === 'check' ? 'text-accent' : 'text-danger')}>
                      {!projectName ? `${item.projectName} · ` : ''}{item.reason}
                    </span>
                  </span>
                  <span className="relative flex-1 min-h-[52px]">
                    {months.map(m => <span key={m.at} className="absolute top-0 bottom-0 w-px bg-line/60" style={{ left: `${m.at}%` }} aria-hidden="true" />)}
                    <span className="absolute top-0 bottom-0 w-0.5 bg-danger z-10" style={{ left: `${todayAt}%` }} aria-hidden="true" />
                    {bs.map(b => {
                      const c = STAGE_COLOUR[b.stage];
                      const left = pct(b.from), width = Math.max(0.6, pct(b.to) - left);
                      return (
                        <span key={b.key} title={`${b.label}: ${fmt(b.from, true)}${b.to !== b.from ? ` → ${fmt(b.to, true)}` : ''}`}
                          className={cx('absolute top-1/2 -translate-y-1/2 h-4 flex items-center overflow-hidden font-mono text-[10px] text-ground px-1 whitespace-nowrap', b.faded && 'opacity-35')}
                          style={{ left: `${left}%`, width: `${width}%`, background: b.actual ? c : `repeating-linear-gradient(135deg, ${c}55 0 4px, transparent 4px 7px)`, border: `1px solid ${c}`, color: b.actual ? '#141413' : c }}>
                          {width > 4 ? b.label : ''}
                        </span>
                      );
                    })}
                    {bs.filter(b => b.prog).map(b => <span key={`${b.key}-pin`} className="absolute top-2 bottom-2 w-0.5 bg-accent z-10" style={{ left: `${pct(b.from)}%` }} aria-hidden="true" />)}
                    {item.prod.date && t(item.prod.date) <= hi && (
                      <span className="absolute top-1/2 w-2.5 h-2.5 bg-text rotate-45 -translate-x-1/2 -translate-y-1/2 z-10" style={{ left: `${pct(item.prod.date)}%` }} title={`Production ${fmt(item.prod.date, true)}`} aria-hidden="true" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {sel && (
        <aside aria-label="Selected item" className="w-full xl:w-[360px] xl:shrink-0 flex flex-col gap-3">
          <span className="section-label text-[11px]">{[sel.status, sel.prog && 'programme-driven'].filter(Boolean).join(' · ')}</span>
          <h2 className="m-0 text-[20px] font-semibold leading-tight">{sel.name}</h2>
          <Flags flags={sel.flags} max={6} />
          <span className="text-[14px] text-text-2">{sel.todo}</span>
          <div className="flex flex-col gap-px bg-line border border-line">
            {sel.stages.map(s => <StageCard key={s.key} s={s} today={today} />)}
            <ProductionCard prod={sel.prod} />
          </div>
        </aside>
      )}
    </div>
  );
}
