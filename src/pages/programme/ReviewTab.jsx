// Review (landing tab): items grouped by what they need from you, with the
// selected item's dates, drawings and the inputs that can be set here.
import { useEffect, useMemo, useRef } from 'react';
import { ExternalLink } from 'lucide-react';
import { Card, cx, useToast } from '../../components/ui/index.js';
import { GROUPS, fmt } from '../../../hub-core/programme/view.js';
import { useUpdateProgrammeItem } from '../../hooks/programme.js';
import { StageGrid, DrawingGrid, ItemInputs, Flags } from './parts.jsx';
import { TONE_TEXT } from './kinds.js';

const BOX = {
  fix: 'bg-[#1F1513] border-danger/50', challenge: 'bg-[#1F1513] border-danger/50',
  check: 'bg-[#211A10] border-accent/50', ok: 'bg-surface border-line', idle: 'bg-surface border-line',
};
const BOX_LABEL = { fix: 'text-danger', challenge: 'text-danger', check: 'text-accent', ok: 'text-ok', idle: 'text-muted' };

export function ReviewTab({ items, today, selected, onSelect, projectName }) {
  const groups = useMemo(() => GROUPS.map(g => ({ ...g, items: items.filter(i => i.group === g.key) })).filter(g => g.items.length), [items]);
  const sel = items.find(i => i.id === selected) || groups[0]?.items[0] || null;
  const detailRef = useRef(null);
  const update = useUpdateProgrammeItem();
  const toast = useToast();

  // On a phone the detail sits under the list: bring it into view on pick
  const pick = id => {
    onSelect(id);
    if (window.matchMedia('(max-width: 1023px)').matches) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  useEffect(() => { if (!selected && sel) onSelect(sel.id, true); }, [selected, sel, onSelect]);

  const save = set => update.mutate({ id: sel.id, set }, {
    onSuccess: r => {
      const n = r?.sync?.done?.[0]?.count || 0;
      toast.show(n ? `Saved · ${n} Adj date${n === 1 ? '' : 's'} written to Notion` : r?.sync?.blocked?.some(b => b.id === sel.id) ? 'Saved · dates not written (order check)' : 'Saved');
    },
    onError: e => toast.show(`Could not save: ${e.message}`, { tone: 'danger' }),
  });

  if (!items.length) return <Card className="p-4 text-[14px] text-muted">No items match these filters.</Card>;

  return (
    <div className="flex flex-col lg:flex-row items-start gap-6">
      <nav aria-label="Items" className="w-full lg:w-[380px] lg:shrink-0 flex flex-col gap-5 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-1">
        {groups.map(g => (
          <section key={g.key} className="flex flex-col gap-2">
            <h2 className={cx('m-0 flex items-center justify-between font-mono text-[12px] font-medium uppercase tracking-[0.14em]', TONE_TEXT[g.tone])}>
              {g.title}<span className="text-muted">{g.items.length}</span>
            </h2>
            {g.hint && <span className="text-[13px] text-muted -mt-1">{g.hint}</span>}
            {g.items.map(i => {
              const on = sel?.id === i.id;
              return (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => pick(i.id)}
                  aria-pressed={on}
                  className={cx('flex flex-col gap-1.5 px-4 py-3 min-h-[72px] border text-left cursor-pointer text-text',
                    on ? 'bg-surface-hi border-accent' : 'bg-surface border-line hover:border-line-strong')}
                >
                  <span className="flex justify-between gap-3 w-full">
                    <span className="text-[15px] font-semibold leading-snug">{i.name}</span>
                    {i.next && <span className="font-mono text-[12px] text-text-2 whitespace-nowrap">{i.next.label} {fmt(i.next.date)}</span>}
                  </span>
                  {!projectName && <span className="font-mono text-[11px] text-muted">{i.projectName}</span>}
                  <span className={cx('text-[13px]', TONE_TEXT[g.tone === 'ok' ? 'muted' : g.tone])}>{i.reason}</span>
                </button>
              );
            })}
          </section>
        ))}
      </nav>

      {sel && (
        <section ref={detailRef} aria-label="Selected item" className="flex-1 min-w-0 w-full flex flex-col gap-5 scroll-mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className="section-label text-[11px]">
                {[sel.status, sel.prog && 'programme-driven', sel.dwgCount && `${sel.dwgCount} drawing${sel.dwgCount === 1 ? '' : 's'}`, sel.dwgFirst].filter(Boolean).join(' · ')}
              </span>
              <h2 className="m-0 text-[24px] font-semibold leading-tight">{sel.name}</h2>
              {!projectName && <span className="font-mono text-[12px] text-muted">{sel.projectName}</span>}
            </div>
            <a href={sel.url} target="_blank" rel="noreferrer" className="min-h-11 px-3 inline-flex items-center gap-2 border border-line-strong text-text-2 no-underline font-mono text-[12px] uppercase tracking-[0.08em] hover:bg-surface-hi">
              Open in Notion <ExternalLink size={13} aria-hidden="true" />
            </a>
          </div>

          <div className={cx('flex flex-col gap-3 px-5 py-4 border', BOX[sel.group])}>
            <span className={cx('section-label text-[11px]', BOX_LABEL[sel.group])}>{sel.group === 'ok' ? 'On track' : 'What to do'}</span>
            <span className="text-[16px] leading-relaxed">{sel.todo}</span>
            {sel.violations.length > 1 && (
              <ul className="m-0 pl-5 text-[13px] text-text-2">{sel.violations.slice(1).map(v => <li key={v.text}>{v.text}</li>)}</ul>
            )}
            {sel.flags.length > 0 && <Flags flags={sel.flags} max={8} />}
            {sel.holds.length > 0 && <span className="text-[13px] text-text-2">Holds: {sel.holds.join(' · ')}</span>}
          </div>

          <StageGrid item={sel} today={today} />
          <DrawingGrid item={sel} />
          {!sel.closed && <ItemInputs key={sel.id} item={sel} onSave={save} saving={update.isPending} />}
        </section>
      )}
    </div>
  );
}
