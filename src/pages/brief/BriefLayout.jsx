// Brief tab: Daily Brief (default) and Triage as sub-tabs, sharing one
// project filter. Replaces the old Tasks page and the two standalone artifacts.
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { PageShell, cx } from '../../components/ui/index.js';
import { ToolbarSelect } from '../../components/ui/table.jsx';
import { useBriefData, useStored } from './shared.jsx';

const SUBTABS = [
  { to: '/brief', label: 'Daily Brief', end: true },
  { to: '/brief/triage', label: 'Triage' },
];

export default function BriefLayout() {
  const [project, setProject] = useStored('hub.brief.project', '');
  const data = useBriefData(project);
  const { pathname } = useLocation();
  const onTriage = pathname.startsWith('/brief/triage');

  return (
    <PageShell
      title="Brief"
      subtitle={onTriage ? 'Act on what needs chasing' : 'What’s next, upcoming and past due'}
    >
      <div className="flex flex-wrap items-end gap-3 border-b border-line">
        <nav aria-label="Brief" className="flex">
          {SUBTABS.map(t => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => cx(
                'min-h-11 px-4 inline-flex items-center border-b-2 -mb-px font-mono text-[12px] uppercase tracking-[0.1em] no-underline',
                isActive ? 'border-accent text-text bg-surface-hi' : 'border-transparent text-muted hover:text-text-2',
              )}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto pb-2">
          <ToolbarSelect label="Project" value={project} onChange={setProject} options={[{ value: '', label: 'All projects' }, ...data.projectOptions]} />
        </div>
      </div>
      <Outlet context={{ data, project }} />
    </PageShell>
  );
}
