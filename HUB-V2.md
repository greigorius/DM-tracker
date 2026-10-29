# Hub v2 — build notes (29 Oct 2026)

Branch `hub-v2-cockpit`. First commit is a snapshot of the uncommitted local changes that were on `master`, so nothing was lost.

## Done (build order steps)
| Step | Status |
|---|---|
| 1. Snapshot blobs, scheduled sync, `/api/snapshot`, `/api/bootstrap` | Done — `hub-core/`, `netlify/functions/api-read.mjs`, `sync-snapshots.mjs`, `sync-full-background.mjs` |
| 2. TanStack Query + IndexedDB persistence | Done for the Cockpit and Triage. Legacy pages not yet migrated (see below) |
| 3. UI tokens + shared components | Done — `src/styles/tokens.css`, `src/components/ui/` |
| 4. Naming rule (Axiom → DM) | Notion already clean: no `Axiom` option in any BIC / TBC by / raised-by field (Tasks, A&I, Submissions, RFIs, VCs) and no Axiom person in Team. Code: mock "Axiom" client removed; mappers rewrite any Axiom value to DM; writes reject it |
| 5. Consolidation review | Report below — nothing removed yet |
| 6. Write endpoints with blob patching + optimistic UI | Done |
| 7. Cockpit | Done — `src/pages/Cockpit.jsx` |
| 8. Port remaining pages, Scheduling Tool last | Not started |

## Notion schema changes made (additive only)
- **Actions & Info:** `Type` (select: Action, Note), `Blocks Item` (checkbox)
- **RFIs:** `Response Due` (date)
- **Variations:** `Raised By` (select: DM, Architect, Client, Contractor, Consultant, Supplier)

## Mapping decisions
- Note / Action → Actions & Info (`Note` title, `Type`, `Items`, `Ball in Court`, `Due`, `Blocks Item`, `Source` = Manual). Notes have no BIC or due.
- RFI → RFIs DB. RFI Number = highest + 1. BIC "DM" = status **Raise** (still to send); any other party = status **Open** with `TBC by` set. The RFI's own BIC formula then follows.
- Variation → Variations DB, status Awaiting Design Info, Change Request Date today. VC number = Notion unique ID shown as `VC-0001`.
- Status / BIC → Tasks `Item Status`, `Ball In Court`, `Person` (assigned DT). Only changed fields are sent.
- Count cards: Overdue / Due this week = open actions + open RFIs by due date · With DTs = active items BIC DT · BIC = DM = active items + open actions with BIC DM (blocking = open DM actions with Blocks Item) · Open RFIs = Raise/Open/Close Out · Open VCs = Awaiting Design Info/Instruction. Active item = not Complete, Omitted, Design Complete, Close Out, PC Approved. All in `hub-core/derive.js`.
- Just logged comes from an event list (`snap/events`): new actions/RFIs/VCs/submissions and item status, BIC and programme-date changes detected by the sync, plus Cockpit writes. Date changes are tagged "Scheduling".

## Legacy removed
Pages: AxiomHome (replaced by Cockpit), Production / Team / Trackers / Hardware placeholders, Client Comment Review (tool retired), Item Date Matrix + `scheduleCalc.js` (a second programme-date entry point — dates belong to the Scheduling Tool). Components: PdfViewer, SketchCanvas, DrawingToolbar, useSketchPaste (DT Checker leftovers). Data: `mockData.js` (constants moved to `src/data/constants.js`). Server: DT Checker routes, `/api/schedule-items`; functions `stats` (read a property that no longer exists), `schedule-items`, `quick-log-drawing-check`, `quick-log-comment-review`; their redirects. Template assets (Vite logo favicon, hero.png, icons.svg) and boilerplate README. Loose files (sample PDFs, design handoff v3, its zip) moved to `_archive/` (git-ignored).

## Consolidation review — for your decision (nothing removed)
| App | Where | Fields | Writes to | Maps onto Cockpit Note/Action? |
|---|---|---|---|---|
| Hub | `QuickEntryModal` (AppNav "+" on legacy pages) — To Do tab | description, item, assignee, category, date | To Do List | Partly: an Action with BIC DT covers it; To Do List rows also carry hours, which the Cockpit doesn't |
| Hub | `QuickEntryModal` — RFI tab | text, date | RFIs (`Name`, `Date` — **these properties don't exist**, so it fails today) | Yes → Cockpit RFI tab. Recommend remove |
| Hub | `QuickEntryModal` — Production tab | notes, target date | Tasks `Drawing Progress` / `Production Date` + To Do | No — it sets a production date, which breaks the Scheduling-only rule, and its properties no longer exist. Recommend remove |
| Hub | `QuickLogBar` (ClientHome, ProjectHome) | same three types | same endpoints | Same as above |
| Hub | `/api/quick-log/*` functions + Express routes | — | as above | Remove with the two components |
| Other repos (not in this session) | Drawing Flow, Email Task Tracker, Weekly Client Report edit mode, Variation Generator, Daily Brief/Triage | — | A&I, Tasks, VCs | Needs checking in those repos — I only had this one |

Recommendation: remove `QuickEntryModal`, `QuickLogBar`, `useQueue` and the `quick-log` endpoints, and replace the "+" with a link to the Cockpit. Decide whether To Do List entries are still wanted, or whether Actions with BIC DT replace them.

## Hub-wide UI (29 Oct, afternoon)
- Every page now renders in `PageShell`: same header, nav row (replaces the old AppNav), 1440px width and gutters.
- **RFIs** and **Variations** rebuilt on the snapshot + UI kit (`TrackerPage.jsx`): search, project / status / grouping filters, sortable tables, CSV export. Old RFISchedulePage / VariationSchedulePage deleted.
- Tasks, Items, Finishes, Drawings, Timeline, Client and Project pages: old colour constants replaced with the tokens, rounded corners and shadows removed, and a scoped compatibility layer (`.legacy` in `tokens.css`) sizes their controls and tables like the kit. They still fetch through the legacy endpoints until rebuilt.
- AppNav and QuickEntryModal removed (the nav "+" went with AppNav). QuickLogBar remains on the Client and Project pages pending the consolidation decision.

## Still to do
- Rebuild the remaining legacy pages (Tasks, Items, Finishes, Drawings, Timeline, Client/Project home) on `TrackerPage` / the UI kit from `usePageCache` + legacy endpoints to `useSnapshot`, and restyle each with the UI kit. Then delete `AppNav`, `AppDataContext`, `usePageCache`, `server/notionHelpers.js` and the legacy functions.
- Triage is read-only; add multi-field editing.
- Port Daily Brief, Drawing Flow, Drawing Studio and Reports into the Hub. Until then their tiles link out (addresses in `src/config/tools.js`). The Triage tile opens the Daily Triage artifact; the count cards open the Hub's read-only `/triage` lists.
- Scheduling Tool port: last, under the protection rules (styling and data hooks only; date-equality check before/after).
- Lighthouse check on the deployed site.

## Verification done
- Sync, writes, event logging, 429 retry and the Axiom guard were tested against a mock Notion API (this session couldn't reach api.notion.com). **First real check: run `npm run sync` locally, then press Sync now on the deployed site.**
- Cockpit and Triage rendered with seeded data at desktop and phone widths with no horizontal scroll; a reload rendered content from the IndexedDB cache in ~370 ms; optimistic capture updated counts and Just logged instantly.
