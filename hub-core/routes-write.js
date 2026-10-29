// Write routes: Notion writes that patch the snapshot, plus sync-now.
import { createAction, createRfi, createVariation, updateItem, updateRecord, trashRecord } from './write.js';
import { runSync } from './sync.js';

export const writeRoutes = [
  ['POST', /^\/api\/actions\/?$/, ({ body }) => createAction(body)],
  ['POST', /^\/api\/rfis\/?$/, ({ body }) => createRfi(body)],
  ['POST', /^\/api\/variations\/?$/, ({ body }) => createVariation(body)],
  ['PATCH', /^\/api\/items\/([^/]+)\/?$/, ({ body, params }) => updateItem(params[0], body)],
  ['PATCH', /^\/api\/records\/([a-z]+)\/([^/]+)\/?$/, ({ body, params }) => updateRecord(params[0], params[1], body)],
  ['POST', /^\/api\/records\/([a-z]+)\/([^/]+)\/trash\/?$/, ({ params }) => trashRecord(params[0], params[1])],
  ['POST', /^\/api\/records\/([a-z]+)\/([^/]+)\/restore\/?$/, ({ params }) => trashRecord(params[0], params[1], true)],
  // Interactive refresh: incremental only, short budget. Full rebuilds run in the background function.
  ['POST', /^\/api\/sync-now\/?$/, ({ query }) => runSync({ budgetMs: Number(query.get('budget')) || 8000, allowFull: false })],
];
