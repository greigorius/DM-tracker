// Framework-neutral dispatcher. Netlify functions and the local Express server
// both route through it, so behaviour is identical.

export async function dispatch(routes, { method, pathname, query, body }) {
  for (const [m, re, fn] of routes) {
    if (m !== method) continue;
    const match = pathname.match(re);
    if (!match) continue;
    try {
      return { status: 200, json: await fn({ query, body, params: match.slice(1) }) };
    } catch (err) {
      console.error(`[hub] ${method} ${pathname}:`, err.message);
      return { status: err.status || 500, json: { error: err.message } };
    }
  }
  return null;
}
