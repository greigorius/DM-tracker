// Thin fetch wrapper for the Hub API. Components never call fetch directly;
// they go through the hooks in src/hooks/hub.js.

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(path, {
    method,
    signal,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(json?.error || `${method} ${path} failed (${res.status})`, res.status);
  return json;
}
