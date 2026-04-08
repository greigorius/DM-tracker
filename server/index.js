import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Client } from '@notionhq/client';
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

app.use(cors());
app.use(express.json());

// ── Notion client (only active when NOTION_TOKEN is set) ──────────────────────
const notion = process.env.NOTION_TOKEN
  ? new Client({ auth: process.env.NOTION_TOKEN })
  : null;

function notionRequired(res) {
  if (!notion) {
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

  const PROJECT_FILTER_PROPERTIES = [
    'title', 'bFja', 'BE_g', '_yYv', '%3DBGA', 'mkNI',
  ];

  try {
    const pages = [];
    let startCursor;

    do {
      const response = await notion.databases.query({
        database_id:       DB.projects,
        start_cursor:      startCursor,
        filter_properties: PROJECT_FILTER_PROPERTIES,
        filter: {
          and: [
            { property: 'Status', status: { does_not_equal: 'Complete' } },
            { property: 'Status', status: { does_not_equal: 'Done' } },
          ],
        },
        sorts: [{ property: 'Start Date', direction: 'descending' }],
      });
      pages.push(...response.results);
      startCursor = response.has_more ? response.next_cursor : undefined;
    } while (startCursor);

    // Enrich with client names
    const clientIds = [...new Set(
      pages.map(p => p.properties['Client']?.relation?.[0]?.id).filter(Boolean)
    )];
    const clientMap = {};
    await Promise.all(clientIds.map(async id => {
      try {
        const page = await notion.pages.retrieve({ page_id: id });
        clientMap[id] = page.properties['Company']?.title?.[0]?.plain_text ?? null;
      } catch { clientMap[id] = null; }
    }));

    const enriched = pages.map(p => ({
      id:     p.id,
      name:   p.properties['Project Name']?.title?.[0]?.plain_text ?? p.id,
      status: p.properties['Status']?.status?.name ?? null,
      client: clientMap[p.properties['Client']?.relation?.[0]?.id] ?? null,
      progress: p.properties['_yYv']?.formula?.number ?? null,
      hoursRequired: p.properties['%3DBGA']?.rollup?.number ?? null,
      hoursSpent:    p.properties['mkNI']?.rollup?.number   ?? null,
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

// ── GET /api/projects/:id/timeline ────────────────────────────────────────────
// Two-phase: phase=tasks (fast) then phase=all (adds drawings).
app.get('/api/projects/:id/timeline', async (req, res) => {
  if (!notionRequired(res)) return;
  const { id }     = req.params;
  const phase      = req.query.phase ?? 'tasks';
  const forceRefresh = req.query.refresh === '1';

  if (forceRefresh) {
    deleteCached(`tasks:${id}`);
    deleteCached(`timeline:${id}`);
  }

  try {
    // Fast path: full cache hit
    const fullCached = getCached(`timeline:${id}`);
    if (fullCached) return res.json(fullCached);

    if (phase === 'tasks') {
      const taskPages = await fetchTaskPages(id);
      const items     = taskPages.map(p => transformTask(p, []));
      return res.json({ items, phase: 'tasks' });
    }

    // phase=all: tasks + drawings
    const taskPages  = await fetchTaskPages(id);
    const taskIds    = taskPages.map(p => p.id);
    const drawingMap = await fetchDrawingMap(taskIds);
    const items      = taskPages.map(p => transformTask(p, drawingMap.get(p.id) ?? []));
    const result     = { items };

    setCached(`timeline:${id}`, result, 5 * 60 * 1000);
    res.json(result);
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Notion API timed out — try again in a moment' });
    }
    console.error('[timeline]', err.message);
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
        ? { property: 'Related Item', relation: { contains: ids[0] } }
        : { or: ids.map(id => ({ property: 'Related Item', relation: { contains: id } })) };
    }

    const pages = await queryAll(DB.todo, filter);
    const items = pages.map(p => ({
      id:          p.id,
      name:        p.properties['Name']?.title?.[0]?.plain_text ?? null,
      status:      p.properties['Status']?.status?.name         ?? null,
      assignee:    p.properties['Assignee']?.rich_text?.[0]?.plain_text ?? null,
      date:        p.properties['Date']?.date?.start            ?? null,
      category:    p.properties['Category']?.select?.name       ?? null,
      dmPhase:     p.properties['DM Phase']?.select?.name       ?? null,
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
  const { description, projectId, itemId, assignee, dmPhase, date, type } = req.body;

  if (!description) {
    return res.status(400).json({ error: 'description is required' });
  }

  try {
    const page = await notion.pages.create({
      parent: { database_id: DB.todo },
      properties: {
        'Name': { title: [{ text: { content: description } }] },
        ...(date && { 'Date': { date: { start: date } } }),
        ...(dmPhase && { 'DM Phase': { select: { name: dmPhase } } }),
        ...(type && { 'Category': { select: { name: type } } }),
        ...(assignee && { 'Assignee': { rich_text: [{ text: { content: assignee } }] } }),
      },
    });
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
    const page = await notion.pages.create({
      parent: { database_id: DB.rfis },
      properties: {
        'Name': { title: [{ text: { content } }] },
        ...(date && { 'Date': { date: { start: date } } }),
      },
    });
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
      await notion.pages.update({
        page_id: pageId,
        properties: {
          'Status': { status: { name: 'Pre-Production' } },
          ...(targetDate && { 'Production Date': { date: { start: targetDate } } }),
          ...(notes && { 'Notes': { rich_text: [{ text: { content: notes } }] } }),
        },
      });
      return res.json({ updated: pageId });
    } catch (err) {
      console.error('[quick-log/production]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    const page = await notion.pages.create({
      parent: { database_id: DB.todo },
      properties: {
        'Name': { title: [{ text: { content: notes || 'Schedule production' } }] },
        'Category': { select: { name: 'Production' } },
        ...(targetDate && { 'Date': { date: { start: targetDate } } }),
      },
    });
    res.json({ id: page.id, url: page.url });
  } catch (err) {
    console.error('[quick-log/production]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, notion: !!notion });
});

app.listen(PORT, () => {
  console.log(`DM Tracker server running on http://localhost:${PORT}`);
  if (!notion) console.warn('  ⚠  NOTION_TOKEN not set — /api/quick-log/* will return 503');
});
