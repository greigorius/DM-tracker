// Small form controls shared by the Triage tabs (rows, bulk bars, fix cards).
import { useState } from 'react';
import { Badge, cx } from '../../components/ui/index.js';

export const ctl = 'min-h-11 px-3 bg-ground border border-line-strong text-text text-[14px] outline-none focus:border-accent';
export function Sel({ value, onChange, options, blank = '—', label }) {
  return (
    <select aria-label={label} value={value ?? ''} onChange={e => onChange(e.target.value)} className={cx(ctl, 'cursor-pointer max-w-[260px]')}>
      <option value="">{blank}</option>
      {options.map(o => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}
export const DateIn = ({ value, onChange, label }) => <input type="date" aria-label={label} value={value || ''} onChange={e => onChange(e.target.value)} className={ctl} />;
export const Mini = ({ children, ...p }) => <button type="button" className="min-h-11 px-3 border border-line-strong bg-transparent text-text-2 hover:bg-surface-hi font-mono text-[12px] cursor-pointer" {...p}>{children}</button>;

export function ItemPicker({ d, value, onChange }) {
  const current = d.items_.get(value?.[0]);
  const [proj, setProj] = useState(current?.projectId || '');
  const items = d.all.tasks.filter(i => i.projectId === proj && !i.archived).sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true }));
  return (
    <div className="flex flex-wrap gap-2">
      <Sel label="Project" value={proj} onChange={setProj} blank="Project…" options={d.projectOptions} />
      <Sel label="Item" value={value?.[0] || ''} onChange={v => onChange(v ? [v] : [])} blank={proj ? 'Item…' : 'Pick a project'} options={items.map(i => ({ value: i.id, label: i.title }))} />
      {!value?.length && <Badge tone="danger">No item linked</Badge>}
    </div>
  );
}


export const Check = ({ checked, onChange, label }) => (
  <label className="inline-flex items-center gap-2 min-h-11 text-[14px] text-text-2 cursor-pointer">
    <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} className="w-5 h-5 accent-accent" /> {label}
  </label>
);
