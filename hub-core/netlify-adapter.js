// Adapts a Web Request (Netlify Functions v2) to the hub-core route tables.
import { dispatch } from './routes.js';

export async function handle(routes, req, { cache = false } = {}) {
  const url = new URL(req.url);
  let body = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try { body = await req.json(); } catch { body = null; }
  }
  const out = (await dispatch(routes, { method: req.method, pathname: url.pathname, query: url.searchParams, body }))
    || { status: 404, json: { error: `No route for ${req.method} ${url.pathname}` } };
  return new Response(JSON.stringify(out.json), {
    status: out.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache && out.status === 200 ? 'private, max-age=0, must-revalidate' : 'no-store',
    },
  });
}
