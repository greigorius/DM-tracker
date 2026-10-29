/**
 * AppDataContext — global app-wide data provider.
 *
 * Responsibilities:
 *  1. Fetch & cache the projects list on app mount (cache-first, then network).
 *  2. Background-prefetch per-project items so page loads are instant.
 *  3. Background-prefetch other key page data (tasks, RFIs, variations, etc.)
 *  4. Expose projects list to consumers (e.g. AppNav dynamic PROJECTS dropdown).
 */

import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { getCached, setCached } from '../hooks/usePageCache.js';
import { assignProjectColors, PROJECT_COLORS } from '../data/colors.js';

const AppDataContext = createContext({
  projects:        [],
  projectsLoading: true,
});

// Endpoints to warm in the background (key → url)
const PREFETCH_ENDPOINTS = [
  ['tasks',          '/api/tasks?showDone=true'],
  ['task-categories', '/api/task-categories'],
  ['rfi-schedule',   '/api/rfi-schedule'],
  ['variations-v4',  '/api/variations'],
  ['schedule-items', '/api/schedule-items'],
];

export function AppDataProvider({ children }) {
  const [projects,        setProjects]        = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const didPrefetch = useRef(false);

  useEffect(() => {
    if (didPrefetch.current) return;
    didPrefetch.current = true;

    // ── Helper: apply colour assignments to a project list ────────────────────
    const applyColors = list => {
      const colorMap = assignProjectColors(list);
      return list.map(p => ({ ...p, color: colorMap.get(p.id) ?? PROJECT_COLORS[0] }));
    };

    // ── 1. Load projects (cache-first for instant nav population) ─────────────
    const cachedProjects = getCached('projects');
    if (cachedProjects) {
      setProjects(applyColors(cachedProjects));
      setProjectsLoading(false);
    }

    fetch('/api/projects')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setCached('projects', list);
        setProjects(applyColors(list));

        // ── 2. Background-prefetch per-project items ──────────────────────────
        const active = list.filter(p => p.status !== 'Complete' && p.status !== 'Done');
        active.forEach(p => {
          if (getCached(`items:${p.id}`)) return; // already warm
          fetch(`/api/projects/${p.id}/items`)
            .then(r => r.json())
            .then(d => setCached(`items:${p.id}`, d))
            .catch(() => {});
        });
      })
      .catch(() => {})
      .finally(() => setProjectsLoading(false));

    // ── 3. Background-prefetch other page data ────────────────────────────────
    PREFETCH_ENDPOINTS.forEach(([key, url]) => {
      if (getCached(key)) return; // already warm
      fetch(url)
        .then(r => r.json())
        .then(data => setCached(key, data))
        .catch(() => {});
    });
  }, []);

  return (
    <AppDataContext.Provider value={{ projects, projectsLoading }}>
      {children}
    </AppDataContext.Provider>
  );
}

export const useAppData = () => useContext(AppDataContext);
