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

  // Date Issued → "Change Request Date"
  const dateIssued =
    p['Change Request Date']?.date?.start ??
    p['Date Issued']?.date?.start         ??
    p['Issue Date']?.date?.start          ??
    null

  // Direct project relation (fallback if no Related Task)
  const projectId =
    p['Projects']?.relation?.[0]?.id ??
    p['Project']?.relation?.[0]?.id  ??
    null

  // Related Task IDs — used to resolve items via the task → item chain
  const relatedTaskIds = (p['Related Task']?.relation ?? []).map(r => r.id)

  // Legacy direct item relation (used as fallback)
  const legacyItemId =
    p['Item']?.relation?.[0]?.id         ??
    p['Related Item']?.relation?.[0]?.id ??
    p['Items']?.relation?.[0]?.id        ??
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
  }
}

async function fetchPage(id) {
  try {
    const r = await fetchNotion(`${NOTION_API}/pages/${id}`, { headers: notionHeaders() })
    return r.ok ? await r.json() : null
  } catch { return null }
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
    const pages      = await queryAll(DB_VARIATIONS, null)
    const variations = pages.map(transformVariation)

    // ── Step 1: Collect all Related Task IDs & legacy item IDs ───────────────
    const allTaskIds    = [...new Set(variations.flatMap(v => v.relatedTaskIds))]
    const allLegacyIds  = [...new Set(variations.map(v => v.legacyItemId).filter(Boolean))]

    // ── Step 2: Fetch task pages → collect their Item relation IDs ───────────
    // taskItemMap: taskId → [itemId]
    const taskItemMap = {}
    for (let i = 0; i < allTaskIds.length; i += 25) {
      const chunk = allTaskIds.slice(i, i + 25)
      const taskPages = await Promise.all(chunk.map(fetchPage))
      for (let j = 0; j < chunk.length; j++) {
        const page = taskPages[j]
        if (!page) continue
        const itemRels = (page.properties?.['Item']?.relation ?? []).map(r => r.id)
        taskItemMap[chunk[j]] = itemRels
      }
    }

    // ── Step 3: Collect all item IDs (from tasks + legacy) ───────────────────
    const allItemIds = [...new Set([
      ...Object.values(taskItemMap).flat(),
      ...allLegacyIds,
    ])]

    // itemInfoMap: itemId → { name, projectId }
    const itemInfoMap = {}
    const projIdSet   = new Set(variations.map(v => v.projectId).filter(Boolean))

    for (let i = 0; i < allItemIds.length; i += 25) {
      const chunk     = allItemIds.slice(i, i + 25)
      const itemPages = await Promise.all(chunk.map(fetchPage))
      for (let j = 0; j < chunk.length; j++) {
        const page = itemPages[j]
        if (!page) continue
        const p      = page.properties ?? {}
        const projId = p['Projects']?.relation?.[0]?.id ?? null
        const name   = p['Item Name']?.title?.[0]?.plain_text ?? null
        itemInfoMap[chunk[j]] = { projectId: projId, name }
        if (projId) projIdSet.add(projId)
      }
    }

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
      // Build list of items via Related Task chain
      const taskItemIds   = v.relatedTaskIds.flatMap(tid => taskItemMap[tid] ?? [])
      const uniqueItemIds = [...new Set(taskItemIds.length ? taskItemIds : (v.legacyItemId ? [v.legacyItemId] : []))]

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
        statusValues: v.statusValues,          // array from multi_select (or single-value wrapped)
        status:       v.statusValues[0] ?? null, // first value kept for filter back-compat
        type:         v.type,
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
      body:       JSON.stringify({ items: enriched, configured: true }),
    }
  } catch (err) {
    return errResponse('variations', err)
  }
}
