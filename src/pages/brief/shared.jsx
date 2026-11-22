// Shared data and helpers for the Brief tab (Daily Brief + Triage).
import { useMemo, useState } from 'react';
import { useSnapshots, useBootstrap } from '../../hooks/hub.js';
import { londonToday, addDays, isOpenAction, isOpenRfi, isOpenVc } from '../../../hub-core/derive.js';
import { stagesFor } from '../../../hub-core/stage.js';
import { drawnByFor, drawnByIds } from '../../../hub-core/drawnBy.js';

export const EXTERNAL = new Set(['Contractor', 'Consultant', 'Architect', 'Client']);
export const CHASE_ITEM_STATUSES = new Set(['Set Up', 'In Design', 'Awaiting Approval', 'By Others', 'Backlog', 'Blocked', 'To Do', 'In Progress']);
export const ACTIVE_ITEM_STATUSES = new Set(['Set Up', 'In Design', 'Awaiting Approval', 'Blocked', 'In Progress']);
export const BICS = ['DM', 'DT', 'Project Team', 'Production', 'Site', 'Supplier', 'Document Control', 'Contractor', 'Consultant', 'Architect', 'Client'];

export const groupOf = bic => (!bic ? 'unfiled' : bic === 'DM' ? 'mine' : bic === 'DT' ? 'dt' : EXTERNAL.has(bic) ? 'ext' : 'int');
export const ageDays = (iso, today) => (iso ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${iso.slice(0, 10)}T12:00:00Z`)) / 864e5) : null);
export const fmtDay = iso => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
export const bicTone = bic => (bic === 'DM' ? 'accent' : bic === 'DT' ? 'ok' : EXTERNAL.has(bic) ? 'danger' : 'muted');

// Business-day extension, from the current due date if it is ahead, else today.
export function extendDue(current, n, today) {
  let d = current && current > today ? current : today;
  d = addDays(d, n);
  for (;;) {
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) return d;
    d = addDays(d, 1);
  }
}

const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
export function useStored(key, initial) {
  const [v, setV] = useState(() => store.get(key, initial));
  return [v, x => { setV(x); store.set(key, x); }];
}

export const BRIEF_DBS = ['tasks', 'actions', 'rfis', 'variations', 'submissions', 'projects', 'team', 'activity', 'meetings', 'drawings', 'suppliers'];

// All snapshot rows the Brief tab needs, narrowed to one project when set.
export function useBriefData(projectId) {
  const { data: s, isPending } = useSnapshots(BRIEF_DBS);
  const { data: boot } = useBootstrap();
  const today = boot?.today || londonToday();

  return useMemo(() => {
    const items = new Map(s.tasks.map(i => [i.id, i]));
    const team = new Map(s.team.map(t => [t.id, t]));
    const projects = new Map(s.projects.map(p => [p.id, p.title]));
    const projOf = ids => items.get(ids?.[0])?.projectId ?? null;
    const inProj = ids => !projectId || projOf(ids) === projectId;
    const f = {
      actions: s.actions.filter(a => !a.archived && inProj(a.itemIds)),
      items: s.tasks.filter(i => !i.archived && (!projectId || i.projectId === projectId)),
      rfis: s.rfis.filter(r => !r.archived && inProj(r.itemIds)),
      variations: s.variations.filter(v => !v.archived && inProj(v.itemIds)),
      submissions: s.submissions.filter(x => !x.archived && inProj(x.itemIds)),
      activity: s.activity.filter(x => !x.archived && inProj(x.itemIds)),
      meetings: s.meetings.filter(x => !x.archived),
      drawings: s.drawings,
    };
    const projectOptions = (() => {
      const counts = new Map();
      for (const i of s.tasks) if (i.projectId && !['Complete', 'Omitted', 'Close Out', 'Design Complete'].includes(i.status)) counts.set(i.projectId, (counts.get(i.projectId) || 0) + 1);
      return [...counts].map(([id, n]) => ({ value: id, label: `${projects.get(id) || 'Unknown'} (${n})` })).sort((a, b) => a.label.localeCompare(b.label));
    })();
    const stages = stagesFor(s.tasks, s.drawings, s.submissions);
    const drawnBy = drawnByFor(s.submissions);
    return {
      isPending, today, ...f, all: s,
      items_: items, team, projects, projectOptions,
      itemName: ids => items.get(ids?.[0])?.title || '',
      projectName: ids => projects.get(projOf(ids)) || '',
      personName: id => team.get(id)?.title || '',
      stageOf: id => stages.get(id) || null,
      drawnBy: id => drawnByIds(drawnBy, id),
      dts: s.team.filter(t => t.role === 'DT').map(t => ({ id: t.id, name: t.title })).sort((a, b) => a.name.localeCompare(b.name)),
      openActions: f.actions.filter(isOpenAction),
      openRfis: f.rfis.filter(isOpenRfi),
      openVcs: f.variations.filter(isOpenVc),
    };
  }, [s, isPending, today, projectId]);
}

// Latest submission per drawing (as Drawing Flow sees it).
export function latestSubmissions(subs) {
  const by = new Map();
  for (const x of subs) {
    const key = x.drawingIds[0] || x.title;
    const cur = by.get(key);
    if (!cur || (x.createdAt || '') > (cur.createdAt || '')) by.set(key, x);
  }
  return [...by.values()];
}
