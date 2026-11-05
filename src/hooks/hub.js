// Data hooks. Every Hub page reads through these — no component-level fetch.
//   useBootstrap()      lookups, counts, tiles, Just logged
//   useSnapshot('rfis') one snapshot DB ({ syncedAt, rows })
// Writes are optimistic: the cache updates first and rolls back on error.

import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { queryClient } from '../lib/queryClient.js';
import { applyCountDelta, makeEvent, londonToday } from '../../hub-core/derive.js';

export const keys = {
  bootstrap: ['bootstrap'],
  snapshot: db => ['snapshot', db],
};

const fetchBootstrap = ({ signal }) => api('/api/bootstrap', { signal });
const fetchSnapshot = db => async ({ signal }) => (await api(`/api/snapshot?dbs=${db}`, { signal }))[db];

export function useBootstrap() {
  return useQuery({ queryKey: keys.bootstrap, queryFn: fetchBootstrap });
}

export function useSnapshot(db) {
  return useQuery({ queryKey: keys.snapshot(db), queryFn: fetchSnapshot(db) });
}

export function useSnapshots(dbs) {
  return useQueries({
    queries: dbs.map(db => ({ queryKey: keys.snapshot(db), queryFn: fetchSnapshot(db) })),
    combine: results => ({
      data: Object.fromEntries(dbs.map((db, i) => [db, results[i].data?.rows || []])),
      isPending: results.some(r => r.isPending && !r.data),
      isFetching: results.some(r => r.isFetching),
      error: results.find(r => r.error)?.error || null,
    }),
  });
}

export function prefetchSnapshots(dbs) {
  return Promise.all(dbs.map(db => queryClient.prefetchQuery({ queryKey: keys.snapshot(db), queryFn: fetchSnapshot(db) })));
}
export function prefetchBootstrap() {
  return queryClient.prefetchQuery({ queryKey: keys.bootstrap, queryFn: fetchBootstrap });
}

// ── Sync now ─────────────────────────────────────────────────────────────────
export function useSyncNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/api/sync-now', { method: 'POST' }),
    onSettled: () => qc.invalidateQueries(),
  });
}

// ── Optimistic writes ────────────────────────────────────────────────────────
function useOptimisticWrite({ kind, db, request, toRow, toEvent }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: vars => request(vars),
    onMutate: async vars => {
      await qc.cancelQueries({ queryKey: keys.bootstrap });
      if (db) await qc.cancelQueries({ queryKey: keys.snapshot(db) });
      const prevBoot = qc.getQueryData(keys.bootstrap);
      const prevSnap = db ? qc.getQueryData(keys.snapshot(db)) : undefined;
      const tempId = `temp-${Date.now()}`;
      const row = toRow(vars, tempId, prevBoot);
      const event = toEvent?.(vars, row, prevBoot);

      qc.setQueryData(keys.bootstrap, old => old && ({
        ...old,
        counts: applyCountDelta(old.counts, kind, { ...vars, prev: vars.prev }, old.today || londonToday()),
        justLogged: event ? [event, ...(old.justLogged || [])] : old.justLogged,
        lookups: kind === 'item' ? {
          ...old.lookups,
          items: old.lookups.items.map(i => (i.id === vars.id ? {
            ...i,
            ...(vars.status !== undefined && { status: vars.status }),
            ...(vars.bic !== undefined && { bic: vars.bic }),
            ...(vars.dtId !== undefined && { dtIds: vars.dtId ? [vars.dtId] : [] }),
          } : i)),
        } : old.lookups,
      }));
      if (db && prevSnap) {
        qc.setQueryData(keys.snapshot(db), old => old && ({
          ...old,
          rows: kind === 'item'
            ? old.rows.map(r => (r.id === vars.id ? { ...r, ...row } : r))
            : [...old.rows, row],
        }));
      }
      return { prevBoot, prevSnap, tempId };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.prevBoot) qc.setQueryData(keys.bootstrap, ctx.prevBoot);
      if (db && ctx?.prevSnap) qc.setQueryData(keys.snapshot(db), ctx.prevSnap);
      if (db && kind === 'item' && isGone(err)) dropRow(qc, db, vars.id);
    },
    onSuccess: (result, _vars, ctx) => {
      // Swap the temp row/event for the real ones from the server.
      if (db) {
        qc.setQueryData(keys.snapshot(db), old => old && ({
          ...old,
          rows: [...old.rows.filter(r => r.id !== ctx.tempId && r.id !== result.row.id), result.row],
        }));
      }
      const real = result.event ? [result.event] : (result.events || []);
      qc.setQueryData(keys.bootstrap, old => old && ({
        ...old,
        justLogged: [...real, ...(old.justLogged || []).filter(e => !e.id.startsWith('temp:'))].slice(0, 20),
      }));
    },
    onSettled: () => {
      // Background refresh so counts match the server exactly.
      qc.invalidateQueries({ queryKey: keys.bootstrap });
    },
  });
}

const itemOf = (boot, id) => boot?.lookups?.items?.find(i => i.id === id);
const tempEvent = (kind, summary, vars, boot, extra = {}) => ({
  ...makeEvent({ kind, summary, source: 'Cockpit', itemId: vars.itemId, projectId: itemOf(boot, vars.itemId)?.projectId, ...extra }),
  id: `temp:${kind}:${Date.now()}`,
  pending: true,
});

export function useCreateAction() {
  return useOptimisticWrite({
    kind: 'action',
    db: 'actions',
    request: vars => api('/api/actions', { method: 'POST', body: vars }),
    toRow: (v, id) => ({ id, title: v.text, type: v.type, bic: v.type === 'Note' ? null : v.bic, due: v.type === 'Note' ? null : v.due || null, blocks: !!v.blocks, done: false, itemIds: [v.itemId], createdAt: new Date().toISOString() }),
    toEvent: (v, _row, boot) => tempEvent(v.type === 'Note' ? 'note' : 'action', v.text, v, boot, { blocking: v.type !== 'Note' && !!v.blocks }),
  });
}

export function useCreateRfi() {
  return useOptimisticWrite({
    kind: 'rfi',
    db: 'rfis',
    request: vars => api('/api/rfis', { method: 'POST', body: vars }),
    toRow: (v, id, boot) => ({ id, number: boot?.lookups?.nextRfi, title: v.question, question: v.question, status: v.bic === 'DM' ? 'Raise' : 'Open', due: v.due || null, itemIds: [v.itemId], createdAt: new Date().toISOString() }),
    toEvent: (v, _row, boot) => tempEvent('rfi', `RFI-${String(boot?.lookups?.nextRfi ?? '?').padStart(3, '0')} ${v.question}`, v, boot),
  });
}

export function useCreateVariation() {
  return useOptimisticWrite({
    kind: 'vc',
    db: 'variations',
    request: vars => api('/api/variations', { method: 'POST', body: vars }),
    toRow: (v, id, boot) => ({ id, number: boot?.lookups?.nextVc, title: v.description, status: 'Awaiting Design Info', raisedBy: v.raisedBy, itemIds: [v.itemId], createdAt: new Date().toISOString() }),
    toEvent: (v, _row, boot) => tempEvent('vc', `VC-${String(boot?.lookups?.nextVc ?? '?').padStart(4, '0')} ${v.description}`, v, boot),
  });
}

export function useUpdateItem() {
  return useOptimisticWrite({
    kind: 'item',
    db: 'tasks',
    request: ({ id, status, bic, dtId }) => api(`/api/items/${id}`, { method: 'PATCH', body: { status, bic, dtId } }),
    toRow: v => ({
      ...(v.status !== undefined && { status: v.status }),
      ...(v.bic !== undefined && { bic: v.bic }),
      ...(v.dtId !== undefined && { dtIds: v.dtId ? [v.dtId] : [] }),
    }),
    toEvent: (v, _row, boot) => {
      const item = itemOf(boot, v.id);
      const parts = [v.status !== undefined && `→ ${v.status}`, v.bic !== undefined && `BIC ${v.bic}`, v.dtId !== undefined && 'DT reassigned'].filter(Boolean);
      return tempEvent('status', `${item?.name || 'Item'}: ${parts.join(', ')}`, { itemId: v.id }, boot);
    },
  });
}

// ── Generic record edits (Triage) ───────────────────────────────────────────
// Patches the row in its snapshot straight away; rolls back if Notion refuses.
// 410 = the record was archived / deleted in Notion; the server has dropped it
// from the snapshot, so drop it here too instead of rolling the edit back.
const isGone = err => err?.status === 410;
function dropRow(qc, db, id) {
  qc.setQueryData(keys.snapshot(db), old => old && ({ ...old, rows: old.rows.filter(r => r.id !== id) }));
}

export function useUpdateRecord(db) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, set, chase }) => api(`/api/records/${db}/${id}`, { method: 'PATCH', body: { set, chase } }),
    onMutate: async ({ id, set }) => {
      await qc.cancelQueries({ queryKey: keys.snapshot(db) });
      const prev = qc.getQueryData(keys.snapshot(db));
      qc.setQueryData(keys.snapshot(db), old => old && ({ ...old, rows: old.rows.map(r => (r.id === id ? applyLocal(db, r, set) : r)) }));
      return { prev };
    },
    onError: (e, { id }, ctx) => { if (ctx?.prev) qc.setQueryData(keys.snapshot(db), ctx.prev); if (isGone(e)) dropRow(qc, db, id); },
    onSuccess: ({ row }) => qc.setQueryData(keys.snapshot(db), old => old && ({ ...old, rows: old.rows.map(r => (r.id === row.id ? row : r)) })),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.bootstrap }),
  });
}

export function useTrashRecord(db) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, restore }) => api(`/api/records/${db}/${id}/${restore ? 'restore' : 'trash'}`, { method: 'POST' }),
    onMutate: async ({ id, restore }) => {
      await qc.cancelQueries({ queryKey: keys.snapshot(db) });
      const prev = qc.getQueryData(keys.snapshot(db));
      if (!restore) qc.setQueryData(keys.snapshot(db), old => old && ({ ...old, rows: old.rows.filter(r => r.id !== id) }));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(keys.snapshot(db), ctx.prev); },
    onSuccess: ({ row }, { restore }) => {
      if (restore) qc.setQueryData(keys.snapshot(db), old => old && ({ ...old, rows: [...old.rows.filter(r => r.id !== row.id), row] }));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.bootstrap }),
  });
}

// Move an action into the To Do list: creates the task, closes the action.
export function useActionToTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, task }) => api(`/api/actions/${id}/to-task`, { method: 'POST', body: task }),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: keys.snapshot('actions') });
      const prev = qc.getQueryData(keys.snapshot('actions'));
      qc.setQueryData(keys.snapshot('actions'), old => old && ({ ...old, rows: old.rows.map(r => (r.id === id ? { ...r, done: true } : r)) }));
      return { prev };
    },
    onError: (e, { id }, ctx) => { if (ctx?.prev) qc.setQueryData(keys.snapshot('actions'), ctx.prev); if (isGone(e)) dropRow(qc, 'actions', id); },
    onSuccess: ({ row, action }) => {
      qc.setQueryData(keys.snapshot('actions'), old => old && ({ ...old, rows: old.rows.map(r => (r.id === action.id ? action : r)) }));
      qc.setQueryData(keys.snapshot('todo'), old => old && ({ ...old, rows: [...old.rows.filter(r => r.id !== row.id), row] }));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.bootstrap }),
  });
}

// Friendly field names → snapshot row shape, for the optimistic patch.
function applyLocal(db, row, set) {
  const r = { ...row, dates: row.dates && { ...row.dates }, dt: row.dt && { ...row.dt } };
  for (const [k, v] of Object.entries(set)) {
    if (k === 'dtId') { if (db === 'submissions' || db === 'tasks') r.dtIds = v ? [v] : []; else r.personIds = v ? [v] : []; }
    else if (k === 'personId') r.personIds = v ? [v] : [];
    else if (db === 'todo' && k === 'status') { r.status = v; r.done = v === 'Done'; }
    else if (k === 'instruction') r.dates.instruction = v;
    else if (/Act$/.test(k) && r.dt) r.dt[k] = v;
    else r[k] = v;
  }
  return r;
}

// ── Duplicate actions ────────────────────────────────────────────────────────
const dismissedKey = ['duplicates', 'dismissed'];
export function useDismissedDuplicates() {
  return useQuery({ queryKey: dismissedKey, queryFn: ({ signal }) => api('/api/duplicates/dismissed', { signal }) });
}

export function useDismissDuplicate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, undo }) => api('/api/duplicates/dismiss', { method: 'POST', body: { key, undo } }),
    onMutate: async ({ key, undo }) => {
      await qc.cancelQueries({ queryKey: dismissedKey });
      const prev = qc.getQueryData(dismissedKey);
      qc.setQueryData(dismissedKey, old => {
        const cur = old?.dismissed || [];
        return { dismissed: undo ? cur.filter(x => x !== key) : [key, ...cur] };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx) qc.setQueryData(dismissedKey, ctx.prev); },
    onSuccess: data => qc.setQueryData(dismissedKey, data),
  });
}

// Keep one action, delete the other (its wording goes into the kept one's log).
export function useMergeDuplicate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ keep, drop }) => api('/api/duplicates/merge', { method: 'POST', body: { keep, drop } }),
    onMutate: async ({ drop }) => {
      await qc.cancelQueries({ queryKey: keys.snapshot('actions') });
      const prev = qc.getQueryData(keys.snapshot('actions'));
      qc.setQueryData(keys.snapshot('actions'), old => old && ({ ...old, rows: old.rows.filter(r => r.id !== drop) }));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(keys.snapshot('actions'), ctx.prev); },
    onSuccess: ({ row }) => {
      qc.setQueryData(keys.snapshot('actions'), old => old && ({ ...old, rows: old.rows.map(r => (r.id === row.id ? row : r)) }));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.bootstrap }),
  });
}
