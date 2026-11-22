// Reconcile Excel (spec §10.4): read an edited Actions export, show every
// change row by row (old → new), flag rows changed in the Hub since the export,
// and apply the ticked ones. New rows with no Hub ID become new actions.
import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Card, Badge, SkeletonRows, cx, useToast } from '../../components/ui/index.js';
import { useUpdateRecord, useCreateAction } from '../../hooks/hub.js';
import { readActions } from './excel.js';

const BTN = 'min-h-11 px-3 inline-flex items-center gap-2 border border-line-strong bg-transparent text-text-2 hover:bg-surface-hi font-mono text-[12px] uppercase tracking-[0.08em] cursor-pointer disabled:opacity-40';

export function ReconcilePanel({ file, rows, snaps, bics, onClose }) {
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const [pick, setPick] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const up = { actions: useUpdateRecord('actions'), todo: useUpdateRecord('todo') };
  const create = useCreateAction();
  const toast = useToast();

  useEffect(() => {
    let live = true;
    readActions(file, { rows, suppliers: snaps.suppliers.filter(s => !s.archived), tasks: snaps.tasks, projects: snaps.projects, bics })
      .then(r => {
        if (!live) return;
        setRes(r);
        // Tick everything except rows that changed in the Hub since the export
        setPick(new Set([...r.changes.map((c, i) => (c.conflict ? null : `c${i}`)), ...r.creates.map((_, i) => `n${i}`)].filter(Boolean)));
      })
      .catch(e => live && setErr(e.message));
    return () => { live = false; };
    // Read once per file; later Hub changes don't re-read the sheet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const toggle = k => setPick(p => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const apply = async () => {
    setBusy(true);
    let ok = 0, fail = 0;
    for (const [i, c] of res.changes.entries()) {
      if (!pick.has(`c${i}`)) continue;
      try { await up[c.rec.db].mutateAsync({ id: c.rec.id, set: c.set, ...(c.chase && { chase: c.chase }) }); ok++; } catch { fail++; }
    }
    for (const [i, n] of res.creates.entries()) {
      if (!pick.has(`n${i}`)) continue;
      try { await create.mutateAsync(n.body); ok++; } catch { fail++; }
    }
    setBusy(false);
    setDone({ ok, fail });
    toast.show(fail ? `${ok} applied, ${fail} refused by Notion` : `${ok} change${ok === 1 ? '' : 's'} applied from Excel`, { tone: fail ? 'danger' : 'ok', ms: 8000 });
  };

  const n = res ? res.changes.length + res.creates.length : 0;
  const conflicts = res ? res.changes.filter(c => c.conflict).length : 0;
  return (
    <Card className="p-4 flex flex-col gap-3 border-accent">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-[17px] font-semibold">Reconcile Excel</h2>
          <span className="font-mono text-[12px] text-muted">{file.name}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 inline-flex items-center justify-center bg-transparent border border-line-strong text-muted cursor-pointer"><X size={16} aria-hidden="true" /></button>
      </div>

      {err ? <p className="m-0 text-danger text-[14px]">Couldn’t read the file: {err}</p> : !res ? <SkeletonRows rows={4} /> : done ? (
        <p className="m-0 text-[14px]">{done.ok} change{done.ok === 1 ? '' : 's'} applied{done.fail ? `, ${done.fail} refused by Notion (they’re unchanged in the Hub)` : ''}. <button type="button" className={BTN} onClick={onClose}>Done</button></p>
      ) : (
        <>
          <p className="m-0 text-[14px] text-text-2">
            {n ? `${res.changes.length} row${res.changes.length === 1 ? '' : 's'} changed, ${res.creates.length} new.` : 'No changes found in this file.'}
            {conflicts > 0 && <span className="text-accent"> {conflicts} changed in the Hub since the export: check them before ticking (left unticked).</span>}
          </p>
          {res.problems.length > 0 && (
            <ul className="m-0 pl-0 list-none flex flex-col gap-1 text-[13px] text-accent">
              {res.problems.map(p => <li key={p} className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />{p}</li>)}
            </ul>
          )}
          {n > 0 && (
            <ul className="m-0 p-0 list-none flex flex-col border border-line max-h-[50vh] overflow-y-auto">
              {res.changes.map((c, i) => (
                <li key={`c${i}`} className={cx('flex gap-3 px-3 py-2 border-b border-line last:border-b-0', c.conflict && 'bg-surface-hi')}>
                  <input type="checkbox" aria-label="Apply" checked={pick.has(`c${i}`)} onChange={() => toggle(`c${i}`)} className="mt-1 w-5 h-5 shrink-0 accent-[var(--color-accent)]" />
                  <span className="flex flex-col gap-1 min-w-0">
                    <span className="text-[14px] font-medium truncate">{c.rec.title} <span className="font-mono text-[11px] text-muted">{c.where} · {c.rec.ref}{c.rec.itemName ? ` · ${c.rec.itemName}` : ''}</span></span>
                    {c.conflict && <Badge tone="accent" className="w-max">Changed in the Hub since the export</Badge>}
                    <span className="flex flex-col gap-0.5 font-mono text-[12px]">
                      {c.fields.map(x => (
                        <span key={x.key}><span className="text-muted">{x.label}:</span> {x.key === 'note' ? <span className="text-ok">+ “{x.to}”</span> : <><span className="text-text-2 line-through decoration-muted">{x.from}</span> → <span className="text-text">{x.to}</span></>}</span>
                      ))}
                    </span>
                  </span>
                </li>
              ))}
              {res.creates.map((c, i) => (
                <li key={`n${i}`} className="flex gap-3 px-3 py-2 border-b border-line last:border-b-0">
                  <input type="checkbox" aria-label="Create" checked={pick.has(`n${i}`)} onChange={() => toggle(`n${i}`)} className="mt-1 w-5 h-5 shrink-0 accent-[var(--color-accent)]" />
                  <span className="flex flex-col gap-1 min-w-0">
                    <span className="text-[14px] font-medium"><Badge tone="ok">New</Badge> {c.title} <span className="font-mono text-[11px] text-muted">{c.where}{c.itemName ? ` · ${c.itemName}` : ' · no item'}</span></span>
                    {c.notes.map(x => <span key={x} className="font-mono text-[12px] text-accent">{x}</span>)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={cx(BTN, 'border-accent text-accent')} disabled={!pick.size || busy} onClick={apply}>{busy ? 'Applying…' : `Apply ${pick.size} ticked`}</button>
            <button type="button" className={BTN} onClick={onClose}>Cancel</button>
          </div>
        </>
      )}
    </Card>
  );
}
