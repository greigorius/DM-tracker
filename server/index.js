import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  getCached, setCached, deleteCached,
  fetchNotion, notionHeaders, getSchemaIds, queryAll,
  transformItem, transformTask, transformDrawing,
  fetchTaskPages, fetchDrawingMap, transformRFI,
  titleVal, statusVal, selectVal, personVal, checkVal, dateVal, relCount, relIds,
} from './notionHelpers.js';

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3001;
const NOTION_API = 'https://api.notion.com/v1';

app.use(cors());
app.use(express.json());

function notionRequired(res) {
  if (!process.env.NOTION_TOKEN) {
    res.status(503).json({ error: 'NOTION_TOKEN not configured' });
    return false;
  }
  return true;
}

const DB = {
  todo:     process.env.NOTION_DB_TODO,
  rfis:     process.env.NOTION_DB_RFIS,
  tasks:    process.env.NOTION_DB_TASKS,
  projects: process.env.NOTION_DB_PROJECTS,
  drawings: process.env.NOTION_DB_DRAWINGS,
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
      status:        (p.properties['Item Status'] ?? p.properties['Status'])?.status?.name                  ?? null,
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
      const COMPLETE = ['PC Approved', 'In Manufacture', 'Complete', 'Omitted', 'Design Complete', 'Close Out', 'On Site'];
      if (status === 'active')   items = items.filter(i => !COMPLETE.includes(i.status));
      else if (status === 'complete') items = items.filter(i => ['PC Approved', 'In Manufacture', 'Complete', 'Design Complete', 'Close Out', 'On Site'].includes(i.status));
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
    const COMPLETE = new Set(['PC Approved', 'In Manufacture', 'Complete', 'Omitted', 'Design Complete', 'Close Out', 'On Site']);
    const items = pages.map(p => ({
      status:  (p.properties['Item Status'] ?? p.properties['Status'])?.status?.name   ?? null,
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
      status:      (p.properties['Item Status'] ?? p.properties['Status'])?.status?.name         ?? null,
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
            'Status': { status: { name: 'Pre-Production' } },
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
      status:    (p.properties['Item Status'] ?? p.properties['Status'])?.status?.name              ?? null,
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
          status: (p2['Item Status'] ?? p2['Status'])?.status?.name ?? null,
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
  const { id, description, subTaskHours, taskCategory, changeTask, taskDone, itemId, startDate, endDate, noClientApproval } = req.body
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

// ── GET /api/schedule-items?projectId=<id> ────────────────────────────────────
// Returns projects + items for the Item Date Matrix.
// Only dtStart1Plan and actual dates from Notion — all other dates calculated
// client-side. Drawings DB queried for s4/s5 status dates + C01 sign-off.
app.get('/api/schedule-items', async (req, res) => {
  if (!notionRequired(res)) return;
  const { projectId } = req.query;

  function dtVal(props, key) { return props[key]?.date?.start ?? null; }

  function transformScheduleItem(page, pid) {
    const p    = page.properties ?? {};
    const name = p['Item Name']?.title?.[0]?.plain_text ?? '';
    return {
      id:               page.id,
      name,
      status:           (p['Item Status'] ?? p['Status'])?.status?.name              ?? null,
      projectId:        pid,
      noClientApproval: p['No Client Approval']?.checkbox      ?? false,
      dmPhase:          p['DM Phase']?.select?.name            ?? null,
      contractCategory: p['Contract Category']?.formula?.string
                     ?? (name.toLowerCase().includes('pcsa') ? 'PCSA' : 'Main Works'),

      // Only the 1st DT Start plan date — everything else calculated client-side
      dtStart1Plan:  dtVal(p, '1st DT Start (Plan)'),

      // Actual dates only (inputs to calcRow)
      dtStart1Act:   dtVal(p, '1st DT Start (Actual)'),
      del1ActDate:   dtVal(p, '1st DT Delivery (Actual)'),
      sub1ActDate:   dtVal(p, '1st Submission Date (Actual)'),
      dtStart2Act:   dtVal(p, '2nd DT Start (Actual)'),
      del2ActDate:   dtVal(p, '2nd DT Delivery (Actual)'),
      sub2ActDate:   dtVal(p, '2nd Submission Date (Actual)'),
      stCActDate:    dtVal(p, 'Constr. DT Start (Actual)'),
      delCActDate:   dtVal(p, 'Constr. DT Delivery (Actual)'),
      subCActDate:   dtVal(p, 'Constr. Submission Date (Actual)'),
    };
  }

  try {
    const [projectPages, taskPages] = await Promise.all([
      queryAll(DB.projects,
        { property: 'Status', status: { does_not_equal: 'Done' } },
        { sorts: [{ property: 'Start Date', direction: 'descending' }] },
      ),
      queryAll(DB.tasks,
        projectId
          ? { and: [
              { property: 'Projects', relation: { contains: projectId } },
              { property: 'Item Name', title: { does_not_contain: 'PCSA' } },
            ]}
          : { property: 'Item Name', title: { does_not_contain: 'PCSA' } },
        { sorts: [{ property: 'Item Name', direction: 'ascending' }] },
      ),
    ]);

    const projects = projectPages.map(p => ({
      id:                   p.id,
      name:                 p.properties['Project Name']?.title?.[0]?.plain_text ?? p.id,
      approvalDays:         p.properties['Approval Days']?.number          ?? null,
      revisionDays:         p.properties['Revision Days']?.number          ?? null,
      productionPrepPeriod: p.properties['Production Prep Period']?.number ?? null,
      qaDefault:            p.properties['QA Default Days']?.number        ?? null,
    }));

    const items = taskPages.map(page => {
      const pid = projectId ?? page.properties['Projects']?.relation?.[0]?.id ?? null;
      return transformScheduleItem(page, pid);
    });

    // Fetch drawing data for s4/s5 dates, statuses, and C01 sign-off
    const taskIds    = items.map(i => i.id);
    const drawingMap = await fetchDrawingMap(taskIds);

    for (const item of items) {
      const drawings = drawingMap.get(item.id) ?? [];
      const s4Dates  = drawings.map(drw => drw.s4StatusDate).filter(Boolean);
      const s5Dates  = drawings.map(drw => drw.s5StatusDate).filter(Boolean);
      const c01Dates = drawings.map(drw => drw.c01SignOff?.actual ?? drw.c01Submit?.actual).filter(Boolean);
      item.s4Date           = s4Dates.length  ? [...s4Dates].sort()[0]  : null;
      item.s5Date           = s5Dates.length  ? [...s5Dates].sort()[0]  : null;
      item.c01SignOffActDate = c01Dates.length ? [...c01Dates].sort()[0] : null;
      item.s4Statuses       = [...new Set(drawings.map(drw => drw.s4Status).filter(Boolean))];
      item.s5Statuses       = [...new Set(drawings.map(drw => drw.s5Status).filter(Boolean))];
    }

    res.json({ projects, items });
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Notion API timed out — try again' });
    console.error('[schedule-items]', err.message);
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
