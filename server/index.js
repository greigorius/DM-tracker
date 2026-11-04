// Local dev server for the Axiom DL Hub. Serves the same hub-core API as the
// Netlify functions (api-read / api-write) on http://localhost:3001; Vite
// proxies /api here. The snapshot lives in .cache/blobs and is refreshed every
// 5 minutes while this runs, or on demand with `npm run sync`.
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();
process.env.HUB_STORE ||= 'file';

const { dispatch } = await import('../hub-core/routes.js');
const { readRoutes } = await import('../hub-core/routes-read.js');
const { writeRoutes } = await import('../hub-core/routes-write.js');

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true, notion: !!process.env.NOTION_TOKEN }));

app.use(async (req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  const query = new URL(req.originalUrl, 'http://local').searchParams;
  const out = await dispatch([...readRoutes, ...writeRoutes], { method: req.method, pathname: req.path, query, body: req.body });
  if (!out) return res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
  res.status(out.status).json(out.json);
});

if (process.env.NOTION_TOKEN && process.env.HUB_LOCAL_SYNC !== 'off') {
  const { runSync } = await import('../hub-core/sync.js');
  const tick = () => runSync({ budgetMs: 10 * 60_000 })
    .then(r => console.log(`[sync] ${r.results.map(x => `${x.db}:${x.error ? 'ERR ' + x.error : (x.full ? 'full ' : '') + x.changed}`).join('  ')} (${r.ms} ms)`))
    .catch(e => console.error('[sync]', e.message));
  setTimeout(tick, 1000);
  setInterval(tick, 5 * 60_000);
}

app.listen(PORT, () => {
  console.log(`Axiom DL Hub API on http://localhost:${PORT}`);
  if (!process.env.NOTION_TOKEN) console.warn('  NOTION_TOKEN not set: reads serve the last snapshot, writes and sync are off');
});
