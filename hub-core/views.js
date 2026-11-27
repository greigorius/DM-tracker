// Saved register views (Drawings, RFIs, Variations, Finishes), kept in the Hub
// store so they follow you across devices. One list per register.
//   GET  /api/views                      → { views: { drawings: [...], ... } }
//   POST /api/views { register, views }  → replaces that register's list
import { getHubStore } from './store.js';

const KEY = 'registers/views';
const REGISTERS = new Set(['drawings', 'rfis', 'variations', 'finishes']);
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

export async function getViews() {
  try { return { views: (await (await getHubStore()).getJSON(KEY)) || {} }; }
  catch (err) { console.error('[hub-store] could not read register views:', err.message); return { views: {} }; }
}

const clean = v => ({
  id: String(v.id || '').slice(0, 40),
  name: String(v.name || 'Untitled view').slice(0, 80),
  project: String(v.project || 'all').slice(0, 60),
  statuses: Array.isArray(v.statuses) ? v.statuses.slice(0, 50).map(String) : [],
  statusMode: ['open', 'all'].includes(v.statusMode) ? v.statusMode : 'open',
  q: String(v.q || '').slice(0, 200),
  columns: Array.isArray(v.columns) ? v.columns.slice(0, 80).map(String) : [],
  filters: Array.isArray(v.filters) ? v.filters.slice(0, 30).map(f => ({ field: String(f.field || ''), op: String(f.op || ''), value: f.value ?? null })) : [],
  match: v.match === 'any' ? 'any' : 'all',
  sort: v.sort && v.sort.key ? { key: String(v.sort.key), dir: v.sort.dir === 'desc' ? 'desc' : 'asc' } : null,
  group: String(v.group || 'none').slice(0, 60),
  isDefault: !!v.isDefault,
});

export async function saveViews(body = {}) {
  const register = String(body.register || '');
  if (!REGISTERS.has(register)) throw bad('Unknown register');
  if (!Array.isArray(body.views)) throw bad('views must be a list');
  const list = body.views.slice(0, 60).map(clean).filter(v => v.id);
  if (JSON.stringify(list).length > 200000) throw bad('Too many views');
  const store = await getHubStore();
  const cur = (await store.getJSON(KEY)) || {};
  const next = { ...cur, [register]: list };
  await store.setJSON(KEY, next);
  return { views: next };
}
