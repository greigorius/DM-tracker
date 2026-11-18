// Write routes: Notion writes that patch the snapshot, plus sync-now.
import { createAction, createRfi, createVariation, updateItem, updateRecord, trashRecord, actionToTask, mergeDuplicate, dismissDuplicate } from './write.js';
import { runSync, triggerFullRebuild } from './sync.js';
import { previewTeamEmails, sendTeamEmails } from './team-email.js';
import { getBicPlan, applyBic } from './item-bic-sync.js';
import { getProgrammePlan, applyProgramme, updateProgrammeItem, updateProgrammeProject } from './programme/sync.js';

export const writeRoutes = [
  ['POST', /^\/api\/actions\/?$/, ({ body }) => createAction(body)],
  ['POST', /^\/api\/rfis\/?$/, ({ body }) => createRfi(body)],
  ['POST', /^\/api\/variations\/?$/, ({ body }) => createVariation(body)],
  ['POST', /^\/api\/actions\/([^/]+)\/to-task\/?$/, ({ body, params }) => actionToTask(params[0], body)],
  ['PATCH', /^\/api\/items\/([^/]+)\/?$/, ({ body, params }) => updateItem(params[0], body)],
  ['PATCH', /^\/api\/records\/([a-z]+)\/([^/]+)\/?$/, ({ body, params }) => updateRecord(params[0], params[1], body)],
  ['POST', /^\/api\/records\/([a-z]+)\/([^/]+)\/trash\/?$/, ({ params }) => trashRecord(params[0], params[1])],
  ['POST', /^\/api\/records\/([a-z]+)\/([^/]+)\/restore\/?$/, ({ params }) => trashRecord(params[0], params[1], true)],
  ['POST', /^\/api\/duplicates\/merge\/?$/, ({ body }) => mergeDuplicate(body)],
  ['POST', /^\/api\/duplicates\/dismiss\/?$/, ({ body }) => dismissDuplicate(body)],
  ['POST', /^\/api\/team\/email\/preview\/?$/, ({ body }) => previewTeamEmails(body)],
  ['POST', /^\/api\/team\/email\/send\/?$/, ({ body }) => sendTeamEmails(body)],
  ['GET', /^\/api\/item-bic\/plan\/?$/, () => getBicPlan()],
  ['POST', /^\/api\/item-bic\/apply\/?$/, ({ body }) => applyBic({ ids: body?.ids, deadline: Date.now() + 8000 })],
  // Programme (Scheduling Tool engine): Adj dates to write, apply, and item / project inputs
  ['GET', /^\/api\/programme\/plan\/?$/, ({ query }) => getProgrammePlan({ projectId: query.get('project') || null })],
  ['POST', /^\/api\/programme\/apply\/?$/, ({ body }) => applyProgramme({ ids: body?.ids, projectId: body?.projectId || null, deadline: Date.now() + 8000 })],
  ['PATCH', /^\/api\/programme\/items\/([^/]+)\/?$/, ({ body, params }) => updateProgrammeItem(params[0], body)],
  ['PATCH', /^\/api\/programme\/projects\/([^/]+)\/?$/, ({ body, params }) => updateProgrammeProject(params[0], body)],
  // Interactive refresh: incremental only, short budget. Full rebuilds run in the background function.
  // DBs that need a full rebuild (first deploy, mapper change) are handed to the background job.
  ['POST', /^\/api\/sync-now\/?$/, async ({ query }) => {
    const run = await runSync({ budgetMs: Number(query.get('budget')) || 8000, allowFull: false });
    if (run.needsFull?.length) run.rebuilding = await triggerFullRebuild();
    return run;
  }],
];
