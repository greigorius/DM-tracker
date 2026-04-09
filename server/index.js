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
      status:  p.properties['Status']?.status?.name   ?? null,
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

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, notion: !!process.env.NOTION_TOKEN });
});

app.listen(PORT, () => {
  console.log(`DM Tracker server running on http://localhost:${PORT}`);
  if (!process.env.NOTION_TOKEN) console.warn('  ⚠  NOTION_TOKEN not set — API will return 503');
});
