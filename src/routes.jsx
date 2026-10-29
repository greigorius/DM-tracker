// Route table with code splitting. The Cockpit is eager; every other page is
// a lazy chunk that can be preloaded on hover (preloadRoute).

import { lazy } from 'react';

const lazyPage = loader => Object.assign(lazy(loader), { preload: loader });

export const pages = {
  briefLayout: lazyPage(() => import('./pages/brief/BriefLayout.jsx')),
  dailyBrief: lazyPage(() => import('./pages/brief/DailyBrief.jsx')),
  triage: lazyPage(() => import('./pages/brief/TriagePage.jsx')),
  clientHome: lazyPage(() => import('./pages/ClientPage.jsx')),
  projectHome: lazyPage(() => import('./pages/ProjectPage.jsx')),
  timeline: lazyPage(() => import('./pages/TimelinePage.jsx')),
  itemSchedule: lazyPage(() => import('./pages/ItemsPage.jsx')),
  rfis: lazyPage(() => import('./pages/RFIsPage.jsx')),
  variations: lazyPage(() => import('./pages/VariationsPage.jsx')),
  finishes: lazyPage(() => import('./pages/FinishesPage.jsx')),
  drawings: lazyPage(() => import('./pages/DrawingsPage.jsx')),
};

// path → page, used by App and by preloadRoute
export const ROUTES = [
  ['/client/:clientId', pages.clientHome],
  ['/project/:projectId', pages.projectHome],
  ['/timeline', pages.timeline],
  ['/timeline/:projectId', pages.timeline],
  ['/trackers/item-schedule', pages.itemSchedule],
  ['/trackers/rfis', pages.rfis],
  ['/trackers/variations', pages.variations],
  ['/trackers/finishes-schedule', pages.finishes],
  ['/drawings', pages.drawings],
];


export function preloadRoute(path) {
  if (path.startsWith('/brief')) {
    pages.briefLayout.preload().catch(() => {});
    (path.startsWith('/brief/triage') ? pages.triage : pages.dailyBrief).preload().catch(() => {});
    return;
  }
  const hit = ROUTES.find(([p]) => p === path);
  hit?.[1].preload?.().catch(() => {});
}
