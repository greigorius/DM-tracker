import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  getCached, setCached, deleteCached,
  fetchNotion, notionHeaders, queryAll,
  transformItem, transformTask, transformDrawing,
  fetchTaskPages, fetchDrawingMap, transformRFI,
  titleVal, statusVal, selectVal, multiSelectVal, dateVal, relIds,
  withNoPcsa,
} from './notionHelpers.js';

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3001;
const NOTION_API = 'https://api.notion.com/v1';

app.use(cors());
app.use(express.json());

// ── Hub v2 snapshot API (registered before every legacy route) ───────────────
// Same handlers as the Netlify functions api-read / api-write. Locally the
// snapshot lives in .cache/blobs; it is refreshed every 5 minutes while the
// server runs, and on demand with `npm run sync`.
process.env.HUB_STORE ||= 'file';
const { dispatch } = await import('../hub-core/routes.js');
const { readRoutes } = await import('../hub-core/routes-read.js');
const { writeRoutes } = await import('../hub-core/routes-write.js');
app.use(async (req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  const query = new URL(req.originalUrl, 'http://local').searchParams;
  const out = await dispatch([...readRoutes, ...writeRoutes], { method: req.method, pathname: req.path, query, body: req.body });
  if (!out) return next(); // fall through to legacy routes (e.g. GET /api/rfis)
  res.status(out.status).json(out.json);
});
if (process.env.NOTION_TOKEN && process.env.HUB_LOCAL_SYNC !== 'off') {
  const { runSync } = await import('../hub-core/sync.js');
  const tick = () => runSync({ budgetMs: 120_000 })
    .then(r => console.log(`[sync] ${r.results.map(x => `${x.db}:${x.error ? 'ERR' : x.changed}`).join(' ')} (${r.ms} ms)`))
    .catch(e => console.error('[sync]', e.message));
  setTimeout(tick, 1000);
  setInterval(tick, 5 * 60_000);
}

function notionRequired(res) {
  if (!process.env.NOTION_TOKEN) {
    res.status(503).json({ error: 'NOTION_TOKEN not configured' });
    return false;
  }
  return true;
}

const DB = {
  todo:       process.env.NOTION_DB_TODO,
  rfis:       process.env.NOTION_DB_RFIS,
  tasks:      process.env.NOTION_DB_TASKS,
  projects:   process.env.NOTION_DB_PROJECTS,
  drawings:   process.env.NOTION_DB_DRAWINGS,
  variations: process.env.NOTION_DB_VARIATIONS,
};

// ── GET /api/projects ─────────────────────────────────────────────────────────
// Returns all non-complete projects, enriched with client name.
app.get('/api/projects', async (req, res) => {
  if (!notionRequired(res)) return;

  try {
    const pages = await queryAll(DB.projects,
      { property: 'Status', status: { does_not_equal: 'Done' } },
      { sorts: [{ property: 'Start Date', direction: 'descending' }] },
    );

    // Enrich with client names
    const clientIds = [...new Set(
      pages.map(p => p.properties['Client']?.relation?.[0]?.id).filter(Boolean)
    )];
    const clientMap = {};
    await Promise.all(clientIds.map(async id => {
      try {
        const r = await fetchNotion(`${NOTION_API}/pages/${id}`, { headers: notionHeaders() });
        const page = r.ok ? await r.json() : null;
        clientMap[id] = page?.properties['Company']?.title?.[0]?.plain_text ?? null;
      } catch { clientMap[id] = null; }
    }));

    const enriched = pages.map(p => ({
      id:            p.id,
      name:          p.properties['Project Name']?.title?.[0]?.plain_text ?? p.id,
      status:        p.properties['Status']?.status?.name                  ?? null,
      client:        clientMap[p.properties['Client']?.relation?.[0]?.id]  ?? null,
      hoursRequired: p.properties['Total Hours Required']?.rollup?.number  ?? null,
      hoursSpent:    p.properties['Total Hours Spent']?.rollup?.number     ?? null,
      hoursLeft:     p.properties['Hrs Left']?.rollup?.number              ?? null,
    }));

    res.json(enriched);
  } catch (err) {
    console.error('[projects]', err.message);
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ── GET /api/projects/:id/items ───────────────────────────────────────────────
// Returns all items for a project with counts, phase, next date.
app.get('/api/projects/:id/items', async (req, res) => {
  if (!notionRequired(res)) return;
  const { id } = req.params;
  const { phase, status, category } = req.query;

  try {
    let filter = { property: 'Projects', relation: { contains: id } };

    if (phase && phase !== 'all') {
      filter = { and: [filter, { property: 'DM Phase', select: { equals: phase } }] };
    }

    const pages = await queryAll(DB.tasks, filter);
    let items = pages.map(p => transformItem(p));

    if (status && status !== 'all') {
      const COMPLETE = ['PC Approved', 'In Manufacture', 'Complete', 'Omitted'];
      if (status === 'active')   items = items.filter(i => !COMPLETE.includes(i.status));
      else if (status === 'complete') items = items.filter(i => ['PC Approved', 'In Manufacture', 'Complete'].includes(i.status));
      else items = items.filter(i => i.status === status);
    }

    if (category && category !== 'all') {
      items = items.filter(i => i.contractCategory === category);
    }

    items.sort((a, b) => {
      if (a.nextDate && b.nextDate) return a.nextDate.localeCompare(b.nextDate);
      if (a.nextDate) return -1;
      if (b.nextDate) return 1;
      return a.name.localeCompare(b.name);
    });

    const summary = {
      total:  items.length,
      byPhase: {
        ph1:   items.filter(i => i.dmPhase === 'Ph1 - Design Intent').length,
        ph2:   items.filter(i => i.dmPhase === 'Ph2 - DT Tasking').length,
        ph3:   items.filter(i => i.dmPhase === 'Ph3 - Review & Issue').length,
        ph4:   items.filter(i => i.dmPhase === 'Ph4 - Comment Resolution').length,
        ph5:   items.filter(i => i.dmPhase === 'Ph5 - Client Response').length,
        ph6:   items.filter(i => i.dmPhase === 'Ph6 - Manufacturing').length,
        unset: items.filter(i => !i.dmPhase).length,
      },
      openRfis: items.reduce((n, i) => n + i.rfiCount, 0),
      openTdl:  items.reduce((n, i) => n + i.tdlCount, 0),
    };

    res.json({ items, summary });
  } catch (err) {
    console.error('[items]', err.message);
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ── GET /api/projects/:id/timeline ───────────────────────────────────────────
// Returns task items with drawingIds. Drawings loaded separately via /drawings.
app.get('/api/projects/:id/timeline', async (req, res) => {
  if (!notionRequired(res)) return;
  const { id } = req.params;
  if (req.query.refresh === '1') deleteCached(`tasks:${id}`);

  try {
    const taskPages = await fetchTaskPages(id);
    const items     = taskPages.map(p => transformTask(p, []));
    res.json({ items });
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Notion API timed out — try again in a moment' });
    console.error('[timeline]', err.message);
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ── GET /api/projects/:id/drawings?taskIds=id1,id2,... ────────────────────────
// Returns drawings grouped by taskId: { [taskId]: drawing[] }
app.get('/api/projects/:id/drawings', async (req, res) => {
  if (!notionRequired(res)) return;
  const taskIds = (req.query.taskIds ?? '').split(',').filter(Boolean);
  if (!taskIds.length) return res.json({});

  try {
    const drawingMap = await fetchDrawingMap(taskIds);
    const result = {};
    drawingMap.forEach((drawings, taskId) => { result[taskId] = drawings; });
    res.json(result);
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Notion API timed out — try again in a moment' });
    console.error('[drawings]', err.message);
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ── GET /api/stats ────────────────────────────────────────────────────────────
// Cross-project summary stats (item counts by phase/status).
app.get('/api/stats', async (req, res) => {
  if (!notionRequired(res)) return;
  const { projectId } = req.query;

  try {
    const filter = projectId
      ? { property: 'Projects', relation: { contains: projectId } }
      : undefined;

    const pages = await queryAll(DB.tasks, filter);
    const COMPLETE = new Set(['PC Approved', 'In Manufacture', 'Complete', 'Omitted']);
    const items = pages.map(p => ({
      status:  p.properties['Drawing Progress']?.status?.name   ?? null,
      dmPhase: p.properties['DM Phase']?.select?.name ?? null,
    }));

    res.json({
      total:    items.length,
      active:   items.filter(i => !COMPLETE.has(i.status)).length,
      complete: items.filter(i => COMPLETE.has(i.status)).length,
      byPhase: {
        ph1:   items.filter(i => i.dmPhase === 'Ph1 - Design Intent').length,
        ph2:   items.filter(i => i.dmPhase === 'Ph2 - DT Tasking').length,
        ph3:   items.filter(i => i.dmPhase === 'Ph3 - Review & Issue').length,
        ph4:   items.filter(i => i.dmPhase === 'Ph4 - Comment Resolution').length,
        ph5:   items.filter(i => i.dmPhase === 'Ph5 - Client Response').length,
        ph6:   items.filter(i => i.dmPhase === 'Ph6 - Manufacturing').length,
        unset: items.filter(i => !i.dmPhase).length,
      },
    });
  } catch (err) {
    console.error('[stats]', err.message);
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ── GET /api/rfis?ids=id1,id2,... ─────────────────────────────────────────────
// Returns RFIs, optionally filtered to a comma-separated list of IDs.
app.get('/api/rfis', async (req, res) => {
  if (!notionRequired(res)) return;
  const ids = req.query.ids ? req.query.ids.split(',').filter(Boolean) : null;

  try {
    let filter;
    if (ids && ids.length > 0) {
      filter = ids.length === 1
        ? { property: 'Related Item(s)', relation: { contains: ids[0] } }
        : { or: ids.map(id => ({ property: 'Related Item(s)', relation: { contains: id } })) };
    }

    const pages = await queryAll(DB.rfis, filter);
    res.json(pages.map(transformRFI));
  } catch (err) {
    console.error('[rfis]', err.message);
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ── GET /api/rfi-schedule ─────────────────────────────────────────────────────
// Returns all RFIs enriched with project + item names, sorted by project → RFI#
app.get('/api/rfi-schedule', async (req, res) => {
  if (!notionRequired(res)) return;

  const cacheKey = 'rfi-schedule';
  const cached   = getCached(cacheKey);
  if (cached) return res.json(cached);

  async function fetchPage(id) {
    try {
      const r = await fetchNotion(`${NOTION_API}/pages/${id}`, { headers: notionHeaders() });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }

  try {
    const pages = await queryAll(DB.rfis, null);
    const rfis  = pages.map(transformRFI);

    // Collect every unique item ID referenced by any RFI
    const itemIdSet = new Set();
    for (const rfi of rfis) {
      for (const id of rfi.relatedItemIds) itemIdSet.add(id);
    }

    // Batch-fetch item pages (25 at a time) to resolve item names + project IDs
    const itemInfoMap = {};
    const projIdSet   = new Set();
    const itemIds     = [...itemIdSet];

    for (let i = 0; i < itemIds.length; i += 25) {
      const chunk     = itemIds.slice(i, i + 25);
      const itemPages = await Promise.all(chunk.map(fetchPage));
      for (let j = 0; j < chunk.length; j++) {
        const page = itemPages[j];
        if (!page) continue;
        const p      = page.properties ?? {};
        const projId = p['Projects']?.relation?.[0]?.id ?? null;
        const name   = p['Item Name']?.title?.[0]?.plain_text ?? null;
        itemInfoMap[chunk[j]] = { name, projectId: projId };
        if (projId) projIdSet.add(projId);
      }
    }

    // Resolve project names — query the full DB so we don't do N page fetches
    const projMap = {};
    try {
      const projectPages = await queryAll(DB.projects, null);
      for (const p of projectPages) {
        projMap[p.id] = { id: p.id, name: p.properties?.['Project Name']?.title?.[0]?.plain_text ?? p.id };
      }
    } catch {
      await Promise.all([...projIdSet].map(async id => {
        const page = await fetchPage(id);
        if (page) projMap[id] = { id, name: page.properties?.['Project Name']?.title?.[0]?.plain_text ?? id };
      }));
    }

    // Enrich each RFI
    const enriched = rfis.map(rfi => {
      const firstItem = rfi.relatedItemIds[0] ? (itemInfoMap[rfi.relatedItemIds[0]] ?? null) : null;
      const projectId = firstItem?.projectId ?? null;
      return {
        ...rfi,
        projectId,
        projectName:      projectId ? (projMap[projectId]?.name ?? null) : null,
        relatedItemNames: rfi.relatedItemIds.map(id => itemInfoMap[id]?.name).filter(Boolean),
      };
    });

    enriched.sort((a, b) => {
      const p = (a.projectName ?? '').localeCompare(b.projectName ?? '');
      return p !== 0 ? p : (a.rfiNumber ?? 0) - (b.rfiNumber ?? 0);
    });

    setCached(cacheKey, enriched, 5 * 60 * 1000);
    res.json(enriched);
  } catch (err) {
    console.error('[rfi-schedule]', err.message);
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ── GET /api/task-categories ──────────────────────────────────────────────────
// Returns the select options for 'Task Category' from the TODO database schema.
app.get('/api/task-categories', async (req, res) => {
  if (!notionRequired(res)) return;
  if (!DB.todo) return res.status(503).json({ error: 'NOTION_DB_TODO not configured' });

  const cacheKey = 'task-categories';
  const cached   = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const r = await fetchNotion(`${NOTION_API}/databases/${DB.todo}`, { headers: notionHeaders() });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`Notion DB fetch failed: ${r.status} ${txt.slice(0, 200)}`);
    }
    const db         = await r.json();
    const options    = db.properties?.['Task Category']?.select?.options ?? [];
    const categories = options.map(o => o.name).filter(Boolean).sort();
    setCached(cacheKey, categories, 60 * 60 * 1000);
    res.json(categories);
  } catch (err) {
    console.error('[task-categories]', err.message);
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ── GET /api/tasks ────────────────────────────────────────────────────────────
// Returns tasks with project & item names resolved.
// Query params: ?showDone=true to include done tasks (7-day retention window)
app.get('/api/tasks', async (req, res) => {
  if (!notionRequired(res)) return;

  const showDone     = req.query.showDone === 'true';
  const cacheKey     = `tasks:showDone=${showDone}`;
  const cached       = getCached(cacheKey);
  if (cached) return res.json(cached);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  async function fetchPage(id) {
    try {
      const r = await fetchNotion(`${NOTION_API}/pages/${id}`, { headers: notionHeaders() });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }

  async function resolveRelations(itemIds, batchSize = 25) {
    const itemMap      = {};
    const projPromises = {};

    for (let i = 0; i < itemIds.length; i += batchSize) {
      const chunk = itemIds.slice(i, i + batchSize);
      const pages = await Promise.all(chunk.map(fetchPage));
      for (let j = 0; j < chunk.length; j++) {
        const id   = chunk[j];
        const page = pages[j];
        if (!page) continue;
        const props         = page.properties ?? {};
        const name          = props['Item Name']?.title?.[0]?.plain_text ?? null;
        const projectPageId = props['Projects']?.relation?.[0]?.id       ?? null;
        itemMap[id] = { name, projectPageId };
        if (projectPageId && !projPromises[projectPageId]) {
          projPromises[projectPageId] = fetchPage(projectPageId);
        }
      }
    }

    const projMap = {};
    await Promise.all(
      Object.entries(projPromises).map(async ([id, promise]) => {
        const page = await promise;
        if (!page) return;
        const name = page.properties?.['Project Name']?.title?.[0]?.plain_text ?? null;
        projMap[id] = { id, name };
      }),
    );

    return { itemMap, projMap };
  }

  try {
    const filter = showDone
      ? { or: [
          { property: 'Task Done', checkbox: { equals: false } },
          { and: [
            { property: 'Task Done', checkbox: { equals: true } },
            { timestamp: 'created_time', created_time: { after: sevenDaysAgo } },
          ]},
        ]}
      : { or: [
          { property: 'Task Done', checkbox: { equals: false } },
          { property: 'Task Done', checkbox: { does_not_equal: true } },
        ]};

    const pages = await queryAll(DB.todo, filter, {
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    });

    const itemIdSet = new Set();
    for (const p of pages) {
      for (const r of (p.properties?.['Item']?.relation ?? [])) itemIdSet.add(r.id);
    }

    const { itemMap, projMap } = await resolveRelations([...itemIdSet]);

    const tasks = pages.map(p => {
      const props      = p.properties ?? {};
      const itemPageId = props['Item']?.relation?.[0]?.id ?? null;
      const item       = itemMap[itemPageId] ?? {};
      const proj       = item.projectPageId ? projMap[item.projectPageId] : null;
      return {
        id:           p.id,
        tdlId:        props['ID']?.unique_id?.number != null ? `TDL-${props['ID'].unique_id.number}` : null,
        itemId:       itemPageId,
        itemName:     item.name ?? null,
        projectId:    proj?.id   ?? null,
        projectName:  proj?.name ?? null,
        description:  props['Item Description']?.title?.[0]?.plain_text ?? null,
        assignedTo:   props['Assigned To']?.select?.name ?? props['Assigned To']?.people?.[0]?.name ?? null,
        subTaskHours: props['Sub Task Hours']?.number    ?? null,
        taskCategory: props['Task Category']?.select?.name ?? null,
        changeTask:   props['Change Task']?.checkbox    ?? false,
        taskDone:     props['Task Done']?.checkbox      ?? false,
        startDate:    props['Start Date']?.date?.start  ?? null,
        endDate:      props['End Date']?.date?.start    ?? null,
        createdAt:    p.created_time,
      };
    });

    setCached(cacheKey, tasks, 5 * 60 * 1000);
    res.json(tasks);
  } catch (err) {
    console.error('[tasks]', err.message);
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ── GET /api/variations ───────────────────────────────────────────────────────
// Returns all variations enriched with project + item names.
app.get('/api/variations', async (req, res) => {
  if (!notionRequired(res)) return;

  if (!DB.variations) return res.json({ items: [], configured: false });

  const cacheKey = 'variations';
  const cached   = getCached(cacheKey);
  if (cached) return res.json(cached);

  async function fetchPage(id) {
    try {
      const r = await fetchNotion(`${NOTION_API}/pages/${id}`, { headers: notionHeaders() });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }

  function transformVariation(page) {
    const p = page.properties ?? {};
    const varNumber =
      p['No ID']?.unique_id?.number  ?? p['Variation Number']?.number ??
      p['Var No.']?.number           ?? p['Var No']?.number            ??
      p['ID']?.unique_id?.number     ?? null;
    const title =
      titleVal(p, 'Variation Description') ?? titleVal(p, 'Variation Title') ??
      titleVal(p, 'Variation Name')        ?? titleVal(p, 'Name')             ?? null;
    const statusValues = (() => {
      const multi =
        multiSelectVal(p, 'Variation Status').length ? multiSelectVal(p, 'Variation Status') :
        multiSelectVal(p, 'Status').length           ? multiSelectVal(p, 'Status')           : [];
      if (multi.length) return multi;
      const single = statusVal(p, 'Variation Status') ?? selectVal(p, 'Variation Status') ??
                     statusVal(p, 'Status')           ?? selectVal(p, 'Status')           ?? null;
      return single ? [single] : [];
    })();
    const type      = selectVal(p, 'Variation Type') ?? selectVal(p, 'Type') ?? null;
    const typeColor = p['Variation Type']?.select?.color ?? p['Type']?.select?.color ?? null;
    const dateIssued =
      p['Change Request Date']?.date?.start ?? p['Date Issued']?.date?.start ??
      p['Issue Date']?.date?.start          ?? null;
    const projectId =
      p['Projects']?.relation?.[0]?.id          ?? p['Project']?.relation?.[0]?.id ??
      p['Related Projects']?.relation?.[0]?.id  ?? p['Related Project']?.relation?.[0]?.id ?? null;
    const relatedTaskIds = (p['Related Task']?.relation ?? p['Related Tasks']?.relation ?? []).map(r => r.id);
    const legacyItemId   =
      p['Item']?.relation?.[0]?.id         ?? p['Related Item']?.relation?.[0]?.id  ??
      p['Related Items']?.relation?.[0]?.id ?? p['Items']?.relation?.[0]?.id        ?? null;
    return { id: page.id, varNumber, title, statusValues, projectId, relatedTaskIds, legacyItemId, dateIssued, type, typeColor };
  }

  try {
    const startedAt = Date.now();
    const pages      = await queryAll(DB.variations, null);
    const variations = pages.map(transformVariation);

    const statusColorMap = {};
    for (const page of pages) {
      const opts = page.properties?.['Variation Status']?.multi_select ?? page.properties?.['Status']?.multi_select ?? [];
      for (const o of opts) { if (o.name && o.color && !statusColorMap[o.name]) statusColorMap[o.name] = o.color; }
    }

    const allTaskIds         = [...new Set(variations.flatMap(v => v.relatedTaskIds))];
    const allLegacyIds       = [...new Set(variations.map(v => v.legacyItemId).filter(Boolean))];
    const taskToVariationIds = {};
    for (const v of variations) {
      for (const tid of v.relatedTaskIds) {
        if (!taskToVariationIds[tid]) taskToVariationIds[tid] = [];
        taskToVariationIds[tid].push(v.id);
      }
    }

    const variationToItemIds = {};
    const itemInfoMap        = {};
    const projIdSet          = new Set(variations.map(v => v.projectId).filter(Boolean));

    if (DB.tasks && allTaskIds.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < allTaskIds.length; i += CHUNK) {
        const chunk      = allTaskIds.slice(i, i + CHUNK);
        const taskFilter = chunk.length === 1
          ? { property: 'To Do List', relation: { contains: chunk[0] } }
          : { or: chunk.map(tid => ({ property: 'To Do List', relation: { contains: tid } })) };
        const itemPages  = await queryAll(DB.tasks, withNoPcsa(taskFilter));
        for (const page of itemPages) {
          const itemId = page.id;
          const p      = page.properties ?? {};
          const name   = p['Item Name']?.title?.[0]?.plain_text ?? null;
          const projId = p['Projects']?.relation?.[0]?.id       ?? null;
          itemInfoMap[itemId] = { name, projectId: projId };
          if (projId) projIdSet.add(projId);
          const tdlIds = (p['To Do List']?.relation ?? []).map(r => r.id);
          for (const tid of tdlIds) {
            for (const vid of (taskToVariationIds[tid] ?? [])) {
              if (!variationToItemIds[vid]) variationToItemIds[vid] = new Set();
              variationToItemIds[vid].add(itemId);
            }
          }
        }
        if (i + CHUNK < allTaskIds.length) await new Promise(r => setTimeout(r, 300));
      }
    }

    const unresolvedLegacy = allLegacyIds.filter(id => !itemInfoMap[id]);
    for (let i = 0; i < unresolvedLegacy.length; i += 5) {
      const chunk = unresolvedLegacy.slice(i, i + 5);
      const fetched = await Promise.all(chunk.map(fetchPage));
      for (let j = 0; j < chunk.length; j++) {
        const page = fetched[j];
        if (!page) continue;
        const p      = page.properties ?? {};
        const projId = p['Projects']?.relation?.[0]?.id ?? null;
        const name   = p['Item Name']?.title?.[0]?.plain_text ?? p['Name']?.title?.[0]?.plain_text ?? null;
        itemInfoMap[chunk[j]] = { projectId: projId, name };
        if (projId) projIdSet.add(projId);
      }
      if (i + 5 < unresolvedLegacy.length) await new Promise(r => setTimeout(r, 300));
    }

    const projMap = {};
    try {
      const projectPages = await queryAll(DB.projects, null);
      for (const p of projectPages) {
        projMap[p.id] = { id: p.id, name: p.properties?.['Project Name']?.title?.[0]?.plain_text ?? p.id };
      }
    } catch {
      await Promise.all([...projIdSet].map(async id => {
        const page = await fetchPage(id);
        if (page) projMap[id] = { id, name: page.properties?.['Project Name']?.title?.[0]?.plain_text ?? id };
      }));
    }

    const enriched = variations.map(v => {
      const fromTasks     = [...(variationToItemIds[v.id] ?? new Set())];
      const uniqueItemIds = fromTasks.length > 0 ? fromTasks : (v.legacyItemId ? [v.legacyItemId] : []);
      const items         = uniqueItemIds.map(iid => itemInfoMap[iid]).filter(Boolean);
      const itemNames     = items.map(i => i.name).filter(Boolean);
      const itemIds       = uniqueItemIds.filter(id => itemInfoMap[id]);
      const resolvedProjId = v.projectId ?? items[0]?.projectId ?? null;
      const allProjectIds  = [...new Set(items.map(i => i.projectId).filter(Boolean))];
      if (resolvedProjId && !allProjectIds.includes(resolvedProjId)) allProjectIds.unshift(resolvedProjId);
      return {
        id: v.id, varNumber: v.varNumber, title: v.title,
        statusValues: v.statusValues, status: v.statusValues[0] ?? null,
        type: v.type, typeColor: v.typeColor, dateIssued: v.dateIssued,
        projectId:   resolvedProjId,
        projectName: resolvedProjId ? (projMap[resolvedProjId]?.name ?? null) : null,
        itemIds, itemNames, itemId: itemIds[0] ?? null, itemName: itemNames[0] ?? null,
      };
    });

    enriched.sort((a, b) => {
      const p = (a.projectName ?? '').localeCompare(b.projectName ?? '');
      return p !== 0 ? p : (a.varNumber ?? 0) - (b.varNumber ?? 0);
    });

    console.log(`[variations] done in ${Date.now() - startedAt}ms — ${enriched.length} items`);
    const result = { items: enriched, configured: true, statusColorMap };
    setCached(cacheKey, result, 5 * 60 * 1000);
    res.json(result);
  } catch (err) {
    console.error('[variations]', err.message);
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ── GET /api/tdl?ids=id1,id2,... ─────────────────────────────────────────────
// Returns To-Do List items, optionally filtered to a comma-separated list of IDs.
app.get('/api/tdl', async (req, res) => {
  if (!notionRequired(res)) return;
  const ids = req.query.ids ? req.query.ids.split(',').filter(Boolean) : null;

  try {
    let filter;
    if (ids && ids.length > 0) {
      filter = ids.length === 1
        ? { property: 'Item', relation: { contains: ids[0] } }
        : { or: ids.map(id => ({ property: 'Item', relation: { contains: id } })) };
    }

    const pages = await queryAll(DB.todo, filter);
    const items = pages.map(p => ({
      id:          p.id,
      tdlId:       p.properties['ID']?.unique_id?.number        ?? null,
      description: p.properties['Item Description']?.title?.[0]?.plain_text ?? null,
      status:      p.properties['Status']?.status?.name         ?? null,
      assignee:    p.properties['Assigned To']?.people?.[0]?.name ?? null,
      date:        p.properties['Start Date']?.date?.start       ?? null,
      category:    p.properties['Task Category']?.select?.name   ?? null,
    }));
    res.json(items);
  } catch (err) {
    console.error('[tdl]', err.message);
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ── POST /api/quick-log/todo ──────────────────────────────────────────────────
app.post('/api/quick-log/todo', async (req, res) => {
  if (!notionRequired(res)) return;
  const { description, itemId, assignee, category, date } = req.body;

  if (!description) {
    return res.status(400).json({ error: 'description is required' });
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const r = await fetchNotion(`${NOTION_API}/pages`, {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify({
        parent: { database_id: DB.todo },
        properties: {
          'Item Description': { title: [{ text: { content: description } }] },
          'Start Date': { date: { start: date || today } },
          ...(itemId   && { 'Item':          { relation: [{ id: itemId }] } }),
          ...(assignee && { 'Assigned To':   { people:   [{ id: assignee }] } }),
          ...(category && { 'Task Category': { select:   { name: category } } }),
        },
      }),
    });
    if (!r.ok) { const t = await r.text(); throw new Error(`${r.status} ${t.slice(0,200)}`); }
    const page = await r.json();
    res.json({ id: page.id, url: page.url });
  } catch (err) {
    console.error('[quick-log/todo]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/quick-log/rfi ───────────────────────────────────────────────────
app.post('/api/quick-log/rfi', async (req, res) => {
  if (!notionRequired(res)) return;
  const { description, subject, projectId, date } = req.body;
  const content = subject || description;

  if (!content) {
    return res.status(400).json({ error: 'subject / description is required' });
  }

  try {
    const r = await fetchNotion(`${NOTION_API}/pages`, {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify({
        parent: { database_id: DB.rfis },
        properties: {
          'Name': { title: [{ text: { content } }] },
          ...(date && { 'Date': { date: { start: date } } }),
        },
      }),
    });
    if (!r.ok) { const t = await r.text(); throw new Error(`${r.status} ${t.slice(0,200)}`); }
    const page = await r.json();
    res.json({ id: page.id, url: page.url });
  } catch (err) {
    console.error('[quick-log/rfi]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/quick-log/production ───────────────────────────────────────────
app.post('/api/quick-log/production', async (req, res) => {
  if (!notionRequired(res)) return;
  const { taskId, targetDate, notes, itemId } = req.body;

  if (taskId || itemId) {
    try {
      const pageId = taskId || itemId;
      const r = await fetchNotion(`${NOTION_API}/pages/${pageId}`, {
        method: 'PATCH',
        headers: notionHeaders(),
        body: JSON.stringify({
          properties: {
            'Drawing Progress': { status: { name: 'Pre-Production' } },
            ...(targetDate && { 'Production Date': { date: { start: targetDate } } }),
            ...(notes && { 'Notes': { rich_text: [{ text: { content: notes } }] } }),
          },
        }),
      });
      if (!r.ok) { const t = await r.text(); throw new Error(`${r.status} ${t.slice(0,200)}`); }
      return res.json({ updated: pageId });
    } catch (err) {
      console.error('[quick-log/production]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    const r = await fetchNotion(`${NOTION_API}/pages`, {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify({
        parent: { database_id: DB.todo },
        properties: {
          'Item Description': { title: [{ text: { content: notes || 'Schedule production' } }] },
          'Task Category': { select: { name: 'Other' } },
          ...(targetDate && { 'Start Date': { date: { start: targetDate } } }),
        },
      }),
    });
    if (!r.ok) { const t = await r.text(); throw new Error(`${r.status} ${t.slice(0,200)}`); }
    const page = await r.json();
    res.json({ id: page.id, url: page.url });
  } catch (err) {
    console.error('[quick-log/production]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/drawings-register/items?projectId=xxx ───────────────────────────
// Returns items scoped to a project — filtered query, never times out.
app.get('/api/drawings-register/items', async (req, res) => {
  if (!notionRequired(res)) return;
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId is required' });
  try {
    const filter = { property: 'Projects', relation: { contains: projectId } };
    const pages  = await queryAll(DB.tasks, filter);
    const items  = pages.map(p => ({
      id:        p.id,
      name:      p.properties['Item Name']?.title?.[0]?.plain_text ?? null,
      status:    p.properties['Drawing Progress']?.status?.name    ?? null,
      projectId,
    }));
    res.json(items);
  } catch (err) {
    console.error('[drawings-register/items]', err.message);
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ── GET /api/drawings-register/chunk?itemIds=id1,id2,... ─────────────────────
// Returns drawings filtered by a set of item IDs (OR filter). Called in parallel
// chunks from the frontend so no single request exceeds the timeout budget.
app.get('/api/drawings-register/chunk', async (req, res) => {
  if (!notionRequired(res)) return;
  const itemIds = (req.query.itemIds ?? '').split(',').filter(Boolean);
  if (!itemIds.length) return res.json([]);
  try {
    const filter = itemIds.length === 1
      ? { property: 'Item', relation: { contains: itemIds[0] } }
      : { or: itemIds.map(id => ({ property: 'Item', relation: { contains: id } })) };
    const pages = await queryAll(DB.drawings, filter);
    res.json(pages.map(transformDrawing));
  } catch (err) {
    console.error('[drawings-register/chunk]', err.message);
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ── GET /api/drawings-register ────────────────────────────────────────────────
// Returns all drawings from MDS DB enriched with item name, item status, project.
app.get('/api/drawings-register', async (req, res) => {
  if (!notionRequired(res)) return;

  try {
    const pages = await queryAll(DB.drawings, null, {
      sorts: [{ property: 'Drawing Number', direction: 'ascending' }],
    });

    // Collect unique item IDs
    const itemIdSet = new Set();
    for (const p of pages) {
      for (const r of (p.properties?.['Item']?.relation ?? [])) itemIdSet.add(r.id);
    }

    // Fetch item pages for names/status/projectId
    const itemIds = [...itemIdSet];
    const itemMap = {};
    const projPromises = {};
    const BATCH = 25;
    for (let i = 0; i < itemIds.length; i += BATCH) {
      const chunk = itemIds.slice(i, i + BATCH);
      const pages2 = await Promise.all(chunk.map(id =>
        fetchNotion(`${NOTION_API}/pages/${id}`, { headers: notionHeaders() })
          .then(r => r.ok ? r.json() : null).catch(() => null)
      ));
      for (let j = 0; j < chunk.length; j++) {
        const id = chunk[j]; const page = pages2[j];
        if (!page) continue;
        const p2 = page.properties ?? {};
        const projectPageId = p2['Projects']?.relation?.[0]?.id ?? null;
        itemMap[id] = {
          name: p2['Item Name']?.title?.[0]?.plain_text ?? null,
          status: p2['Drawing Progress']?.status?.name ?? null,
          projectPageId,
        };
        if (projectPageId && !projPromises[projectPageId]) {
          projPromises[projectPageId] = fetchNotion(`${NOTION_API}/pages/${projectPageId}`, { headers: notionHeaders() })
            .then(r => r.ok ? r.json() : null).catch(() => null);
        }
      }
    }

    const projMap = {};
    await Promise.all(Object.entries(projPromises).map(async ([id, promise]) => {
      const page = await promise;
      if (!page) return;
      projMap[id] = { id, name: page.properties?.['Project Name']?.title?.[0]?.plain_text ?? null };
    }));

    const drawings = pages.map(p => {
      const base = transformDrawing(p);
      const itemPageId = base.itemIds[0] ?? null;
      const item = itemMap[itemPageId] ?? {};
      const proj = item.projectPageId ? projMap[item.projectPageId] : null;
      return { ...base, itemId: itemPageId, itemName: item.name ?? null, itemStatus: item.status ?? null, projectId: proj?.id ?? null, projectName: proj?.name ?? null };
    });

    res.json(drawings);
  } catch (err) {
    console.error('[drawings-register]', err.message);
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ── Field map shared by update routes ─────────────────────────────────────────
const DWG_FIELD_MAP = {
  s4SubmitActual: { notion: 'S4 Submit Date (Actual)', type: 'date' },
  s4StatusDate:   { notion: 'S4 Status Date (Actual)', type: 'date' },
  s4Status:       { notion: 'S4 Status (LOR)',          type: 'select' },
  s5SubmitActual: { notion: 'S5 Submit Date (Actual)', type: 'date' },
  s5StatusDate:   { notion: 'S5 Status Date (Actual)', type: 'date' },
  s5Status:       { notion: 'S5 Status (F&P)',          type: 'select' },
};
function buildDwgProps(fields) {
  const props = {};
  for (const [key, value] of Object.entries(fields)) {
    const m = DWG_FIELD_MAP[key]; if (!m) continue;
    props[m.notion] = m.type === 'date'
      ? (value ? { date: { start: value } } : { date: null })
      : (value ? { select: { name: value } } : { select: null });
  }
  return props;
}

// ── POST /api/drawings-register/update ────────────────────────────────────────
app.post('/api/drawings-register/update', async (req, res) => {
  if (!notionRequired(res)) return;
  const { id, fields } = req.body;
  if (!id || !fields) return res.status(400).json({ error: 'id and fields are required' });

  const properties = buildDwgProps(fields);
  if (!Object.keys(properties).length) return res.status(400).json({ error: 'No valid fields' });

  try {
    const r = await fetchNotion(`${NOTION_API}/pages/${id}`, {
      method: 'PATCH', headers: notionHeaders(), body: JSON.stringify({ properties }),
    });
    if (!r.ok) { const t = await r.text(); throw new Error(`${r.status} ${t.slice(0, 200)}`); }
    res.json({ ok: true });
  } catch (err) {
    console.error('[drawings-register/update]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/drawings-register/bulk ─────────────────────────────────────────
app.post('/api/drawings-register/bulk', async (req, res) => {
  if (!notionRequired(res)) return;
  const { updates } = req.body;
  if (!Array.isArray(updates) || !updates.length) return res.status(400).json({ error: 'updates array required' });

  const tasks = updates.map(({ id, fields }) => async () => {
    if (!id || !fields) return { id, ok: false, error: 'missing id or fields' };
    const properties = buildDwgProps(fields);
    if (!Object.keys(properties).length) return { id, ok: false, error: 'no valid fields' };
    const r = await fetchNotion(`${NOTION_API}/pages/${id}`, {
      method: 'PATCH', headers: notionHeaders(), body: JSON.stringify({ properties }),
    });
    if (!r.ok) { const t = await r.text(); throw new Error(`${r.status} ${t.slice(0, 100)}`); }
    return { id, ok: true };
  });

  try {
    const results = [];
    for (let i = 0; i < tasks.length; i += 10) {
      const settled = await Promise.allSettled(tasks.slice(i, i + 10).map(t => t()));
      for (const s of settled) results.push(s.status === 'fulfilled' ? s.value : { ok: false, error: s.reason?.message });
    }
    const failed = results.filter(r => !r.ok);
    res.status(failed.length === 0 ? 200 : 207).json({ ok: !failed.length, results, failed });
  } catch (err) {
    console.error('[drawings-register/bulk]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tasks/update ────────────────────────────────────────────────────
app.post('/api/tasks/update', async (req, res) => {
  if (!notionRequired(res)) return
  const { id, description, subTaskHours, taskCategory, changeTask, taskDone, itemId, startDate, endDate, noClientApproval, dd1, constrDrawDays } = req.body
  if (!id) return res.status(400).json({ error: 'id is required' })
  const properties = {}
  if (description  !== undefined && description !== null)
    properties['Item Description'] = { title: [{ text: { content: String(description) } }] }
  if (subTaskHours !== undefined)
    properties['Sub Task Hours'] = subTaskHours !== null ? { number: Number(subTaskHours) } : { number: null }
  if (taskCategory !== undefined)
    properties['Task Category'] = taskCategory ? { select: { name: taskCategory } } : { select: null }
  if (changeTask   !== undefined)
    properties['Change Task'] = { checkbox: Boolean(changeTask) }
  if (taskDone     !== undefined)
    properties['Task Done'] = { checkbox: Boolean(taskDone) }
  if (itemId       !== undefined)
    properties['Item'] = itemId ? { relation: [{ id: itemId }] } : { relation: [] }
  if (startDate    !== undefined)
    properties['Start Date'] = startDate ? { date: { start: startDate } } : { date: null }
  if (endDate      !== undefined)
    properties['End Date'] = endDate ? { date: { start: endDate } } : { date: null }
  if (noClientApproval !== undefined)
    properties['No Client Approval'] = { checkbox: Boolean(noClientApproval) }
  if (dd1 !== undefined)
    properties['Draw Days - DD1']  = { number: dd1 == null ? null : Number(dd1) }
  if (constrDrawDays !== undefined)
    properties['Draw Days - DD-C'] = { number: constrDrawDays == null ? null : Number(constrDrawDays) }
  try {
    const r = await fetchNotion(`${NOTION_API}/pages/${id}`, {
      method: 'PATCH', headers: notionHeaders(), body: JSON.stringify({ properties }),
    })
    if (!r.ok) { const t = await r.text(); throw new Error(`${r.status} ${t.slice(0, 200)}`) }
    res.json({ ok: true })
  } catch (err) {
    console.error('[task-update]', err.message)
    res.status(err.status ?? 500).json({ error: err.message })
  }
})

// ── GET /api/finishes-schedule ────────────────────────────────────────────────
// Schema (confirmed): CAD Ref=title, APPROVED=select, Spec Ref=multi_select,
// Items=relation, Suffix=rollup, Submitted on=date (lowercase o),
// Face Material=text, Sheen (%)=text, Lipping=text, Finish Info=text
app.get('/api/finishes-schedule', async (req, res) => {
  if (!notionRequired(res)) return;

  const dbId = process.env.NOTION_DB_FINISHES;
  if (!dbId) return res.json({ configured: false, items: [] });

  // Local helpers
  const rt = (p, k) => p[k]?.rich_text?.map(t => t.plain_text).join('') || null;
  const rollupTxt = (p, k) => {
    const prop = p[k];
    if (!prop || prop.type !== 'rollup') return null;
    if (prop.rollup?.type === 'array') {
      return prop.rollup.array.map(item => {
        if (item.type === 'rich_text') return item.rich_text?.map(t => t.plain_text).join('');
        if (item.type === 'title')     return item.title?.map(t => t.plain_text).join('');
        if (item.type === 'select')    return item.select?.name;
        return null;
      }).filter(Boolean).join(', ') || null;
    }
    if (prop.rollup?.type === 'number') return String(prop.rollup.number ?? '');
    return null;
  };
  // Spec Ref is now a multi_select property
  const multiSelect = (p, k) => p[k]?.multi_select?.map(o => o.name) ?? [];

  try {
    const pages = await queryAll(dbId, null, {
      sorts: [{ property: 'CAD Ref', direction: 'ascending' }],
    });

    // ── Resolve Item names from relation ──────────────────────────────────────
    const allItemIds = [...new Set(
      pages.flatMap(page => (page.properties['Items']?.relation ?? []).map(r => r.id))
    )];
    const itemNameMap = new Map();
    await Promise.all(allItemIds.slice(0, 150).map(async id => {
      try {
        const r = await fetchNotion(`${NOTION_API}/pages/${id}`, { headers: notionHeaders() });
        if (r.ok) {
          const pg = await r.json();
          const titleProp = Object.values(pg.properties || {}).find(p => p.type === 'title');
          const name = titleProp?.title?.[0]?.plain_text ?? null;
          if (name) itemNameMap.set(id, name);
        }
      } catch { /* skip failed lookups */ }
    }));

    const items = pages.map(page => {
      const p = page.properties;

      // Item names from relation
      const itemIds   = (p['Items']?.relation ?? []).map(r => r.id);
      const itemNames = itemIds.map(id => itemNameMap.get(id)).filter(Boolean);

      // Finish Description — consolidate confirmed field names with ' | ' separator
      const materialType    = rt(p, 'Material Type');
      const faceMaterial    = rt(p, 'Face Material');
      const fireRating      = rt(p, 'Fire Rating');
      const core            = rt(p, 'Core');
      const matchingPattern = rt(p, 'Matching Pattern');
      const brand           = rt(p, 'Brand');
      const supplier        = rt(p, 'Supplier');
      const productCode     = rt(p, 'Product Code');
      const finish          = rt(p, 'Finish');
      const sheen           = rt(p, 'Sheen (%)');
      const lipping         = rt(p, 'Lipping');

      // Default order — frontend may override for display, but this drives CSV
      const finishDescription = [
        materialType, supplier, brand, faceMaterial, core,
        finish, productCode, matchingPattern, fireRating, sheen, lipping,
      ].filter(Boolean).join(' | ') || null;

      return {
        id:                  page.id,
        itemNames,
        itemIds,
        projectId:           relIds(p, 'Project')[0] ?? null,
        cadRef:              titleVal(p, 'CAD Ref'),
        specRef:             multiSelect(p, 'Spec Ref'),  // multi_select → array of strings
        finishDescription,
        materialType,
        faceMaterial,
        fireRating,
        core,
        matchingPattern,
        brand,
        supplier,
        productCode,
        finish,
        sheen,
        lipping,
        sampleRef:           rt(p, 'Sample Ref'),
        sampleType:          selectVal(p, 'Sample Type'),
        suffix:              rollupTxt(p, 'Suffix'),
        approved:            selectVal(p, 'APPROVED'),   // "A"|"B"|"C"|"Awaiting Approval"|"Not Submitted"
        actionRequired:      selectVal(p, 'Action Required'),
        submittedOn:         dateVal(p, 'Submitted on'), // lowercase 'on'
        specClass:           rt(p, 'Spec Class'),
        notes:               rt(p, 'Notes'),
        cuttingListRequired: false, // property not yet in Notion schema
      };
    });

    res.json({ configured: true, items });
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Notion API timed out — try again' });
    console.error('[finishes-schedule]', err.message);
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, notion: !!process.env.NOTION_TOKEN });
});

app.listen(PORT, () => {
  console.log(`DM Tracker server running on http://localhost:${PORT}`);
  if (!process.env.NOTION_TOKEN) console.warn('  ⚠  NOTION_TOKEN not set — API will return 503');
});
