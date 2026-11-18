// Programme data. Dates are calculated in the browser from the cached
// snapshots (same engine as the server), so switching project or tab never
// waits on Notion. Writes go through /api/programme/*.

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { keys, useSnapshots, useBootstrap } from './hub.js';
import { buildProgramme } from '../../hub-core/programme/adapter.js';
import { itemView } from '../../hub-core/programme/view.js';
import { londonToday } from '../../hub-core/derive.js';

export const PROGRAMME_DBS = ['tasks', 'drawings', 'variations', 'rfis', 'projects', 'clients', 'team', 'submissions'];

/** Every item of the project (all live projects when projectId is empty), calculated. */
export function useProgramme(projectId) {
  const { data: boot } = useBootstrap();
  const today = boot?.today || londonToday();
  const snaps = useSnapshots(PROGRAMME_DBS);
  const { data } = snaps;
  const live = useMemo(() => new Set(data.projects.filter(p => /^in progress$/i.test(p.status || '')).map(p => p.id)), [data.projects]);
  const entries = useMemo(() => {
    if (snaps.isPending) return [];
    return buildProgramme(data, { projectId: projectId || null, today, include: t => !!t.projectId && live.has(t.projectId) });
  }, [data, projectId, today, live, snaps.isPending]);
  const items = useMemo(() => entries.map(e => ({ ...itemView(e, today), entry: e })), [entries, today]);
  return { items, today, data, live, isPending: snaps.isPending, isFetching: snaps.isFetching, error: snaps.error };
}

export function useProgrammePlan(projectId, enabled = true) {
  return useQuery({
    queryKey: ['programme-plan', projectId || 'all'],
    queryFn: ({ signal }) => api(`/api/programme/plan${projectId ? `?project=${projectId}` : ''}`, { signal }),
    enabled,
    staleTime: 15_000,
  });
}

function replaceRow(qc, db, row) {
  qc.setQueryData(keys.snapshot(db), old => old && ({ ...old, rows: old.rows.map(r => (r.id === row.id ? row : r)) }));
}

export function useApplyProgramme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, projectId }) => api('/api/programme/apply', { method: 'POST', body: { ids, projectId } }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.snapshot('tasks') });
      qc.invalidateQueries({ queryKey: ['programme-plan'] });
    },
  });
}

// Item inputs: manual DT Start, Reissue Reason, Programme-driven, Date of Instruction.
// Optimistic on the tasks snapshot so the dates recalculate straight away.
export function useUpdateProgrammeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, set }) => api(`/api/programme/items/${id}`, { method: 'PATCH', body: set }),
    onMutate: async ({ id, set }) => {
      await qc.cancelQueries({ queryKey: keys.snapshot('tasks') });
      const prev = qc.getQueryData(keys.snapshot('tasks'));
      qc.setQueryData(keys.snapshot('tasks'), old => old && ({ ...old, rows: old.rows.map(r => (r.id === id ? applyInputs(r, set) : r)) }));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(keys.snapshot('tasks'), ctx.prev); },
    onSuccess: ({ row }) => replaceRow(qc, 'tasks', row),
    onSettled: () => qc.invalidateQueries({ queryKey: ['programme-plan'] }),
  });
}

const START_KEY = { s5: 'st2AdjIn', c01: 'stCAdjIn' };
const START_OPT = { s5: 'S5', c01: 'A4.5/PRD' };
export function applyInputs(row, set) {
  const sched = { ...(row.sched || {}) };
  for (const [k, d] of Object.entries(set.manualDtStart || {})) {
    const marks = new Set(sched.manualDtStart || []);
    if (d) { marks.add(START_OPT[k]); sched[START_KEY[k]] = d; } else marks.delete(START_OPT[k]);
    sched.manualDtStart = [...marks];
  }
  if (set.reissueReason !== undefined) sched.reissueReason = set.reissueReason || null;
  if (set.programmeDriven !== undefined) sched.programmeDriven = !!set.programmeDriven;
  if (set.dateOfInstruction !== undefined) sched.dateOfInstruction = set.dateOfInstruction || null;
  for (const [k, v] of Object.entries(set.accel || {})) sched[k] = v === '' ? null : v;
  return { ...row, sched, reissueReason: sched.reissueReason, programmeDriven: sched.programmeDriven };
}

export function useUpdateProgrammeProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, periods, minimums }) => api(`/api/programme/projects/${id}`, { method: 'PATCH', body: { periods, minimums } }),
    onSuccess: ({ row }) => replaceRow(qc, 'projects', row),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.snapshot('tasks') });
      qc.invalidateQueries({ queryKey: ['programme-plan'] });
    },
  });
}
