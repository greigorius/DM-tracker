// Hub-wide navigation row, shown under the header on every page.
import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useBootstrap } from '../../hooks/hub.js';
import { preloadRoute } from '../../routes.jsx';
import { cx } from './primitives.jsx';

export const NAV = [
  { to: '/', label: 'Cockpit', end: true },
  { to: '/brief', label: 'Brief' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/trackers/item-schedule', label: 'Items' },
  { to: '/trackers/rfis', label: 'RFIs' },
  { to: '/trackers/variations', label: 'Variations' },
  { to: '/trackers/finishes-schedule', label: 'Finishes' },
  { to: '/drawings', label: 'Drawings' },
  { to: '/timeline', label: 'Timeline' },
  { to: '/triage', label: 'Triage' },
];

const linkCls = active => cx(
  'min-h-11 px-3 inline-flex items-center gap-1 border-b-2 -mb-px font-mono text-[12px] uppercase tracking-[0.1em] no-underline whitespace-nowrap',
  active ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text-2',
);

function ProjectsMenu() {
  const { data } = useBootstrap();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const projects = data?.lookups?.projects || [];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => preloadRoute('/project/:projectId')}
        className={cx(linkCls(pathname.startsWith('/project')), 'bg-transparent border-x-0 border-t-0 cursor-pointer')}
      >
        Projects <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <ul className="fixed sm:absolute z-40 left-4 right-4 sm:left-auto sm:right-0 mt-px sm:w-80 max-h-[60vh] overflow-y-auto m-0 p-1 list-none bg-surface border border-line-strong">
          {projects.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">No active projects</li>}
          {projects.map(p => (
            <li key={p.id}>
              <NavLink to={`/project/${p.id}`} onClick={() => setOpen(false)} className="min-h-11 px-3 flex flex-col justify-center no-underline text-text hover:bg-surface-hi">
                <span className="text-[14px] truncate">{p.name}</span>
                {p.client && <span className="font-mono text-[11px] text-muted truncate">{p.client}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HubNav() {
  return (
    <nav aria-label="Hub" className="border-t border-line">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 flex items-stretch overflow-x-auto sm:overflow-visible">
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => linkCls(isActive)} onMouseEnter={() => preloadRoute(n.to)} onFocus={() => preloadRoute(n.to)}>
            {n.label}
          </NavLink>
        ))}
        <ProjectsMenu />
      </div>
    </nav>
  );
}
