// Workspace search (workspace spec §5): one box over projects, items, drawing
// numbers, people and companies. Picking a result opens the right lens.
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useSnapshots } from '../../hooks/hub.js';
import { cx } from '../../components/ui/index.js';

const DBS = ['projects', 'tasks', 'drawings', 'team', 'suppliers'];
const KIND_LABEL = { project: 'Project', item: 'Item', drawing: 'Drawing', person: 'Team', company: 'Company' };

export function GlobalSearch() {
  const { data: s } = useSnapshots(DBS);
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const box = useRef(null);

  const index = useMemo(() => {
    const items = new Map(s.tasks.map(t => [t.id, t]));
    const live = new Set(s.projects.filter(p => /^in progress$/i.test(p.status || '')).map(p => p.id));
    const out = [];
    for (const p of s.projects) if (!p.archived) out.push({ kind: 'project', id: p.id, label: p.title, sub: p.status, rank: live.has(p.id) ? 0 : 3, to: `/workspace/projects?id=${p.id}` });
    for (const t of s.tasks) if (!t.archived && t.projectId) out.push({ kind: 'item', id: t.id, label: t.title, sub: s.projects.find(p => p.id === t.projectId)?.title, rank: live.has(t.projectId) ? 1 : 4, to: `/workspace/items?item=${t.id}${live.has(t.projectId) ? '' : `&project=${t.projectId}&closed=1`}` });
    for (const x of s.drawings) {
      const it = items.get(x.itemIds?.[0]);
      if (!x.archived && x.title && it) out.push({ kind: 'drawing', id: x.id, label: x.title, sub: `${it.title}${x.name ? ` · ${x.name}` : ''}`, rank: 2, to: `/workspace/items?item=${it.id}` });
    }
    for (const p of s.team) if (!p.archived) out.push({ kind: 'person', id: p.id, label: p.title, sub: p.role, rank: 1, to: `/workspace/team?id=${p.id}` });
    for (const c of s.suppliers) if (!c.archived) out.push({ kind: 'company', id: c.id, label: c.title, sub: (c.category || []).join(', ').toLowerCase(), rank: 1, to: `/workspace/suppliers?id=${c.id}` });
    return out.filter(x => x.label);
  }, [s]);

  const needle = q.trim().toLowerCase();
  const hits = useMemo(() => {
    if (needle.length < 2) return [];
    return index.filter(x => x.label.toLowerCase().includes(needle) || (x.sub || '').toLowerCase().includes(needle))
      .sort((a, b) => (a.label.toLowerCase().startsWith(needle) ? 0 : 1) - (b.label.toLowerCase().startsWith(needle) ? 0 : 1) || a.rank - b.rank || a.label.localeCompare(b.label, undefined, { numeric: true }))
      .slice(0, 12);
  }, [index, needle]);

  const go = h => { setOpen(false); setQ(''); nav(h.to); };
  const onKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt(i => Math.min(hits.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && hits[at]) go(hits[at]);
    else if (e.key === 'Escape') { setOpen(false); e.currentTarget.blur(); }
  };

  return (
    <div ref={box} className="relative w-full sm:w-[380px]" onBlur={e => { if (!box.current?.contains(e.relatedTarget)) setOpen(false); }}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
      <input type="search" value={q} onChange={e => { setQ(e.target.value); setOpen(true); setAt(0); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
        placeholder="Find project, item, drawing no., person, company" aria-label="Search the Hub"
        className="w-full min-h-11 pl-9 pr-3 bg-ground border border-line-strong text-text text-[14px] outline-none focus:border-accent" />
      {open && hits.length > 0 && (
        <ul role="listbox" className="absolute z-30 left-0 right-0 mt-1 m-0 p-0 list-none bg-surface border border-line-strong shadow-lg max-h-[420px] overflow-y-auto">
          {hits.map((h, i) => (
            <li key={`${h.kind}:${h.id}`} role="option" aria-selected={i === at}>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => go(h)} onMouseEnter={() => setAt(i)}
                className={cx('w-full px-3 py-2 flex items-baseline gap-3 text-left border-0 cursor-pointer', i === at ? 'bg-surface-hi' : 'bg-transparent')}>
                <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{KIND_LABEL[h.kind]}</span>
                <span className="flex flex-col min-w-0">
                  <span className="text-[14px] text-text truncate">{h.label}</span>
                  {h.sub && <span className="font-mono text-[11px] text-muted truncate">{h.sub}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
