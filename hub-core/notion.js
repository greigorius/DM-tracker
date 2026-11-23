// Notion SDK access for sync and writes. Only api-write and sync import this.

import { Client } from '@notionhq/client';
import { DATA_SOURCES, GAP_MS, SCHEMA_VERSION } from './config.js';

let client = null;
export function notion() {
  if (!process.env.NOTION_TOKEN) throw Object.assign(new Error('NOTION_TOKEN not configured'), { status: 503 });
  if (!client) client = new Client({ auth: process.env.NOTION_TOKEN, timeoutMs: 20000, maxRetries: 0, ...(process.env.NOTION_BASE_URL && { baseUrl: process.env.NOTION_BASE_URL }) });
  return client;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Retry on 429 / 5xx with backoff (honours Retry-After when present).
export async function withRetry(fn, { tries = 5, base = 600 } = {}) {
  let attempt = 0;
  for (;;) {
    try { return await fn(); }
    catch (err) {
      const status = err.status ?? err.statusCode;
      const retryable = err.code === 'rate_limited' || status === 429 || status >= 500 || err.code === 'notionhq_client_request_timeout';
      attempt += 1;
      if (!retryable || attempt >= tries) throw err;
      const ra = Number(err.headers?.get?.('retry-after') ?? err.headers?.['retry-after']);
      await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : base * 2 ** (attempt - 1));
    }
  }
}

// Query every page of a data source, sequentially, with a gap between calls.
// `deadline` (ms epoch) aborts with err.code = 'deadline' so callers can resume.
export async function queryAllPages(db, { filter, deadline } = {}) {
  const pages = [];
  let cursor;
  do {
    if (deadline && Date.now() > deadline) throw Object.assign(new Error(`deadline reached while syncing ${db}`), { code: 'deadline' });
    const res = await withRetry(() => notion().dataSources.query({
      data_source_id: DATA_SOURCES[db],
      page_size: 100,
      ...(filter ? { filter } : {}),
      ...(cursor ? { start_cursor: cursor } : {}),
    }));
    pages.push(...res.results.filter(r => r.object === 'page'));
    cursor = res.has_more ? res.next_cursor : undefined;
    await sleep(GAP_MS);
  } while (cursor);
  return pages;
}

export async function retrieveSchemaOptions() {
  const cache = new Map();
  const opts = async (db, prop) => {
    if (!cache.has(db)) {
      cache.set(db, await withRetry(() => notion().dataSources.retrieve({ data_source_id: DATA_SOURCES[db] })));
      await sleep(GAP_MS);
    }
    const p = cache.get(db).properties?.[prop];
    return (p?.[p.type]?.options || []).map(o => o.name);
  };
  return {
    version: SCHEMA_VERSION,
    taskStatuses: await opts('tasks', 'Item Status'),
    taskBic: await opts('tasks', 'Ball In Court'),
    taskBlockers: await opts('tasks', 'Blocker'),
    actionBic: await opts('actions', 'Ball in Court'),
    rfiTbcBy: await opts('rfis', 'TBC by'),
    rfiStatuses: await opts('rfis', 'RFI Status'),
    vcRaisedBy: await opts('variations', 'Raised By'),
    vcStatuses: await opts('variations', 'Variation Status'),
    vcPause: await opts('variations', 'Pause Override'),
    vcTbcBy: await opts('variations', 'TBC by'),
    fetchedAt: new Date().toISOString(),
  };
}
