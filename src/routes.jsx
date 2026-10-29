// Route table with code splitting. The Cockpit is eager; every other page is
// a lazy chunk that can be preloaded on hover (preloadRoute).

import { lazy } from 'react';

const lazyPage = loader => Object.assign(lazy(loader), { preload: loader });

export const pages = {
  triage: lazyPage(() => import('./pages/Triage.jsx')),
  clientHome: lazyPage(() => import('./pages/ClientHome.jsx')),
  projectHome: lazyPage(() => import('./pages/ProjectHome.jsx')),
  timeline: lazyPage(() => import('./pages/TimelinePage.jsx')),
  tasks: lazyPage(() => import('./pages/TasksPage.jsx')),
  itemSchedule: lazyPage(() => import('./pages/ItemSchedulePage.jsx')),
  rfis: lazyPage(() => import('./pages/RFISchedulePage.jsx')),
  variations: lazyPage(() => import('./pages/VariationSchedulePage.jsx')),
  finishes: lazyPage(() => import('./pages/FinishesSchedulePage.jsx')),
  drawings: lazyPage(() => import('./pages/DrawingsPage.jsx')),
};

// path → page, used by App and by preloadRoute
export const ROUTES = [
  ['/triage', pages.triage],
  ['/client/:clientId', pages.clientHome, { legacy: true }],
  ['/project/:projectId', pages.projectHome, { legacy: true }],
  ['/timeline', pages.timeline, { legacy: true }],
  ['/timeline/:projectId', pages.timeline, { legacy: true }],
  ['/trackers/task-schedule', pages.tasks, { legacy: true }],
  ['/trackers/item-schedule', pages.itemSchedule, { legacy: true }],
  ['/trackers/rfis', pages.rfis, { legacy: true }],
  ['/trackers/variations', pages.variations, { legacy: true }],
  ['/trackers/finishes-schedule', pages.finishes, { legacy: true }],
  ['/drawings', pages.drawings, { legacy: true }],
];


export function preloadRoute(path) {
  const hit = ROUTES.find(([p]) => p === path);
  hit?.[1].preload?.().catch(() => {});
}
