/**
 * App-wide in-memory cache with localStorage backup.
 *
 * In-memory cache:  survives page navigations (no repeated fetches)
 * localStorage:     survives hard reloads (cold-start UX)
 * TTL: 5 minutes
 */
const TTL = 5 * 60 * 1000;

// Module-level map — lives for the entire browser session
const memCache = new Map();

export function getCached(key) {
  // 1. Check memory first (fastest, no serialisation cost)
  const mem = memCache.get(key);
  if (mem && Date.now() - mem.ts < TTL) return mem.data;

  // 2. Fall back to localStorage for hard-reload persistence
  try {
    const entry = JSON.parse(localStorage.getItem(`dmtracker:${key}`));
    if (entry && Date.now() - entry.ts < TTL) {
      memCache.set(key, entry); // promote to memory
      return entry.data;
    }
  } catch {}
  return null;
}

export function setCached(key, data) {
  const entry = { ts: Date.now(), data };
  memCache.set(key, entry);
  try {
    localStorage.setItem(`dmtracker:${key}`, JSON.stringify(entry));
  } catch {}
}

export function clearCached(key) {
  memCache.delete(key);
  try { localStorage.removeItem(`dmtracker:${key}`); } catch {}
}

export function clearAllCached() {
  memCache.clear();
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('dmtracker:'))
      .forEach(k => localStorage.removeItem(k));
  } catch {}
}
