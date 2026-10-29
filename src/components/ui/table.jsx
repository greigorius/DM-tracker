// Tables and toolbar controls shared by every tracker page.
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown, Download, Search } from 'lucide-react';
import { Badge, Card, cx } from './primitives.jsx';

// ── Toolbar controls (compact, 44px targets) ────────────────────────────────
const ctl = 'min-h-11 px-3 bg-ground border border-line-strong text-text-2 text-[13px] outline-none focus:border-accent';

export function ToolbarSelect({ label, value, onChange, options, className }) {
  return (
    <label className={cx('inline-flex items-center', className)}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className={cx(ctl, 'cursor-pointer max-w-[260px]')}>
        {options.map(o => (typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </label>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Search</span>
      <Search size={14} className="absolute left-3 text-muted pointer-events-none" aria-hidden="true" />
      <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cx(ctl, 'pl-8 w-[220px]')} />
    </label>
  );
}

export function ToolbarButton({ children, className, ...rest }) {
  return (
    <button type="button" className={cx(ctl, 'inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.08em] cursor-pointer hover:bg-surface-hi', className)} {...rest}>
      {children}
    </button>
  );
}

// ── Status pill: maps a status to a token tone ───────────────────────────────
export function StatusPill({ status, tone }) {
  if (!status) return <span className="text-muted">—</span>;
  return <Badge tone={tone || 'muted'} className="py-1 whitespace-nowrap">{status}</Badge>;
}

// ── CSV export ───────────────────────────────────────────────────────────────
export function exportCsv(filename, columns, rows) {
  const cell = v => {
    const s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(c => cell(c.label)).join(','), ...rows.map(r => columns.map(c => cell(c.csv ? c.csv(r) : r[c.key])).join(','))];
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportButton({ filename, columns, rows }) {
  return <ToolbarButton onClick={() => exportCsv(filename, columns, rows)}><Download size={14} aria-hidden="true" /> Export</ToolbarButton>;
}

// ── Data table ───────────────────────────────────────────────────────────────
function useSorted(rows, columns, initial) {
  const [sort, setSort] = useState(initial || null); // { key, dir }
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find(c => c.key === sort.key);
    const val = col?.sortValue || (r => r[sort.key]);
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
      return sort.dir === 'asc' ? c : -c;
    });
  }, [rows, columns, sort]);
  const toggle = key => setSort(s => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));
  return [sorted, sort, toggle];
}

export function DataTable({ columns, rows, initialSort, empty = 'Nothing to show.', rowTone }) {
  const [sorted, sort, toggle] = useSorted(rows, columns, initialSort);
  if (!rows.length) return <p className="m-0 px-4 py-4 text-[14px] text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-line">
            {columns.map(c => {
              const active = sort?.key === c.key;
              return (
                <th key={c.key} scope="col" className={cx('text-left font-normal p-0', c.className)} style={{ width: c.width }} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  <button type="button" onClick={() => toggle(c.key)} className="w-full min-h-11 px-4 inline-flex items-center gap-1 bg-transparent border-0 cursor-pointer section-label text-[11px] hover:text-text-2 whitespace-nowrap">
                    {c.label}
                    {active && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={r.id} className={cx('border-b border-line last:border-b-0 hover:bg-surface-hi', rowTone?.(r) === 'danger' && 'text-danger')}>
              {columns.map(c => (
                <td key={c.key} className={cx('px-4 py-2.5 align-top', c.cellClassName)}>
                  {c.render ? c.render(r) : (r[c.key] ?? <span className="text-muted">—</span>)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Collapsible group of rows (one Card per group) ──────────────────────────
export function TableGroup({ title, meta, count, open, onToggle, children }) {
  return (
    <Card>
      <h2 className="m-0">
        <button type="button" onClick={onToggle} aria-expanded={open} className="w-full min-h-12 px-4 flex items-center gap-3 bg-transparent border-0 cursor-pointer text-left text-text hover:bg-surface-hi">
          {open ? <ChevronDown size={16} className="text-muted" aria-hidden="true" /> : <ChevronRight size={16} className="text-muted" aria-hidden="true" />}
          <span className="text-[15px] font-semibold truncate">{title}</span>
          <span className="font-mono text-[12px] text-muted">{count}</span>
          <span className="ml-auto flex gap-2">{meta}</span>
        </button>
      </h2>
      {open && <div className="border-t border-line">{children}</div>}
    </Card>
  );
}

// Group rows by a key, keeping open/closed state per group.
export function useGroups(rows, groupBy, labelOf) {
  const [closed, setClosed] = useState({});
  const groups = useMemo(() => {
    if (!groupBy) return [{ key: 'all', label: null, rows }];
    const map = new Map();
    for (const r of rows) {
      const k = groupBy(r) ?? '—';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return [...map.entries()]
      .map(([key, rs]) => ({ key, label: labelOf(key), rows: rs }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true }));
  }, [rows, groupBy, labelOf]);
  return {
    groups,
    isOpen: k => !closed[k],
    toggle: k => setClosed(c => ({ ...c, [k]: !c[k] })),
    expandAll: () => setClosed({}),
    collapseAll: () => setClosed(Object.fromEntries(groups.map(g => [g.key, true]))),
  };
}
