// Workspace frame (workspace spec §5): one page, four lenses over the same
// list-and-peek layout, plus the Hub search. Each lens renders inside it.
import { NavLink } from 'react-router-dom';
import { PageShell, cx } from '../../components/ui/index.js';
import { GlobalSearch } from './GlobalSearch.jsx';
import { MeetingBar } from '../meetings/MeetingBar.jsx';

export const LENSES = [
  { id: 'projects', label: 'Projects' },
  { id: 'items', label: 'Items' },
  { id: 'team', label: 'Team' },
  { id: 'suppliers', label: 'Suppliers' },
];

export function WorkspaceShell({ lens, subtitle, toolbar, children }) {
  return (
    <PageShell
      title="Workspace"
      subtitle={subtitle}
      toolbar={<>
        <nav aria-label="Lens" className="flex border-b border-line">
          {LENSES.map(l => (
            <NavLink key={l.id} to={`/workspace/${l.id}`} aria-current={lens === l.id ? 'page' : undefined}
              className={cx('min-h-11 px-4 inline-flex items-center border-b-2 -mb-px font-mono text-[12px] uppercase tracking-[0.1em] no-underline',
                lens === l.id ? 'bg-surface-hi text-text border-accent' : 'text-muted border-transparent hover:text-text-2')}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <GlobalSearch />
        <span className="basis-full h-0" />
        {toolbar}
      </>}
    >
      <MeetingBar />
      {children}
    </PageShell>
  );
}

export function LensSoon({ lens, what }) {
  return (
    <WorkspaceShell lens={lens} subtitle="Coming next">
      <div className="p-8 border border-dashed border-line-strong text-[14px] text-text-2 max-w-[70ch]">{what}</div>
    </WorkspaceShell>
  );
}
