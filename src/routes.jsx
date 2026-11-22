// Route table with code splitting. The Cockpit is eager; every other page is
// a lazy chunk that can be preloaded on hover (preloadRoute).

import { lazy } from 'react';

const lazyPage = loader => Object.assign(lazy(loader), { preload: loader });

export const pages = {
  briefLayout: lazyPage(() => import('./pages/brief/BriefLayout.jsx')),
  dailyBrief: lazyPage(() => import('./pages/brief/DailyBrief.jsx')),
  brief: lazyPage(() => import('./pages/brief/BriefPage.jsx')),
  triage: lazyPage(() => import('./pages/brief/TriagePage.jsx')),
  inbox: lazyPage(() => import('./pages/items/InboxPage.jsx')),
  tasks: lazyPage(() => import('./pages/TasksPage.jsx')),
  actions: lazyPage(() => import('./pages/actions/ActionsPage.jsx')),
  team: lazyPage(() => import('./pages/team/TeamPage.jsx')),
  programme: lazyPage(() => import('./pages/programme/ProgrammePage.jsx')),
  itemSchedule: lazyPage(() => import('./pages/items/ItemTrackerPage.jsx')),
  teamLens: lazyPage(() => import('./pages/workspace/TeamLens.jsx')),
  projectsLens: lazyPage(() => import('./pages/workspace/ProjectsLens.jsx')),
  suppliersLens: lazyPage(() => import('./pages/workspace/SuppliersLens.jsx')),
  rfis: lazyPage(() => import('./pages/RFIsPage.jsx')),
  variations: lazyPage(() => import('./pages/VariationsPage.jsx')),
  finishes: lazyPage(() => import('./pages/FinishesPage.jsx')),
  drawings: lazyPage(() => import('./pages/DrawingsPage.jsx')),
  reports: lazyPage(() => import('./pages/ReportsPage.jsx')),
};

// path → page, used by App and by preloadRoute
export const ROUTES = [
  ['/trackers/actions', pages.actions],
  ['/workspace/items', pages.itemSchedule],
  ['/workspace/team', pages.teamLens],
  ['/workspace/projects', pages.projectsLens],
  ['/workspace/suppliers', pages.suppliersLens],
  ['/programme', pages.programme],
  ['/programme/:projectId', pages.programme],
  ['/trackers/rfis', pages.rfis],
  ['/trackers/variations', pages.variations],
  ['/trackers/finishes-schedule', pages.finishes],
  ['/trackers/drawings', pages.drawings],
  ['/reports', pages.reports],
];


export function preloadRoute(path) {
  if (path === '/triage/lists') { pages.briefLayout.preload().catch(() => {}); pages.triage.preload().catch(() => {}); return; }
  if (path === '/brief' || path === '/triage') {
    pages.briefLayout.preload().catch(() => {});
    (path === '/triage' ? pages.inbox : pages.brief).preload().catch(() => {});
    return;
  }
  const hit = ROUTES.find(([p]) => p === path);
  hit?.[1].preload?.().catch(() => {});
}
