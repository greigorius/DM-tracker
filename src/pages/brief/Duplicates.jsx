// Possible duplicate actions: the same action raised twice, worded differently
// by meeting transcriptions. Each pair is shown side by side (stacked on a
// phone). "Keep this" keeps one and deletes the other — its wording and source
// go into the kept action's Response Log first. "Not a duplicate" hides the
// pair for good.
import { useMemo } from 'react';
import { Card, Badge, Button, useToast } from '../../components/ui/index.js';
import { useDismissedDuplicates, useDismissDuplicate, useMergeDuplicate } from '../../hooks/hub.js';
import { findDuplicatePairs } from '../../../hub-core/duplicates.js';
import { fmtDay, bicTone } from './shared.jsx';

export function useDuplicatePairs(d) {
  const { data } = useDismissedDuplicates();
  const dismissed = data?.dismissed;
  return useMemo(() => findDuplicatePairs(d.actions || [], { items: d.items_, dismissed }), [d.actions, d.items_, dismissed]);
}

const SHARED = { item: 'Same item', project: 'Same project', any: 'Close wording' };

function Side({ row, other, d, onKeep, busy }) {
  const meta = [row.source, row.from, row.received && `received ${fmtDay(row.received)}`].filter(Boolean).join(' · ');
  return (
    <div className="flex-1 min-w-0 flex flex-col gap-2 p-3 bg-ground/40 border border-line">
      <p className="m-0 text-[14px] text-text break-words">{row.title}</p>
      <p className="m-0 font-mono text-[11px] text-muted break-words">{d.itemName(row.itemIds) || 'No item'}{meta ? ` · ${meta}` : ''}</p>
      <div className="flex flex-wrap items-center gap-2">
        {row.bic ? <Badge tone={bicTone(row.bic)}>{row.bic}</Badge> : <Badge tone="danger">Unfiled</Badge>}
        {row.due && <Badge tone={row.due < d.today ? 'danger' : 'muted'}>{fmtDay(row.due)}</Badge>}
        {row.log && <Badge>has log</Badge>}
        <a href={row.url} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-muted hover:text-accent">Notion ↗</a>
      </div>
      <Button className="mt-auto w-full" disabled={busy} onClick={() => onKeep(row, other)}>Keep this</Button>
    </div>
  );
}

export function Duplicates({ d }) {
  const pairs = useDuplicatePairs(d);
  const merge = useMergeDuplicate();
  const dismiss = useDismissDuplicate();
  const toast = useToast();

  const onKeep = (keep, drop) => merge.mutate({ keep: keep.id, drop: drop.id }, {
    onSuccess: () => toast.show(`Kept “${keep.title}”. The other is in Notion's trash for 30 days; its wording is in the Response Log.`),
    onError: e => toast.show(`Not merged: ${e.message}`, { tone: 'danger' }),
  });
  const onDismiss = p => dismiss.mutate({ key: p.key }, {
    onSuccess: () => toast.show('Marked as not a duplicate'),
    onError: e => toast.show(`Not saved: ${e.message}`, { tone: 'danger' }),
  });

  if (!pairs.length) {
    return <Card><p className="m-0 p-6 text-center text-[14px] text-muted">No possible duplicates among the open actions.</p></Card>;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 font-mono text-[12px] text-muted max-w-[100ch]">
        Open actions that look like the same thing worded differently. Keep one: the other is deleted (Notion Trash, 30 days)
        after its wording, source, items and any missing due date are copied onto the one you keep.
      </p>
      {pairs.map(p => (
        <Card key={p.key} className="p-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{Math.round(p.score * 100)}% match</Badge>
            <Badge>{SHARED[p.shared]}</Badge>
            <button type="button" onClick={() => onDismiss(p)}
              className="ml-auto min-h-11 px-3 bg-transparent border border-line-strong font-mono text-[12px] text-muted hover:text-text-2 cursor-pointer">
              Not a duplicate
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Side row={p.a} other={p.b} d={d} onKeep={onKeep} busy={merge.isPending} />
            <Side row={p.b} other={p.a} d={d} onKeep={onKeep} busy={merge.isPending} />
          </div>
        </Card>
      ))}
    </div>
  );
}
