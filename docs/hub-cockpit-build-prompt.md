# Axiom DL Hub v2 — Cockpit, Fast Data Layer and Hub-wide UI

Build prompt for Claude Code. Repo: `greigorius/dm-tracker` (React 18 + Vite + Tailwind + React Router, Express via serverless-http on Netlify Functions, Notion official SDK).

## Goal
1. Make every page render instantly on click-through. The old Hub hit Notion on every page load with no cache.
2. Replace the home page with a one-page **Cockpit**: live counts, quick-capture forms for manual data entry, and launch tiles for every tool.
3. Roll the Cockpit's UI scheme out across every Hub page (Part 3).

## Naming rule (applies everywhere)
- "Axiom" is a hidden company. It must **never** appear as a value in any Ball in Court, sits-with, raised-by or owner field.
- The DM's own value is **DM**. BIC values: `DM`, `DT`, `Architect`, `Client` (plus any existing external parties already in Notion).
- "Axiom DL Hub" stays as the app name.
- Task: find every `Axiom` option in the Notion select properties and in code constants, migrate existing rows to `DM`, then remove the option.

---

## Part 1 — Data layer (do this first)

### Principle
**Page views never call Notion directly.** Reads come from a cached snapshot. Writes go to Notion, then patch the snapshot.

### 1a. Server-side snapshot cache (Netlify Blobs)
- Add `@netlify/blobs`. One blob per DB: `snap/tasks`, `snap/rfis`, `snap/variations`, `snap/submissions`, `snap/drawings`, `snap/actions`, `snap/todo`, `snap/projects`, `snap/clients`.
- Each blob stores `{ syncedAt, rows: [...] }`. Rows are already flattened to plain fields (id, title, status, BIC, project, item, DT, dates, blocking); no raw Notion property objects.
- `netlify/functions/sync-snapshots.mjs`: a **scheduled function, every 5 minutes**.
  - Queries each DB using a `last_edited_time` filter > last sync, so only changed rows are fetched.
  - Merges the changed rows into the blob.
  - Runs a full rebuild nightly to catch deletes and archives.
  - Respects the rate limit: sequential DB queries, 350 ms gap, retry on 429 with backoff.
- `GET /api/snapshot?dbs=tasks,rfis,...` returns the blobs (fast, around 50 ms).
- `GET /api/bootstrap` returns, in one call:
  - lookups: projects, items, DTs, BIC values, statuses
  - cockpit counts: overdue, due this week, with DTs, BIC = DM (and how many are blocking), open RFIs, open VCs
  - `syncedAt`
- `POST /api/sync-now` triggers an immediate incremental sync (for the refresh button).

### 1b. Writes
- All create and update endpoints (`POST /api/actions`, `POST /api/rfis`, `POST /api/variations`, `PATCH /api/items/:id`, etc.):
  1. Write to Notion.
  2. Map the returned page into the flattened row shape.
  3. Patch that row into the relevant blob.
  4. Return the row.
- After a write, the snapshot is correct without waiting for the 5-minute sync.

### 1c. Client cache (TanStack Query)
- Add `@tanstack/react-query`, `@tanstack/react-query-persist-client`, and `idb-keyval`.
- Persist the query cache to IndexedDB (`maxAge` 24 h). On open, the app renders the last data immediately, then refreshes in the background.
- Defaults:
  - `staleTime` 2 min, `gcTime` 24 h
  - `refetchOnWindowFocus: true`
  - `placeholderData: keepPreviousData`
- Every page reads through hooks: `useSnapshot('tasks')`, `useBootstrap()`. No component-level `fetch`.
- **Prefetch** a route's data on tile or nav hover, using `queryClient.prefetchQuery`.
- **Optimistic updates** on all quick-capture and status changes, with rollback on error and a toast.
- Header shows "Synced 2 min ago" and a Sync now button that calls `/api/sync-now`, then invalidates queries.

### 1d. Front-end weight
- Route-level code splitting: `React.lazy` + `Suspense` for every page except the Cockpit.
- Lazy-load Recharts, used only on chart pages.
- Use skeleton rows, never blank spinners, so cached data shows first.

### 1e. Cold starts
- Keep functions small. Split the Express app into a light `api-read` function (snapshot and bootstrap only, no Notion SDK import) and an `api-write` function.
- Keep the existing rule: Express API routes register before Vite middleware in local `server.js`.

---

## Part 2 — Cockpit (`/`)

Single page, three zones, all fed by `useBootstrap()`. Reference: the Axiom Hub Cockpit mockup.

### Zone A — Today strip
- Count cards: **Overdue · Due this week · With DTs · BIC = DM · Open RFIs · Open VCs**.
- Each card has a sub-line (e.g. "4 blocking items" on BIC = DM).
- Clicking a card goes to `/triage?filter=<key>`.

### Zone B — Quick capture
A tabbed panel; each tab is a compact form. Every tab starts with Project and Item. Dropdowns come from bootstrap lookups only. **Note / Action is the default tab.**

| Tab | Fields | Writes to |
|---|---|---|
| Note / Action (default) | Type (Action / Note), text, BIC, Due, **Blocks this item** checkbox | Actions DB |
| RFI | Question, BIC, Response due | RFIs DB |
| Variation | Description, Raised by; VC number auto (`VC-0001` global sequence) | Variations DB |
| Status / BIC | Status, BIC, Assigned DT | Tasks DB |

There is **no Submission tab**. Submissions are automated through Drawing Flow and appear in the Just logged list, tagged "via Drawing Flow".

**Note / Action behaviour**
- An Action with "Blocks this item" ticked feeds the item's blocked state (see the Item Status automation plan) and the blocking count on BIC = DM.
- A Note has no BIC or due date; hide those fields when Note is selected.

**Programme and delivery dates: Scheduling Tool only**
- The Cockpit does **not** write programme or delivery dates. The Scheduling Tool's programming logic is the only place dates are set and cascaded.
- The quick-capture footer has a link, "Change delivery date in Scheduling →", that opens the Scheduling Tool with the current Project and Item preselected (e.g. `/scheduling?project=<id>&item=<id>`). If the tool can't read those parameters yet, the link just opens it.
- Date changes made in the Scheduling Tool still appear in Just logged and the counts, via the snapshot.

**Common behaviour**
- Submitting clears the form, shows a toast with an "Open" link, and updates counts optimistically.
- The last-used Project persists per tab (localStorage, wrapped in try/catch).

### Just logged panel (beside quick capture)
- The last ~6 entries across Actions, RFIs, VCs, Submissions, status and date changes, newest first.
- Each row: type tag, one-line summary, project · item · source · time. Blocking actions show in red.
- Links to the full activity log.

### Zone C — Launch tiles
- One tile per tool:
  - Daily Brief `/brief`
  - Triage `/triage`
  - Scheduling `/scheduling`
  - Drawing Flow `/drawing-flow`
  - Drawing Studio `/drawing-studio`
  - RFIs `/trackers/rfis`
  - Variations `/trackers/variations`
  - Reports `/reports`
- Each tile shows an outstanding-count badge and the last-updated time from the snapshot.
- Hovering a tile prefetches that route's data.
- Tools not yet ported into the Hub link out to their existing URL, labelled "Not in Hub yet" with an external icon.

### Rules
- The Cockpit only **creates** entries and makes **one-field changes**. Multi-field editing happens in Triage.
- Reports and Daily Brief are read-only views over the same snapshot.

### Consolidation review (before building Zone B)
Several existing apps have their own note, action or quick-entry features that the Cockpit's quick capture should replace.
1. Search the repo and the other app repos for note, action, comment, chase and follow-up inputs that write to Notion.
2. List each one: app, page, fields, target DB, and whether its fields map onto the Cockpit's Note / Action form.
3. Report the list for review **before** removing anything. Agreed duplicates are then removed or replaced with a link to the Cockpit.

---

## Part 3 — Hub-wide UI scheme

Apply the Cockpit's look to every Hub page. Put it in one place so pages stop styling themselves.

### Tokens (Tailwind theme + CSS variables)
| Token | Value | Use |
|---|---|---|
| `ground` | `#0E0F11` | Page background, input fill |
| `bar` | `#121316` | Header bar |
| `surface` | `#16181B` | Cards, panels |
| `surface-hi` | `#1E2125` | Active tab, hover |
| `line` | `#26292E` | Card borders, dividers |
| `line-strong` | `#3A3E45` | Input and secondary button borders |
| `text` | `#E8E6E1` | Primary text |
| `text-2` | `#B7BAC0` | Labels, secondary text |
| `muted` | `#9A9DA3` | Meta, timestamps |
| `accent` | `#F2A33A` | Primary action, active state, needs-DM |
| `danger` | `#F06A5A` | Overdue, blocking |
| `info` | `#6AA8F0` | With DTs, RFIs |
| `ok` | `#5CC08A` | Synced, approved |

### Type
- DM Sans for body and headings; DM Mono for labels, numbers, codes, dates and tabs.
- Section labels: DM Mono 12 px, uppercase, 0.14em tracking, `muted`.
- Large figures: DM Mono 40 px.

### Components (build once in `src/components/ui/`)
- `AppHeader` (logo mark, page title, date, sync status, Sync now)
- `SectionLabel`, `Card`, `CountCard`, `ToolTile`
- `Tabs`, `Field` (label + input/select/textarea), `Checkbox`, `RadioPill`
- `Button` (primary amber, secondary outline), `Badge`, `TypeTag`
- `Toast`, `Skeleton`

### Rules
- Square corners, 1 px borders, no shadows or gradients.
- Touch targets at least 44 px; real `<button>`, `<a>`, `<label>` elements.
- Layouts wrap to a single column at phone width.
- Migrate pages one at a time; no page keeps its own colour constants.

### Scheduling Tool: protected
- Do **not** modify, refactor, move or re-implement the Scheduling Tool's programming logic (date calculations, offsets, variables, business-day and holiday handling).
- When porting it to `/scheduling`, change only styling, layout wrappers and data-fetching hooks around it. If a change would touch the logic files, stop and report instead.
- Before and after the port, run the same set of sample items through it and confirm every calculated date is identical.

---

## Build order
1. Snapshot blobs + scheduled sync + `/api/snapshot` + `/api/bootstrap`
2. TanStack Query with persistence; migrate existing pages to hooks
3. UI tokens and shared components (Part 3)
4. Naming rule: migrate `Axiom` BIC values to `DM`
5. Consolidation review — report before removing anything
6. Write endpoints with blob patching + optimistic UI
7. Cockpit page
8. Restyle and port remaining pages; Scheduling Tool last, under the protection rules in Part 3

## Acceptance
- Second visit to any page: content visible in under 200 ms (from the IndexedDB cache).
- Navigating between pages makes no visible wait for data already cached.
- A quick-capture entry appears in Notion and in the counts without a page reload.
- The Scheduling Tool produces identical dates before and after the port.
- No BIC, sits-with or raised-by field anywhere shows "Axiom".
- Every Hub page uses the shared tokens and components.
- Lighthouse performance score of 85 or higher on `/`.
