// Table: one row per item — each stage's submission, production, flags.
// Expand a row for DT dates, approvals and drawings.
import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge, Card, cx } from '../../components/ui/index.js';
import { TableGroup, useGroups } from '../../components/ui/table.jsx';
import { fmt } from '../../../hub-core/programme/view.js';
import { DateText, Flags, StageGrid, DrawingGrid } from './parts.jsx';
import { TONE_TEXT } from './kinds.js';

function StageCell({ s }) {
  if (s.na) return <span className="font-mono text-[12px] text-muted">N/A</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <DateText d={s.sub} className="text-[13px]" />
      <span className={cx('text-[12px]', TONE_TEXT[s.tone])}>{s.tag}</span>
      {s.issued && <span className="font-mono text-[11px] text-muted">{s.issued.done}/{s.issued.n} issued</span>}
    </span>
  );
}

function ItemTable({ items, today, onOpenReview }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = id => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const th = 'px-3 py-2.5 text-left font-normal section-label text-[11px] whitespace-nowrap';
  const stageHeads = items[0]?.stages.map(s => (s.key === 'c01' ? 'A4.5 / PRD' : s.label)) || ['S4', 'S5', 'A4.5 / PRD'];
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[14px]" style={{ minWidth: 980 }}>
        <thead>
          <tr className="bg-bar border-b border-line">
            <th scope="col" className={th} style={{ width: 300 }}>Item</th>
            {stageHeads.map(h => <th key={h} scope="col" className={th}>{h}</th>)}
            <th scope="col" className={th}>Production</th>
            <th scope="col" className={th} style={{ width: 300 }}>Needs attention</th>
          </tr>
        </thead>
        <tbody>
          {items.map(i => {
            const isOpen = open.has(i.id);
            return (
              <Fragment key={i.id}>
                <tr className={cx('border-b border-line align-top', isOpen ? 'bg-surface-hi' : 'hover:bg-surface-hi')}>
                  <td className="p-0">
                    <button type="button" onClick={() => toggle(i.id)} aria-expanded={isOpen}
                      className="w-full min-h-12 px-3 py-2.5 flex items-start gap-2 bg-transparent border-0 text-left text-text cursor-pointer">
                      {isOpen ? <ChevronDown size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" /> : <ChevronRight size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />}
                      <span className="flex flex-col gap-1 min-w-0">
                        <span className="text-[14px] font-medium leading-snug">{i.name}</span>
                        <span className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted">
                          {i.dwgFirst && <span>{i.dwgFirst}{i.dwgCount > 1 ? ` +${i.dwgCount - 1}` : ''}</span>}
                          {i.prog && <Badge tone="accent">Programme</Badge>}
                          {i.drawings.split && <Badge tone="info">Split</Badge>}
                          {i.nca && <Badge>PRD</Badge>}
                        </span>
                      </span>
                    </button>
                  </td>
                  {i.stages.map(s => <td key={s.key} className="px-3 py-2.5"><StageCell s={s} /></td>)}
                  <td className="px-3 py-2.5">
                    <span className="flex flex-col gap-0.5">
                      <span className="font-mono text-[13px] text-text">{fmt(i.prod.date)}</span>
                      {i.prod.float != null && <span className={cx('font-mono text-[11px]', i.prod.float < 0 ? 'text-danger' : 'text-muted')}>float {i.prod.float > 0 ? '+' : ''}{i.prod.float}d</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5"><Flags flags={i.flags} max={3} /></td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-line bg-bar">
                    <td colSpan={6} className="px-4 sm:px-10 py-4">
                      <div className="flex flex-col gap-4">
                        <StageGrid item={i} today={today} />
                        <DrawingGrid item={i} />
                        <span className="flex flex-wrap gap-4 text-[13px]">
                          <button type="button" onClick={() => onOpenReview(i.id)} className="min-h-11 bg-transparent border-0 p-0 text-accent cursor-pointer">Review and edit inputs →</button>
                          <a href={i.url} target="_blank" rel="noreferrer" className="min-h-11 inline-flex items-center text-text-2">Open in Notion →</a>
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TableTab({ items, today, grouped, projectTitle, onOpenReview }) {
  const { groups, isOpen, toggle } = useGroups(items, grouped ? i => i.projectId : null, k => projectTitle(k));
  if (!items.length) return <Card className="p-4 text-[14px] text-muted">No items match these filters.</Card>;
  if (!grouped) return <Card><ItemTable items={items} today={today} onOpenReview={onOpenReview} /></Card>;
  return groups.map(g => (
    <TableGroup key={g.key} title={g.label} count={g.rows.length} open={isOpen(g.key)} onToggle={() => toggle(g.key)}>
      <ItemTable items={g.rows} today={today} onOpenReview={onOpenReview} />
    </TableGroup>
  ));
}
