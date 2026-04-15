/**
 * GET /api/variations
 * Returns all variations from the Notion Variations database, with project names resolved.
 * Requires NOTION_DB_VARIATIONS env var. Returns { items: [], configured: false } if not set.
 *
 * Item resolution chain:
 *   Variation → "Related Task" relation → Task page → "Item" relation → Item page → name
 *
 * If a variation has multiple Related Tasks spanning multiple items, `itemNames` will be
 * an array with one entry per distinct item.  The frontend uses this for "Group by Item"
 * de-duplication.
 */
import {
  corsHeaders, tokenGuard, errResponse,
  fetchNotion, notionHeaders, queryAll,
  titleVal, statusVal, selectVal, multiSelectVal,
} from './_helpers.js'

const DB_VARIATIONS = process.env.NOTION_DB_VARIATIONS
const DB_PROJECTS   = process.env.NOTION_DB_PROJECTS
const DB_TASKS      = process.env.NOTION_DB_TASKS      // Items DB (bb783a35) — has "To Do List" relation
const NOTION_API    = 'https://api.notion.com/v1'

function transformVariation(page) {
  const p = page.properties ?? {}

  // VAR # → "No ID" unique_id property
  const varNumber =
    p['No ID']?.unique_id?.number    ??
    p['Variation Number']?.number    ??
    p['Var No.']?.number             ??
    p['Var No']?.number              ??
    p['ID']?.unique_id?.number       ??
    null

  // Title → "Variation Description" title property
  const title =
    titleVal(p, 'Variation Description') ??
    titleVal(p, 'Variation Title')       ??
    titleVal(p, 'Variation Name')        ??
    titleVal(p, 'Name')                  ??
    null

  // Status → "Variation Status" — supports multi_select, status, or select Notion types
  const statusValues = (() => {
    const multi =
      multiSelectVal(p, 'Variation Status').length ? multiSelectVal(p, 'Variation Status') :
      multiSelectVal(p, 'Status').length           ? multiSelectVal(p, 'Status')           :
      []
    if (multi.length) return multi
    const single =
      statusVal(p, 'Variation Status') ??
      selectVal(p, 'Variation Status') ??
      statusVal(p, 'Status')           ??
      selectVal(p, 'Status')           ??
      null
    return single ? [single] : []
  })()

  // Type → "Variation Type"
  const type =
    selectVal(p, 'Variation Type') ??
    selectVal(p, 'Type')           ??
    null

  // Type colour (Notion select colour field) — e.g. 'blue', 'green', 'orange', etc.
  const typeColor =
    p['Variation Type']?.select?.color ??
    p['Type']?.select?.color           ??
    null

  // Date Issued → "Change Request Date"
  const dateIssued =
    p['Change Request Date']?.date?.start ??
    p['Date Issued']?.date?.start         ??
    p['Issue Date']?.date?.start          ??
    null

  // Direct project relation (fallback if no Related Task)
  const projectId =
    p['Projects']?.relation?.[0]?.id         ??
    p['Project']?.relation?.[0]?.id          ??
    p['Related Projects']?.relation?.[0]?.id ??
    p['Related Project']?.relation?.[0]?.id  ??
    null

  // Related Task IDs — used to resolve items via the task → item chain.
  // NOTE: intentionally not trying generic 'Tasks' — it can match a large
  // relation property and cause hundreds of individual page fetches → timeout.
  const relatedTaskIds = (
    p['Related Task']?.relation  ??
    p['Related Tasks']?.relation ??
    []
  ).map(r => r.id)

  // Legacy direct item relation (used as fallback)
  const legacyItemId =
    p['Item']?.relation?.[0]?.id          ??
    p['Related Item']?.relation?.[0]?.id  ??
    p['Related Items']?.relation?.[0]?.id ??
    p['Items']?.relation?.[0]?.id         ??
    null

  return {
    id: page.id,
    varNumber,
    title,
    statusValues,
    projectId,
    relatedTaskIds,
    legacyItemId,
    dateIssued,
    type,
    typeColor,
  }
}

async function fetchPage(id) {
  try {
    const r = await fetchNotion(`${NOTION_API}/pages/${id}`, { headers: notionHeaders() })
    return r.ok ? await r.json() : null
  } catch { return null }
}

/**
 * Fetch multiple pages with controlled concurrency and inter-batch delay to
 * avoid saturating Notion's ~3 req/sec rate limit.
 * Returns an object: { [id]: page | null }
 */
async function fetchPagesBatched(ids, { concurrency = 5, gapMs = 300, deadlineMs = null, startedAt = null } = {}) {
  const map = {}
  for (let i = 0; i < ids.length; i += concurrency) {
    // Hard deadline guard — bail early if running out of time
    if (deadlineMs !== null && startedAt !== null && (Date.now() - startedAt) > deadlineMs) break
    if (i > 0) await new Promise(r => setTimeout(r, gapMs))
    const chunk = ids.slice(i, i + concurrency)
    const pages = await Promise.all(chunk.map(fetchPage))
    for (let j = 0; j < chunk.length; j++) {
      map[chunk[j]] = pages[j] ?? null
    }
  }
  return map
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  if (!DB_VARIATIONS) {
    return {
      statusCode: 200,
      headers:    corsHeaders,
      body:       JSON.stringify({ items: [], configured: false }),
    }
  }

  try {
    const startedAt  = Date.now()
    // Leave ~6 s headroom before Netlify's 26 s function timeout
    const deadlineMs = 20_000

    const pages      = await queryAll(DB_VARIATIONS, null)
    const variations = pages.map(transformVariation)

    // Build statusColorMap from multi_select option colours on each page
    // Maps status name → Notion colour name (e.g. 'Awaiting Design Info' → 'yellow')
    const statusColorMap = {}
    for (const page of pages) {
      const opts = page.properties?.['Variation Status']?.multi_select
                ?? page.properties?.['Status']?.multi_select
                ?? []
      for (const o of opts) {
        if (o.name && o.color && !statusColorMap[o.name]) {
          statusColorMap[o.name] = o.color
        }
      }
    }

    // ── Step 1: Collect all Related Task IDs & legacy item IDs ───────────────
    const allTaskIds   = [...new Set(variations.flatMap(v => v.relatedTaskIds))]
    const allLegacyIds = [...new Set(variations.map(v => v.legacyItemId).filter(Boolean))]

    // Reverse map: taskId → [variationId, ...] — used to link items back to variations
    const taskToVariationIds = {}
    for (const v of variations) {
      for (const tid of v.relatedTaskIds) {
        if (!taskToVariationIds[tid]) taskToVariationIds[tid] = []
        taskToVariationIds[tid].push(v.id)
      }
    }

    // ── Step 2 + 3 combined: Query Items DB filtered by task IDs ─────────────
    // Instead of 382 individual page GETs, use OR filters (max 100 per query)
    // against the Items DB (NOTION_DB_TASKS) — ~4 queries instead of ~382.
    // Items DB has a "To Do List" relation property containing task IDs.
    const variationToItemIds = {}   // variationId → Set<itemId>
    const itemInfoMap        = {}   // itemId → { name, projectId }
    const projIdSet          = new Set(variations.map(v => v.projectId).filter(Boolean))

    if (DB_TASKS && allTaskIds.length > 0) {
      const CHUNK = 100
      for (let i = 0; i < allTaskIds.length; i += CHUNK) {
        if ((Date.now() - startedAt) > deadlineMs) {
          console.log(`[variations] deadline hit during items query at chunk ${i}`)
          break
        }
        const chunk  = allTaskIds.slice(i, i + CHUNK)
        const filter = chunk.length === 1
          ? { property: 'To Do List', relation: { contains: chunk[0] } }
          : { or: chunk.map(tid => ({ property: 'To Do List', relation: { contains: tid } })) }

        const itemPages = await queryAll(DB_TASKS, filter)

        for (const page of itemPages) {
          const itemId = page.id
          const p      = page.properties ?? {}
          const name   = p['Item Name']?.title?.[0]?.plain_text ?? null
          const projId = p['Projects']?.relation?.[0]?.id       ?? null
          itemInfoMap[itemId] = { name, projectId: projId }
          if (projId) projIdSet.add(projId)

          // Map item → variations via task IDs present on the returned item page
          const tdlIds = (p['To Do List']?.relation ?? []).map(r => r.id)
          for (const tid of tdlIds) {
            for (const vid of (taskToVariationIds[tid] ?? [])) {
              if (!variationToItemIds[vid]) variationToItemIds[vid] = new Set()
              variationToItemIds[vid].add(itemId)
            }
          }
        }

        if (i + CHUNK < allTaskIds.length) await new Promise(r => setTimeout(r, 300))
      }
    }

    // Also fetch any legacy direct-item IDs not yet resolved
    const unresolvedLegacy = allLegacyIds.filter(id => !itemInfoMap[id])
    if (unresolvedLegacy.length > 0) {
      const legacyMap = await fetchPagesBatched(unresolvedLegacy, { concurrency: 5, gapMs: 300, deadlineMs, startedAt })
      for (const [itemId, page] of Object.entries(legacyMap)) {
        if (!page) continue
        const p      = page.properties ?? {}
        const projId = p['Projects']?.relation?.[0]?.id                    ?? null
        const name   = p['Item Name']?.title?.[0]?.plain_text ?? p['Name']?.title?.[0]?.plain_text ?? null
        itemInfoMap[itemId] = { projectId: projId, name }
        if (projId) projIdSet.add(projId)
      }
    }

    console.log(`[variations] items resolved=${Object.keys(itemInfoMap).length} | projIds=${projIdSet.size} | elapsed=${Date.now()-startedAt}ms`)

    // ── Step 4: Resolve project names ─────────────────────────────────────────
    const projMap = {}
    if (DB_PROJECTS && projIdSet.size > 0) {
      try {
        const projectPages = await queryAll(DB_PROJECTS, null)
        for (const p of projectPages) {
          projMap[p.id] = { id: p.id, name: p.properties?.['Project Name']?.title?.[0]?.plain_text ?? p.id }
        }
      } catch {
        await Promise.all([...projIdSet].map(async id => {
          const page = await fetchPage(id)
          if (page) projMap[id] = { id, name: page.properties?.['Project Name']?.title?.[0]?.plain_text ?? id }
        }))
      }
    } else {
      await Promise.all([...projIdSet].map(async id => {
        const page = await fetchPage(id)
        if (page) projMap[id] = { id, name: page.properties?.['Project Name']?.title?.[0]?.plain_text ?? id }
      }))
    }

    // ── Step 5: Enrich variations ─────────────────────────────────────────────
    const enriched = variations.map(v => {
      // Build list of items: prefer task-chain resolution, fall back to legacy direct relation
      const fromTasks     = [...(variationToItemIds[v.id] ?? new Set())]
      const uniqueItemIds = fromTasks.length > 0 ? fromTasks : (v.legacyItemId ? [v.legacyItemId] : [])

      const items = uniqueItemIds
        .map(iid => itemInfoMap[iid])
        .filter(Boolean)

      const itemNames = items.map(i => i.name).filter(Boolean)
      const itemIds   = uniqueItemIds.filter(id => itemInfoMap[id])

      // Resolve projectId: direct on variation → first item's project
      const resolvedProjectId = v.projectId ?? items[0]?.projectId ?? null

      // Also collect all project IDs across items (for multi-project variations)
      const allProjectIds = [...new Set(items.map(i => i.projectId).filter(Boolean))]
      if (resolvedProjectId && !allProjectIds.includes(resolvedProjectId)) {
        allProjectIds.unshift(resolvedProjectId)
      }

      return {
        id:           v.id,
        varNumber:    v.varNumber,
        title:        v.title,
        statusValues: v.statusValues,            // array from multi_select (or single-value wrapped)
        status:       v.statusValues[0] ?? null, // first value kept for filter back-compat
        type:         v.type,
        typeColor:    v.typeColor,
        dateIssued:   v.dateIssued,
        projectId:    resolvedProjectId,
        projectName:  resolvedProjectId ? (projMap[resolvedProjectId]?.name ?? null) : null,
        // Multi-item support
        itemIds,
        itemNames,
        // Back-compat single values (first item)
        itemId:   itemIds[0]   ?? null,
        itemName: itemNames[0] ?? null,
      }
    })

    // Sort by project name → var number
    enriched.sort((a, b) => {
      const p = (a.projectName ?? '').localeCompare(b.projectName ?? '')
      return p !== 0 ? p : (a.varNumber ?? 0) - (b.varNumber ?? 0)
    })

    return {
      statusCode: 200,
      headers:    corsHeaders,
      body:       JSON.stringify({ items: enriched, configured: true, statusColorMap }),
    }
  } catch (err) {
    return errResponse('variations', err)
  }
}
