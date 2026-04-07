import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Client } from '@notionhq/client';

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

// Safely read a Notion DB id from env
const DB = {
  todo:       process.env.NOTION_DB_TODO,
  rfis:       process.env.NOTION_DB_RFIS,
  tasks:      process.env.NOTION_DB_TASKS,
  projects:   process.env.NOTION_DB_PROJECTS,
  drawings:   process.env.NOTION_DB_DRAWINGS,
};

// ── POST /api/quick-log/todo ──────────────────────────────────────────────────
// Creates a page in the TODO database.
// Body: { description, projectId, itemId, assignee, dmPhase, date, category, type }
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
        // "Name" is the standard Notion title property — adjust if your DB uses a different name
        'Name': {
          title: [{ text: { content: description } }],
        },
        // Optional properties — only included when values are present.
        // Property names must match your actual Notion database schema.
        ...(date && {
          'Date': { date: { start: date } },
        }),
        ...(dmPhase && {
          'DM Phase': { select: { name: dmPhase } },
        }),
        ...(type && {
          'Category': { select: { name: type } },
        }),
        ...(assignee && {
          'Assignee': { rich_text: [{ text: { content: assignee } }] },
        }),
      },
    });
    res.json({ id: page.id, url: page.url });
  } catch (err) {
    console.error('[quick-log/todo]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/quick-log/rfi ───────────────────────────────────────────────────
// Creates a page in the RFI database.
// Body: { subject, projectId, itemId, date }
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
        'Name': {
          title: [{ text: { content } }],
        },
        ...(date && {
          'Date': { date: { start: date } },
        }),
      },
    });
    res.json({ id: page.id, url: page.url });
  } catch (err) {
    console.error('[quick-log/rfi]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/quick-log/production ───────────────────────────────────────────
// Updates a task's status to trigger production scheduling.
// Body: { taskId, targetDate, notes, projectId, itemId }
app.post('/api/quick-log/production', async (req, res) => {
  if (!notionRequired(res)) return;
  const { taskId, targetDate, notes, itemId } = req.body;

  // If a taskId is provided, update that task's status
  if (taskId || itemId) {
    try {
      const pageId = taskId || itemId;
      await notion.pages.update({
        page_id: pageId,
        properties: {
          'Status': { status: { name: 'Pre-Production' } },
          ...(targetDate && {
            'Production Date': { date: { start: targetDate } },
          }),
          ...(notes && {
            'Notes': { rich_text: [{ text: { content: notes } }] },
          }),
        },
      });
      return res.json({ updated: pageId });
    } catch (err) {
      console.error('[quick-log/production]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // Fallback: create a new TODO entry tagged as production
  try {
    const page = await notion.pages.create({
      parent: { database_id: DB.todo },
      properties: {
        'Name': {
          title: [{ text: { content: notes || 'Schedule production' } }],
        },
        'Category': { select: { name: 'Production' } },
        ...(targetDate && {
          'Date': { date: { start: targetDate } },
        }),
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
