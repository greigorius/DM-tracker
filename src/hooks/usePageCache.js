/**
 * Simple localStorage cache helpers with TTL.
 * TTL: 5 minutes.
 */
const TTL = 5 * 60 * 1000;

export function getCached(key) {
  try {
    const entry = JSON.parse(localStorage.getItem(`dmtracker:${key}`));
    if (entry && Date.now() - entry.ts < TTL) return entry.data;
  } catch {}
  return null;
}

export function setCached(key, data) {
  try {
    localStorage.setItem(`dmtracker:${key}`, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}
