/**
 * GET /api/drawings-register
 * Returns all drawings from MDS DB, enriched with item name, item status,
 * and project name so the frontend can group and filter.
 */
import {
  corsHeaders, tokenGuard, errResponse,
  fetchNotion, notionHeaders, queryAll, transformDrawing,
} from './_helpers.js'

const DB_DRAWINGS = process.env.NOTION_DB_DRAWINGS
const NOTION_API  = 'https://api.notion.com/v1'

/** Safely fetch a single Notion page — never throws, returns null on any error. */
async function fetchPage(id) {
  try {
    const r = await fetchNotion(`${NOTION_API}/pages/${id}`, { headers: notionHeaders() })
    if (!r.ok) return null
    return await r.json()   // ← await inside try so JSON parse errors are caught too
  } catch { return null }
}

/**
 * Batch-fetch item pages (name, status, projectId) and fire project fetches
 * as project IDs are discovered — same pipeline as tasks.js.
 * Never throws; unresolvable items/projects silently become null.
 */
async function resolveItems(itemIds, batchSize = 20) {
  const itemMap = {}
  const projMap = {}

  // --- items (batched concurrent fetches) ---
  for (let i = 0; i < itemIds.length; i += batchSize) {
    const chunk   = itemIds.slice(i, i + batchSize)
    const results = await Promise.allSettled(chunk.map(fetchPage))

    for (let j = 0; j < chunk.length; j++) {
      const s = results[j]
      if (s.status !== 'fulfilled' || !s.value) continue
      const page = s.value
      if (!page.properties) continue          // error-shaped page, skip
      const p             = page.properties
      const projectPageId = p['Projects']?.relation?.[0]?.id ?? null
      itemMap[chunk[j]] = {
        name:           p['Item Name']?.title?.[0]?.plain_text ?? null,
        status:         p['Status']?.status?.name              ?? null,
        projectPageId,
      }
    }
  }

  // --- projects (concurrent, one fetch per unique project) ---
  const uniqueProjIds = [...new Set(
    Object.values(itemMap).map(i => i.projectPageId).filter(Boolean)
  )]

  const projResults = await Promise.allSettled(uniqueProjIds.map(fetchPage))
  for (let i = 0; i < uniqueProjIds.length; i++) {
    const s = projResults[i]
    if (s.status !== 'fulfilled' || !s.value) continue
    const page = s.value
    if (!page.properties) continue
    const name = page.properties['Project Name']?.title?.[0]?.plain_text ?? null
    projMap[uniqueProjIds[i]] = { id: uniqueProjIds[i], name }
  }

  return { itemMap, projMap }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  try {
    // Fetch all drawings — no server-side sort (Notion rejects sorts when the
    // property name doesn't match exactly; sort by drawingNumber in JS below).
    const pages = await queryAll(DB_DRAWINGS, null)

    // Collect unique item IDs across all drawings
    const itemIdSet = new Set()
    for (const p of pages) {
      for (const r of (p.properties?.['Item']?.relation ?? [])) itemIdSet.add(r.id)
    }

    const { itemMap, projMap } = await resolveItems([...itemIdSet])

    const drawings = pages
      .map(p => {
        const base       = transformDrawing(p)
        const itemPageId = base.itemIds[0] ?? null
        const item       = itemMap[itemPageId] ?? {}
        const proj       = item.projectPageId ? projMap[item.projectPageId] : null
        return {
          ...base,
          itemId:      itemPageId,
          itemName:    item.name   ?? null,
          itemStatus:  item.status ?? null,
          projectId:   proj?.id    ?? null,
          projectName: proj?.name  ?? null,
        }
      })
      .sort((a, b) => (a.drawingNumber ?? '').localeCompare(b.drawingNumber ?? '', undefined, { numeric: true }))

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(drawings) }
  } catch (err) {
    return errResponse('drawings-register', err)
  }
}
