// One data-quality check: header with count, rows each with an inline fix, and
// batch editing — tick rows (or Select all) and apply one value to all of them.
// Used by Triage → Data fixes and Triage → Team.
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, Badge, Button, useToast, cx } from '../../components/ui/index.js';
import { useUpdateRecord } from '../../hooks/hub.js';
import { ctl, Sel, DateIn, Mini, ItemPicker } from './controls.jsx';

const SHOW = 100;
const empty = fix => (fix === 'item' ? [] : '');
const has = v => (Array.isArray(v) ? v.length > 0 : v !== '' && v != null);
const toValue = (fix, v) => (fix === 'number' ? Number(v) : v);
const keyOf = r => r._key || r.id;

function FixControl({ check, d, value, onChange }) {
  switch (check.fix) {
    case 'date': return <><Mini onClick={() => onChange(d.today)}>Today</Mini><DateIn label="Date" value={value} onChange={onChange} /></>;
    case 'select': return <Sel label={check.title} value={value} onChange={onChange} options={check.options || []} blank="Choose…" />;
    case 'dt': return <Sel label="DT" value={value} onChange={onChange} blank="Choose DT…" options={d.dts.map(x => ({ value: x.id, label: x.name }))} />;
    case 'item': return <ItemPicker d={d} value={value} onChange={onChange} />;
    case 'email': return <input type="email" aria-label="Email" placeholder="name@example.com" value={value} onChange={e => onChange(e.target.value)} className={cx(ctl, 'w-[260px]')} />;
    case 'number': return <input type="number" min="0" step="0.5" inputMode="decimal" aria-label="Est. hours" placeholder="hrs" value={value} onChange={e => onChange(e.target.value)} className={cx(ctl, 'w-[100px]')} />;
    default: return null;
  }
}

function FixRow({ check, row, d, selected, onSelect }) {
  const update = useUpdateRecord(check.db);
  const toast = useToast();
  const [value, setValue] = useState(empty(check.fix));
  const field = row._field || check.field;
  const save = () => update.mutate({ id: row.id, set: { [field]: toValue(check.fix, value) } }, {
    onSuccess: () => toast.show('Fixed in Notion'),
    onError: e => toast.show(`Not saved: ${e.message}`, { tone: 'danger', ms: 8000 }),
  });
  const fixable = check.fix && check.fix !== 'none';
  return (
    <li className={cx('border-t border-line px-4 py-3 flex flex-wrap items-center gap-3', selected && 'bg-surface-hi')}>
      {fixable && (
        <input type="checkbox" aria-label={`Select ${check.label(row) || 'row'}`} checked={selected} onChange={e => onSelect(e.target.checked)} className="w-5 h-5 accent-accent cursor-pointer" />
      )}
      <div className="flex-1 min-w-[220px]">
        <a href={row.url} target="_blank" rel="noreferrer" className="text-[14px] text-text no-underline hover:underline">{check.label(row) || 'Untitled'}</a>
        {check.sub && <div className="font-mono text-[11px] text-muted">{check.sub(row)}</div>}
      </div>
      {fixable && (
        <div className="flex flex-wrap items-center gap-2">
          <FixControl check={check} d={d} value={value} onChange={setValue} />
          <Button onClick={save} disabled={!has(value) || update.isPending}>{update.isPending ? 'Saving…' : 'Save'}</Button>
        </div>
      )}
    </li>
  );
}

function BatchBar({ check, d, rows, onDone }) {
  const update = useUpdateRecord(check.db);
  const toast = useToast();
  const [value, setValue] = useState(empty(check.fix));
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    setBusy(true);
    let ok = 0;
    for (const r of rows) {
      try { await update.mutateAsync({ id: r.id, set: { [r._field || check.field]: toValue(check.fix, value) } }); ok++; } catch { /* counted below */ }
    }
    setBusy(false);
    toast.show(`${ok} of ${rows.length} rows saved`, { tone: ok === rows.length ? 'ok' : 'danger' });
    if (ok === rows.length) { setValue(empty(check.fix)); onDone(); }
  };
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 p-3 bg-surface-hi border-y border-accent">
      <span className="font-semibold mr-1">{rows.length} selected</span>
      <FixControl check={check} d={d} value={value} onChange={setValue} />
      <span className="ml-auto flex gap-2">
        <Button onClick={apply} disabled={!has(value) || busy}>{busy ? 'Saving…' : 'Apply to selected'}</Button>
        <Button variant="secondary" onClick={onDone} disabled={busy}>Clear</Button>
      </span>
    </div>
  );
}

/** check: { id, title, why, rows, label(row), sub?(row), db, field, fix, options?, tag, tagClass, tone } */
export function FixCard({ check: c, d }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const shown = c.rows.slice(0, SHOW);
  // Rows fixed elsewhere drop out of the check, so prune the selection to what's still listed.
  const selectedRows = shown.filter(r => sel.has(keyOf(r)));
  const fixable = c.fix && c.fix !== 'none';
  const allSel = shown.length > 0 && selectedRows.length === shown.length;
  const toggleRow = (r, on) => setSel(s => { const n = new Set(s); if (on) n.add(keyOf(r)); else n.delete(keyOf(r)); return n; });

  return (
    <Card>
      <h3 className="m-0">
        <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="w-full text-left bg-transparent border-0 cursor-pointer px-4 py-3 flex items-start gap-3 text-text hover:bg-surface-hi">
          {open ? <ChevronDown size={16} className="mt-1 text-muted" /> : <ChevronRight size={16} className="mt-1 text-muted" />}
          <span className="flex-1 min-w-0">
            <span className={cx('font-mono text-[11px] uppercase tracking-[0.08em] mr-2', c.tagClass || 'text-accent')}>{c.tag}</span>
            <span className="text-[14px] font-semibold">{c.title}</span>
            <span className="block mt-1 text-[13px] font-normal text-muted">{c.why}</span>
          </span>
          <Badge tone={c.rows.length ? c.tone || 'accent' : 'ok'} className="py-1">{c.rows.length || 'Clear'}</Badge>
        </button>
      </h3>
      {open && c.rows.length > 0 && (
        <>
          {fixable && selectedRows.length > 0 && <BatchBar check={c} d={d} rows={selectedRows} onDone={() => setSel(new Set())} />}
          {fixable && (
            <label className="border-t border-line px-4 py-1 flex items-center gap-3 min-h-11 text-[13px] text-text-2 cursor-pointer">
              <input type="checkbox" checked={allSel} onChange={e => setSel(e.target.checked ? new Set(shown.map(keyOf)) : new Set())} className="w-5 h-5 accent-accent" />
              Select all {shown.length}{c.rows.length > SHOW ? ' shown' : ''}
            </label>
          )}
          <ul className="m-0 p-0 list-none">
            {shown.map(r => <FixRow key={keyOf(r)} check={c} row={r} d={d} selected={sel.has(keyOf(r))} onSelect={on => toggleRow(r, on)} />)}
            {c.rows.length > SHOW && <li className="border-t border-line px-4 py-3 font-mono text-[12px] text-muted">Showing the first {SHOW} of {c.rows.length}. Fixed rows drop off as you go.</li>}
          </ul>
        </>
      )}
    </Card>
  );
}
