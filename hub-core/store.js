// Blob store: Netlify Blobs in production, a JSON-file fallback locally.
// Both expose getJSON(key) / setJSON(key, value).

import { BLOB_STORE } from './config.js';

let storePromise = null;

async function makeNetlifyStore() {
  const { getStore } = await import('@netlify/blobs');
  // Strong consistency so a read straight after a write sees the patch. Some
  // function contexts don't support it ("…not been configured with a
  // 'uncachedEdgeURL' property"); reads then fall back to eventual consistency
  // for the rest of this instance instead of failing.
  const strong = getStore({ name: BLOB_STORE, consistency: 'strong' });
  const eventual = getStore({ name: BLOB_STORE });
  let useStrong = true;
  return {
    kind: 'netlify',
    async getJSON(key) {
      if (useStrong) {
        try { return await strong.get(key, { type: 'json' }); }
        catch (e) {
          if (!/uncachedEdgeURL|strong consistency/i.test(e.message || '')) throw e;
          console.warn('[hub-store] strong reads unavailable, using eventual consistency:', e.message);
          useStrong = false;
        }
      }
      return eventual.get(key, { type: 'json' });
    },
    setJSON: (key, value) => eventual.setJSON(key, value),
  };
}

async function makeFileStore() {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const root = path.resolve(process.env.HUB_CACHE_DIR || '.cache/blobs');
  const file = key => path.join(root, `${key.replace(/[^a-z0-9/_-]/gi, '_')}.json`);
  return {
    kind: 'file',
    async getJSON(key) {
      try { return JSON.parse(await fs.readFile(file(key), 'utf8')); }
      catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    async setJSON(key, value) {
      const f = file(key);
      await fs.mkdir(path.dirname(f), { recursive: true });
      const tmp = `${f}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(value));
      await fs.rename(tmp, f);
    },
  };
}

export function getHubStore() {
  if (!storePromise) {
    storePromise = (async () => {
      // The local Express server sets HUB_STORE=file; everywhere else try Blobs first.
      if (process.env.HUB_STORE !== 'file') {
        try { return await makeNetlifyStore(); }
        catch (e) { console.warn('[hub-store] Netlify Blobs unavailable, using file store:', e.message); }
      }
      return makeFileStore();
    })();
  }
  return storePromise;
}
