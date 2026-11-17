// Hub-wide navigation row, shown under the header on every page.
import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSnapshots } from '../../hooks/hub.js';
import { teamIssues, teamErrorCount } from '../../../hub-core/team.js';
import { preloadRoute } from '../../routes.jsx';
import { cx } from './primitives.jsx';

// Top level: where you act (Triage), dates (Programme), registers (Trackers)
// and reports. Sections with `tabs` show them as a second row.
export const NAV = [
  { to: '/', label: 'Cockpit', end: true },
  {
    to: '/triage', label: 'Triage', match: ['/triage', '/brief'],
    tabs: [{ to: '/triage', label: 'Triage' }, { to: '/brief', label: 'Brief' }],
  },
  { to: '/programme', label: 'Programme', match: ['/programme'] },
  {
    to: '/trackers/item-schedule', label: 'Trackers', match: ['/trackers'],
    tabs: [
      { to: '/trackers/item-schedule', label: 'Items' },
      { to: '/trackers/drawings', label: 'Drawings' },
      { to: '/trackers/tasks', label: 'Tasks' },
      { to: '/trackers/team', label: 'Team' },
      { to: '/trackers/finishes-schedule', label: 'Finishes' },
      { to: '/trackers/rfis', label: 'RFIs' },
      { to: '/trackers/variations', label: 'Variations' },
    ],
  },
  { to: '/reports', label: 'Reports', match: ['/reports'] },
];

const inSection = (n, pathname) => (n.end ? pathname === n.to : (n.match || [n.to]).some(p => pathname === p || pathname.startsWith(`${p}/`)));

const linkCls = active => cx(
  'min-h-11 px-2.5 sm:px-3 inline-flex items-center gap-1 border-b-2 -mb-px font-mono text-[12px] uppercase tracking-[0.1em] no-underline whitespace-nowrap',
  active ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text-2',
);


// Triage carries a count of Team errors (to-dos or DTs missing what the Team
// page and DT emails need). Warnings and info don't count.
function useTeamErrorCount() {
  const { data } = useSnapshots(['todo', 'team']);
  return teamErrorCount(teamIssues(data));
}

const subCls = active => cx(
  'min-h-11 px-3 inline-flex items-center border-b-2 -mb-px text-[14px] no-underline whitespace-nowrap',
  active ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text-2',
);

export function HubNav() {
  const teamErrors = useTeamErrorCount();
  const { pathname } = useLocation();
  const section = NAV.find(n => inSection(n, pathname));
  // On a phone the rows scroll sideways: keep the current tab in view
  const navRef = useRef(null);
  useEffect(() => {
    navRef.current?.querySelectorAll('[aria-current="page"]').forEach(el => el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }));
  }, [pathname]);
  return (
    <nav ref={navRef} aria-label="Hub" className="border-t border-line">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 flex items-stretch overflow-x-auto sm:overflow-visible">
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} className={() => linkCls(n === section)} aria-current={n === section ? 'page' : undefined}
            onMouseEnter={() => preloadRoute(n.to)} onFocus={() => preloadRoute(n.to)}>
            {n.label}
            {n.to === '/triage' && teamErrors > 0 && (
              <span className="ml-1 px-1 border border-danger/50 text-danger font-mono text-[10px] leading-4 tabular-nums" title={`${teamErrors} Team errors in Triage`}>{teamErrors}</span>
            )}
          </NavLink>
        ))}
      </div>
      {section?.tabs && (
        <div className="border-t border-line bg-bar">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-6 flex items-stretch overflow-x-auto" role="navigation" aria-label={section.label}>
            {section.tabs.map(t => (
              <NavLink key={t.to} to={t.to} className={({ isActive }) => subCls(isActive)} onMouseEnter={() => preloadRoute(t.to)} onFocus={() => preloadRoute(t.to)}>
                {t.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
