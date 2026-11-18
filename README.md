# Axiom DL Hub

Cockpit and tools over the Notion project DBs. React 19 + Vite + Tailwind v4, TanStack Query (persisted to IndexedDB), Netlify Functions + Netlify Blobs, Notion SDK v5 (data sources).

## How data flows
- **Reads never hit Notion.** Pages read cached snapshots (`/api/snapshot`, `/api/bootstrap`) served from Netlify Blobs (`snap/<db>`).
- **Sync:** `sync-snapshots` runs every 5 minutes (incremental, `last_edited_time` filter, 350 ms between queries, 429 backoff). A nightly full rebuild (and first-run build) runs in `sync-full-background`. `POST /api/sync-now` is the header's Sync now button.
- **Writes** (`POST /api/actions|rfis|variations`, `PATCH /api/items/:id`) go to Notion, then patch the snapshot and the Just logged event list, so counts are right straight away.
- Shared logic lives in `hub-core/` (used by the Netlify functions, the local Express server and — for `derive.js` — the browser).

## Local dev
On Windows, double-click **`start.bat`**. It installs packages if needed, opens the API and the site in two windows, and launches the browser at http://localhost:5173. Close the two windows to stop.

Or by hand:
```
npm install
npm run server   # Express on :3001 — hub API + legacy routes; syncs to .cache/blobs every 5 min
npm run dev      # Vite on :5173, proxies /api → :3001
npm run sync     # one-off incremental sync   (npm run sync -- --full for a rebuild)
```

## Env
See `.env.example`. `NOTION_TOKEN` is required; the integration needs access to Tasks, RFIs, Variations, Submissions, Master Drawing Schedule, Actions & Info, To Do, Projects, Clients and Team. Tool tiles that aren't in the Hub yet link to `VITE_URL_*`.

## Rules
- "Axiom" never appears as a BIC / raised-by / owner value — the DM's value is **DM**. Mappers rewrite it and writes reject it.
- Programme dates are only set on the **Programme** page (`/programme`), which runs the Scheduling Tool's engine (`hub-core/programme/`). It writes the 8 Adj date properties, Reissue Reason, Manual DT Start, Programme-driven, Date of Instruction, acceleration and project periods — never a Plan or Actual property. No other page writes programme dates.
- UI: tokens in `src/styles/tokens.css`, components in `src/components/ui/`. Pages don't define their own colours.

Build notes and open items: `HUB-V2.md`. Original brief: `docs/hub-cockpit-build-prompt.md`.
