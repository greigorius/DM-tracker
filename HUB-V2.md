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

## Brief tab and full page rebuild (29 Oct, 12:30)
- **Brief** replaces Tasks in the nav, with **Daily Brief** (default) and **Triage** sub-tabs sharing one project filter. Both are ports of the standalone artifacts, now reading the snapshot.
  - Daily Brief: headline counts, My moves (bucketed), Chase list (External / Internal / DT team, by-person, drawings back with DTs), programme window, open RFIs, recent movement.
  - Triage: My moves / External / Internal / DT team / Unfiled / All actions, Items, RFIs, Variations, Data fixes. Row edit strips with draft + Save, chase notes logged to Response Log, bulk edit, delete to Notion Trash with Undo. Cockpit count cards land here (`?filter=`).
  - Triage writes the same fields the artifact did, including Date of Instruction, Hold Days and DT actual dates — inputs the Scheduling Tool reads, not its calculated dates.
- New snapshot DBs: Item Activity Log, Meetings, Finishes. More fields on tasks, actions, RFIs, VCs, submissions and drawings. `MAPPER_VERSION` makes the next sync rebuild every snapshot so the new fields appear.
- New write endpoints: `PATCH /api/records/:db/:id` (whitelisted fields per DB) and `POST /api/records/:db/:id/trash|restore`.
- Items, Drawings, Finishes, Timeline, Project and Client pages rebuilt on the snapshot and UI kit. Every legacy page, endpoint, Netlify function, `server/notionHelpers.js`, AppDataContext, usePageCache, QuickLogBar and the `.legacy` style layer are gone. The Tasks (To Do list) page is retired.

## Triage promoted (29 Oct, 14:00)
- Triage is its own nav tab (`/triage`, after Timeline); Brief (`/brief`) is the Daily Brief alone. Both keep the shared project filter. `/brief/triage` redirects.
- First-load 502: start.bat now waits for the API before starting the site, and the client quietly retries 5xx/network errors (up to 6 times, backing off) instead of showing an error.

## Tasks tab and Brief by item (29 Oct, 15:00)
- **Tasks** (`/tasks`, after Brief) is back, rebuilt on the `snap/todo` snapshot. You can group by project, person, item, open/closed or design stage, or turn grouping off. It also has status chips, search, CSV export, and overdue end dates in red. `/trackers/task-schedule` redirects here.
- The To Do mapper now also reads ID, Task Hours (Est), Design Stage, Change Task, Related RFI and Related Variation. `MAPPER_VERSION` 3 makes the next sync rebuild the snapshots.
- **Daily Brief** has a View toggle: *By section* (as before) or *By item*. By item shows one collapsible card per item, most urgent first. Each card holds that item's DM actions, chase actions, RFIs, VCs, drawings back with DTs, programme dates in the window, and recent activity. The view choice is remembered.

## Actions → Tasks (29 Oct, 15:45)
- New two-way relation: **Actions & Info "Task" ↔ To Do "From Action"**.
- Triage action strip has a **Add to Tasks** tick. It opens task fields: description, person, start/end, est hours, change task + variation, RFI. **Save & move to Tasks** creates the To Do row linked to the action, then ticks the action Checked and logs "moved to Tasks (TD-n)" in its Response Log (`POST /api/actions/:id/to-task`). An action already in Tasks is refused (409) and shows a link instead. The action must be linked to an item.
- Tasks page uses Task Done as the only open/done flag, drops design stage, and shows the linked variation and a "From action" tag. To Do rows are editable through `PATCH /api/records/todo/:id` (no UI yet).
- `npm run audit:todo` (run locally) backs up every To Do row to `_archive/` and writes `docs/todo-audit.md`. That file lists each property's formula, what reads it, and which Items formulas depend on To Do. It's the input for the strip-back.

## To Do DB stripped back (29 Oct, 16:30)
Backup of all 2,327 rows and the old schemas: `_archive/todo-backup-2026-10-29.json`, `_archive/todo-schema-2026-10-29.json`.
- **To Do keeps 12:** Item Description, ID, Task Done, Item, Person, Start Date, End Date (Manual), Task Hours (Est), Change Task, Related Variation, Related RFI, From Action. The page layout is reduced to two sections, Task and Links.
- **To Do removed (25):**
  - 13 formulas: the hours splits, Task Status 1, End Date, Hours Per Scope, Total Hours Spent, Total Sub Task Hours. Four of these were already broken by the deleted sub-task relation.
  - 9 look-ups: Dept, Project, Suffix No., RFI ID / Status, TBC by, Variation Ref / Status / Type.
  - Status, Design Stage, Design Stage 1.
- **Items removed (12):**
  - Roll-ups: 1st / 2nd / Constr. Issue Hrs (Est), Contracted / Variation Hours Scheduled / Spent, Est. Hours Spent, Blocker-1 (which was dead).
  - Formulas: Contract Hrs, Variation Hrs, Est. Hrs Spent #.
- **Items kept:** Total Scheduled Hours, which still feeds Est. Hours Required and Remaining Hrs.
- Neither the Weekly Client Report nor Contract vs Variation Hours reads any of these. Both use Timesheets, Original Allocation and Variations Est Hrs.

## Still to do
- Port Drawing Flow, Drawing Studio and Reports into the Hub. Until then their tiles link out (addresses in `src/config/tools.js`).
- ~~Scheduling Tool port~~ — done 13 Nov 2026 as the Programme page (below).
- Lighthouse check on the deployed site.

## Verification done
- Sync, writes, event logging, 429 retry and the Axiom guard were tested against a mock Notion API (this session couldn't reach api.notion.com). **First real check: run `npm run sync` locally, then press Sync now on the deployed site.**
- Cockpit and Triage rendered with seeded data at desktop and phone widths with no horizontal scroll; a reload rendered content from the IndexedDB cache in ~370 ms; optimistic capture updated counts and Just logged instantly.

## Team page, DT emails, Triage Team (2 Nov 2026)
Spec: `claude/team-page-staging.md` in the "Axiom Hub" claude.ai Project.
- **Notion:** Team `Role` converted in place to a select (DT, DM, DC, Outsourced, Client, Supplier); placeholder rows Client Team / By Supplier / Outsourced re-roled so they're no longer DTs. To Do gains `Status` (Not Started / In Progress / Blocked / Done); Task Done hidden from the page layout.
- **Status replaces Task Done** everywhere in the repo (mapper, `PATCH /api/records/todo`, Add to Tasks, Tasks page). Rows without a Status fall back to Task Done until `npm run backfill:status` has run. Status writes also tick Task Done (`TODO_MIRROR_TASK_DONE=off` once the property is deleted). `MAPPER_VERSION` 9.
- **Team** (`/team`, after Tasks): open to-dos grouped by DT or item; filters for project, DT, item, status, overdue only, date window (Overdue + 2 wks / all open); inline status edit; DT header shows open / overdue / est hrs vs weekly capacity. Reads the cached snapshots like every other page (no separate `/api/team/todos`).
- **DT emails:** `POST /api/team/email/preview` and `/send` (`hub-core/team-email.js`, rendering in `hub-core/team.js`). One email per DT, grouped by item, overdue + next 14 days. Preview dialog, untick, then sends one DT per request to `TEAM_EMAIL_WEBHOOK_URL` (Make scenario 8301628 → Gmail gfdc.dt1). Send is disabled when the URL is unset.
- **Triage → Team** tab: no person / no item / no end date / DT with no email (errors, counted on the Triage nav tab), no role (warning), no hours and blocked-with-no-link (info). Inline fixes write to Notion; Team rows are now editable (`email`, `role`, `capacity`).
- Tests: `test/team.test.js`.

## Derived item Ball In Court (2 Nov 2026)
Nothing wrote Tasks `Ball In Court` before: Drawing Flow sets BIC per submission only, and no Make scenario touches the item. It's now derived in `hub-core/item-bic.js`. First match wins:
1. Lock Status → leave alone
2. Item closed → clear
3. Open variation (Awaiting Design Info / Instruction) → its BIC
4. Open stop-work RFI → its BIC
5. Open action with Blocks Item → its BIC
6. Drawings → holder of each drawing's latest submission; more than one holder = **Mixed** (new Tasks option)
7. No drawings → DT if assigned, else DM; In Production → Production
- `ITEM_BIC_AUTO` = off | **dry** (default: review only) | on (each sync writes up to 40 changes).
- Triage → **Ball in court** tab lists every difference with the reason; apply selected or all. `GET /api/item-bic/plan`, `POST /api/item-bic/apply`.
- Writes patch the tasks snapshot, so they don't flood Just logged. Tests: `test/item-bic.test.js`.
- Batch editing (2 Nov): Data fixes, Team and Ball in court rows can be ticked (or Select all) and fixed together from a sticky bar, like the action and item lists. Data fixes and Team share `src/pages/brief/FixCard.jsx`; shared controls moved to `controls.jsx`. Ball in court's bar applies the derived value, or overrides it and ticks Lock Status ("Set & lock", "Lock as is").

## Programme page — Scheduling Tool merged in (13 Nov 2026)
Design: the Programme artboard (Review | Table | Timeline) on the design canvas. **Programme** (`/programme`, `/programme/:projectId`) replaces Timeline in the nav; `/timeline…` and `/scheduling` redirect, and the Cockpit's Scheduling tile and "Programme dates" link now route here.
- **Engine:** `hub-core/programme/schedule.js`, `release.js`, `ganttExport.js` are the Scheduling Tool's `lib/` copied unchanged from branch `dt-mobilisation-drawing-view` (commit 43fd771: mobilisation, manual DT Start, drawings view). Its tests run here: `test/programme-engine.test.js` (63) and `test/programme-acceptance.test.js` (12, the Nov 2026 brief checks). Change the engine in one place and copy it, or retire the tool's copy.
- **Inputs from the snapshots:** the tasks mapper gains `sched` (the tool's task-row keys, read with the same property types — a formula of the same name reads as blank, as in the tool) and projects gain `sched` (periods + minimums); drawings gain `title1`. `MAPPER_VERSION` 10. `hub-core/programme/adapter.js` rebuilds the tool's rows: MDS stage completion (Drawing-only counting, NCA / S5 NA skips), holds from Variations (pause rules, added days when instructed) and stop-work RFIs.
- **Date-equality check:** `test/programme-adapter.test.js` turns every fixture item back into Notion pages, maps them through the Hub, and checks calcRow gives identical dates, flags, stage states and Notion patch — plus periods, minimums, holds and manual DT Start. All 17 EIT items match.
- **Tabs:** Review (landing: Fix now / Challenge the programme / Check dates / On track, with what to do, stage cards, drawings and item inputs), Table (stage by stage, expandable), Timeline (client reviews on a date axis). One Filter, one Export (Gantt, release schedule, PDF, item rows Excel), ⚙ for periods, minimums and writing to Notion. Dates are calculated in the browser from the cached snapshots, so nothing waits on Notion.
- **Writes** (`hub-core/programme/sync.js`): `GET /api/programme/plan`, `POST /api/programme/apply` (snap newly issued stages, then every differing Adj date; order-check failures blocked), `PATCH /api/programme/items/:id` (Manual DT Start, Reissue Reason, Programme-driven, Date of Instruction, acceleration — then re-syncs the item), `PATCH /api/programme/projects/:id` (periods, minimums — then re-syncs the project). Only In progress projects. The Actuals seen at the last applied sync live in blob `snap/programme-actuals` (the tool kept them in localStorage). Checked against a mock Notion: a second plan after applying is empty, and only Adj properties were written.
- `PROGRAMME_AUTO` = off | **dry** (default) | on. Leave it on dry until the plan matches what the Scheduling Tool writes, then turn it on and retire the tool.
- Removed: `src/pages/TimelinePage.jsx` (its PDF and Excel exports remain, under Export).

## Top-level tabs (16 Nov 2026)
Nav is now **Cockpit · Triage · Programme · Trackers · Reports**, per the page redesign concept. Sections with sub-pages show a second row (`NAV[].tabs` in `src/components/ui/HubNav.jsx`); the current tab scrolls into view on phones.
- **Triage**: Triage | Brief (they already shared `BriefLayout`).
- **Trackers**: Items, Drawings, Tasks, Team, Finishes, RFIs, Variations. RFIs and Variations are registers, so they moved in; you act on them in Triage. Tasks, Team and Drawings moved to `/trackers/tasks`, `/trackers/team`, `/trackers/drawings`; `/tasks`, `/team`, `/drawings` and `/trackers/task-schedule` redirect with their query.
- **Reports** (`/reports`): Weekly Client Report and Contract vs Variation Hours (still link out) and a pointer to Programme exports.
- Next: the close-out tracker joins Trackers as a sub-tab once its branch is in the repo.
- 17 Nov 2026: Projects menu removed, and the project (`/project/:id`) and client (`/client/:id`) pages retired with `components/ui/Gantt.jsx` — every tab has a project filter and hours are in Reports. `/project/:id` redirects to that project on Programme; `/client/:id` to Programme.

## Drawings tracker: revisions per stage (18 Nov 2026)
S4, S5, A4.5 and PRD columns list every revision issued in that stage (`hub-core/drawingRevs.js`): issue date → client grade and return date from the Submissions DB (Issued, Client Grade, Reviewed; QA bounces that never went out are left out). Before the Drawing Flow (June 2026) the schedule's stage dates stand in, rev shown only for the drawing's current stage. Where nothing is recorded it forecasts (italic; red once the forecast issue date has passed): a pending return = issue + client review / sign-off period (or the item's forecast approval if later); the next issue (none yet, or last came back C) = the item's programme forecast, or return + revision period + QA if that's earlier. No forecasts for sketches/models, items off the programme, omitted items, stages a later stage has overtaken, or PRD (actuals only). Tests: `test/drawing-revs.test.js`.
