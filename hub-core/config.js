// Axiom DL Hub — shared configuration for the snapshot data layer.
// Data source (collection) IDs, not database IDs: the Notion SDK v5 queries
// data sources directly. Each can be overridden with an env var.

export const DATA_SOURCES = {
  tasks:       process.env.NOTION_DS_TASKS       || 'bb783a35-a407-4637-89c6-78ebc76c8699',
  rfis:        process.env.NOTION_DS_RFIS        || '22d210e4-582e-80a3-83ae-000b3ecb6c58',
  variations:  process.env.NOTION_DS_VARIATIONS  || '22d210e4-582e-81ef-b2b6-000b9fa707fe',
  submissions: process.env.NOTION_DS_SUBMISSIONS || '36f210e4-582e-809b-9bb0-000b01a0efd1',
  drawings:    process.env.NOTION_DS_DRAWINGS    || '13b210e4-582e-8105-9eb3-000bddf31945',
  actions:     process.env.NOTION_DS_ACTIONS     || '366210e4-582e-8064-b40e-000bb5eb1d2a',
  todo:        process.env.NOTION_DS_TODO        || 'fc05f861-67c7-4ccf-bedb-d35f0a2cd342',
  projects:    process.env.NOTION_DS_PROJECTS    || 'ac1cd320-3d18-4396-b211-a96e76b03dee',
  clients:     process.env.NOTION_DS_CLIENTS     || '985dab52-c444-446e-b904-8c8d18e59637',
  team:        process.env.NOTION_DS_TEAM        || '348210e4-582e-80a2-93fa-000bfc029a4d',
  activity:    process.env.NOTION_DS_ACTIVITY    || '755b96a3-28af-4577-a135-52396e3b3395',
  meetings:    process.env.NOTION_DS_MEETINGS    || 'c558b84a-dd77-410e-9722-290a7a841e70',
  finishes:    process.env.NOTION_DS_FINISHES    || 'de9687b3-9daa-44e7-ab1f-aa4ba00067f4',
};

export const DB_KEYS = Object.keys(DATA_SOURCES);

// Order matters for sync-now with a time budget: most-used first.
export const SYNC_ORDER = ['tasks', 'actions', 'rfis', 'variations', 'submissions', 'projects', 'team', 'drawings', 'activity', 'meetings', 'finishes', 'clients', 'todo'];

export const GAP_MS = 350;                 // gap between Notion queries
export const BLOB_STORE = 'hub';
export const snapKey = db => `snap/${db}`;
export const META_KEY = 'snap/meta';
export const SCHEMA_KEY = 'snap/schema';
export const EVENTS_KEY = 'snap/events';
export const MAX_EVENTS = 200;
// Bump when a mapper gains fields: every snapshot built with an older version
// is rebuilt in full on the next sync, so new fields appear on every row.
export const MAPPER_VERSION = 5;
export const SCHEMA_VERSION = 2;

// "Axiom" is a hidden company: it must never surface as a BIC / sits-with /
// raised-by / owner value. Any option matching this is dropped from lookups.
export const HIDDEN_PARTY = /axiom/i;
