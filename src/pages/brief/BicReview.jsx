// Triage → Ball in court: items whose Notion BIC differs from the derived one
// (hub-core/item-bic.js). Review, then apply by hand; the sync applies them on
// its own only when ITEM_BIC_AUTO=on.
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Card, Badge, Button, SkeletonRows, useToast, cx } from '../../components/ui/index.js';
import { ToolbarSelect, SearchBox } from '../../components/ui/table.jsx';
import { api } from '../../lib/api.js';
import { keys, useBootstrap, useUpdateRecord } from '../../hooks/hub.js';
import { Sel } from './controls.jsx';
import { bicTone } from './shared.jsx';

const SOURCE = { variation: 'Variation', rfi: 'Stop-work RFI', action: 'Blocking action', drawings: 'Drawings', status: 'Item status', default: 'No drawings yet' };
const MODE_TEXT = {
  dry: 'Review mode: nothing is written automatically. Tick rows to apply the derived value or override and lock it, or set ITEM_BIC_AUTO=on in .env to let every sync apply them (up to 40 per run).',
  on: 'Automatic: every sync writes these changes to Notion (up to 40 per run). Tick Lock Status on an item to keep a hand-set BIC.',
  off: 'Off: the rule is only shown here. Set ITEM_BIC_AUTO=dry or on in .env.',
};
// Batch bar for ticked rows: apply the derived value, or override by hand and
// tick Lock Status so the rule leaves it alone from then on.
function BatchBar({ rows, busy, onApplyDerived, onDone }) {
  const { data: boot } = useBootstrap();
  const update = useUpdateRecord('tasks');
  const toast = useToast();
  const [bic, setBic] = useState('');
  const [saving, setSaving] = useState(false);
  const options = [...new Set([...(boot?.lookups?.bic || []), 'Mixed'])];
  const lock = async set => {
    setSaving(true);
    let ok = 0;
    for (const r of rows) { try { await update.mutateAsync({ id: r.id, set }); ok++; } catch { /* counted below */ } }
    setSaving(false);
    toast.show(`${ok} of ${rows.length} items locked${set.bic ? ` at ${set.bic}` : ''}`, { tone: ok === rows.length ? 'ok' : 'danger' });
    onDone();
  };
  const off = busy || saving;
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 p-3 bg-surface-hi border border-accent">
      <span className="font-semibold mr-1">{rows.length} selected</span>
      <Button disabled={off} onClick={onApplyDerived}>{busy ? 'Applying…' : 'Apply derived'}</Button>
      <span className="font-mono text-[12px] text-muted">or override:</span>
      <Sel label="Ball in court" value={bic} onChange={setBic} blank="Ball in court…" options={options} />
      <Button variant="secondary" disabled={off || !bic} onClick={() => lock({ bic, lockStatus: true })}>Set &amp; lock</Button>
      <Button variant="secondary" disabled={off} onClick={() => lock({ lockStatus: true })}>Lock as is</Button>
      <Button variant="secondary" className="ml-auto" disabled={off} onClick={onDone}>Clear</Button>
    </div>
  );
}

const Bic = ({ v }) => (v ? <Badge tone={v === 'Mixed' ? 'info' : bicTone(v)} className="py-1">{v}</Badge> : <span className="font-mono text-[12px] text-muted">blank</span>);

export function BicReview({ project }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isPending, error } = useQuery({ queryKey: ['item-bic-plan'], queryFn: () => api('/api/item-bic/plan') });
  const [source, setSource] = useState('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.changes || []).filter(r =>
      (!project || r.projectId === project)
      && (source === 'all' || r.source === source)
      && (!needle || [r.title, r.project, r.from, r.to, r.reason].filter(Boolean).join(' ').toLowerCase().includes(needle)));
  }, [data, project, source, q]);
  const counts = useMemo(() => {
    const m = {};
    for (const r of (data?.changes || []).filter(r => !project || r.projectId === project)) m[r.source] = (m[r.source] || 0) + 1;
    return m;
  }, [data, project]);

  const apply = async ids => {
    setBusy(true);
    let done = 0, failed = 0, left = ids.length;
    try {
      // The server stops after ~8 s, so loop until everything asked for is written.
      while (left > 0) {
        const r = await api('/api/item-bic/apply', { method: 'POST', body: { ids } });
        done += r.done.length; failed += r.failed.length;
        if (!r.done.length) break;
        const written = new Set(r.done.map(x => x.id));
        ids = ids.filter(id => !written.has(id) && !r.failed.some(f => f.id === id));
        left = ids.length;
      }
      toast.show(`Ball in court updated on ${done} item${done === 1 ? '' : 's'}${failed ? ` · ${failed} failed` : ''}`, failed ? { tone: 'danger' } : undefined);
    } catch (e) {
      toast.show(`Not applied: ${e.message}`, { tone: 'danger', ms: 8000 });
    } finally {
      setBusy(false);
      setSel(new Set());
      qc.invalidateQueries({ queryKey: ['item-bic-plan'] });
      qc.invalidateQueries({ queryKey: keys.snapshot('tasks') });
      qc.invalidateQueries({ queryKey: keys.bootstrap });
    }
  };

  if (isPending) return <Card className="p-4"><SkeletonRows rows={8} /></Card>;
  if (error) return <Card className="p-4 text-[14px] text-danger">Couldn’t work out the plan: {error.message}</Card>;

  const selRows = rows.filter(r => sel.has(r.id));
  const allSel = rows.length > 0 && selRows.length === rows.length;
  return (
    <div className="flex flex-col gap-3">
      <p className={cx('m-0 px-4 py-3 border border-line border-l-4 text-[13px]', data.mode === 'on' ? 'border-l-ok' : 'border-l-accent')}>{MODE_TEXT[data.mode] || MODE_TEXT.dry}</p>
      <p className="m-0 font-mono text-[12px] text-muted max-w-[110ch]">
        Rule, first match wins: Lock Status → leave · item closed → clear · open variation → its BIC · stop-work RFI → its BIC · blocking action → its BIC ·
        drawings → holder of each drawing’s latest submission (several holders = Mixed) · no drawings → DT if assigned, else DM.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} />
        <ToolbarSelect label="Why" value={source} onChange={setSource} options={[{ value: 'all', label: 'Every reason' }, ...Object.entries(counts).map(([k, n]) => ({ value: k, label: `${SOURCE[k] || k} · ${n}` }))]} />
        <span className="ml-auto font-mono text-[12px] text-muted">{rows.length} to change{data.locked.length ? ` · ${data.locked.length} locked` : ''}</span>
        <Button disabled={busy || rows.length === 0} onClick={() => apply(rows.map(r => r.id))}>{busy ? 'Applying…' : `Apply all ${rows.length}`}</Button>
      </div>
      {selRows.length > 0 && (
        <BatchBar rows={selRows} busy={busy} onApplyDerived={() => apply(selRows.map(r => r.id))}
          onDone={() => { setSel(new Set()); qc.invalidateQueries({ queryKey: ['item-bic-plan'] }); }} />
      )}
      {data.invalid.length > 0 && (
        <p className="m-0 px-4 py-3 border border-line text-[13px] text-accent">
          {data.invalid.length} item{data.invalid.length === 1 ? '' : 's'} would get a value that isn’t a Tasks BIC option ({[...new Set(data.invalid.map(r => r.to))].join(', ')}), so {data.invalid.length === 1 ? 'it’s' : 'they’re'} skipped. Add the option in Notion or fix the source row.
        </p>
      )}
      <Card>
        {rows.length === 0 ? <p className="m-0 p-6 text-center text-[14px] text-muted">Every item’s ball in court matches the rule.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-4 py-2 w-10"><input type="checkbox" aria-label="Select all" checked={allSel} onChange={e => setSel(e.target.checked ? new Set(rows.map(r => r.id)) : new Set())} className="w-5 h-5 accent-accent" /></th>
                  {['Item', 'Project', 'Status', 'Ball in court', 'Why'].map(h => <th key={h} className="px-4 py-2 section-label text-[11px] font-normal whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-line last:border-b-0 hover:bg-surface-hi">
                    <td className="px-4 py-2.5"><input type="checkbox" aria-label={`Select ${r.title}`} checked={sel.has(r.id)} onChange={e => setSel(s => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} className="w-5 h-5 accent-accent" /></td>
                    <td className="px-4 py-2.5 min-w-[240px]"><a href={r.url} target="_blank" rel="noreferrer" className="text-text no-underline hover:underline">{r.title || 'Untitled'}</a></td>
                    <td className="px-4 py-2.5 text-text-2">{r.project || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-text-2 whitespace-nowrap">{r.status || '—'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap"><span className="inline-flex items-center gap-2"><Bic v={r.from} /><ArrowRight size={13} className="text-muted" aria-hidden="true" /><Bic v={r.to} /></span></td>
                    <td className="px-4 py-2.5 text-[13px] text-muted">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
