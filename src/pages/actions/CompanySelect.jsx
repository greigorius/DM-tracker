// Company drop-down (Suppliers DB) with "+ New company…": type a name, Enter,
// and it's created in Notion and selected. An existing name (any case) is reused.
import { useState } from 'react';
import { useCreateSupplier } from '../../hooks/hub.js';
import { useToast, cx } from '../../components/ui/index.js';

const NEW = '__new__';

export function CompanySelect({ value, onChange, suppliers, className, label = 'Company' }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const create = useCreateSupplier();
  const toast = useToast();
  const add = () => {
    const n = name.trim();
    if (!n) return;
    create.mutate({ name: n }, {
      onSuccess: ({ row, existed }) => {
        toast.show(existed ? `${row.title} already exists, so it's been selected` : `${row.title} added to Suppliers`);
        setAdding(false); setName('');
        onChange(row.id);
      },
      onError: e => toast.show(`Company not added: ${e.message}`, { tone: 'danger' }),
    });
  };
  if (adding) {
    return (
      <span className="flex items-center gap-1 min-w-0">
        <input autoFocus type="text" aria-label="New company name" placeholder="Company name" value={name} disabled={create.isPending}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { setAdding(false); setName(''); } }}
          className={cx('min-w-0 flex-1 min-h-9 px-2 bg-ground border border-accent text-text text-[13px] outline-none', className)} />
        <button type="button" onClick={add} disabled={!name.trim() || create.isPending} className="shrink-0 min-h-9 px-2 border border-accent text-accent bg-transparent font-mono text-[11px] cursor-pointer disabled:opacity-40">{create.isPending ? '…' : 'Add'}</button>
        <button type="button" onClick={() => { setAdding(false); setName(''); }} aria-label="Cancel" className="shrink-0 min-h-9 px-2 border border-line-strong text-muted bg-transparent font-mono text-[11px] cursor-pointer">✕</button>
      </span>
    );
  }
  return (
    <select aria-label={label} value={value || ''} onChange={e => (e.target.value === NEW ? setAdding(true) : onChange(e.target.value || null))}
      className={cx('w-full min-h-9 px-2 bg-surface border border-line-strong font-mono text-[12px] cursor-pointer outline-none focus:border-accent', value ? 'text-text' : 'text-muted', className)}>
      <option value="">No company</option>
      {suppliers.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      <option value={NEW}>+ New company…</option>
    </select>
  );
}
