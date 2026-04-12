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
const DB_TASKS    = process.env.NOTION_DB_TASKS
const DB_PROJECTS = process.env.NOTION_DB_PROJECTS
const NOTION_API  = 'https://api.notion.com/v1'

async function fetchPage(id) {
  try {
    const r = await fetchNotion(`${NOTION_API}/pages/${id}`, { headers: notionHeaders() })
    return r.ok ? r.json() : null
  } catch { return null }
}

/**
 * Given a list of item page IDs (from drawing relations), batch-fetch
 * item names, statuses, and project IDs — firing project fetches as
 * project IDs are discovered (same pipeline as tasks.js).
 */
async function resolveItems(itemIds, batchSize = 25) {
  const itemMap      = {}
  const projPromises = {}

  for (let i = 0; i < itemIds.length; i += batchSize) {
    const chunk = itemIds.slice(i, i + batchSize)
    const pages = await Promise.all(chunk.map(fetchPage))

    for (let j = 0; j < chunk.length; j++) {
      const id   = chunk[j]
      const page = pages[j]
      if (!page) continue
      const p              = page.properties ?? {}
      const name           = p['Item Name']?.title?.[0]?.plain_text ?? null
      const status         = p['Status']?.status?.name ?? null
      const projectPageId  = p['Projects']?.relation?.[0]?.id ?? null
      itemMap[id] = { name, status, projectPageId }
      if (projectPageId && !projPromises[projectPageId]) {
        projPromises[projectPageId] = fetchPage(projectPageId)
      }
    }
  }

  const projMap = {}
  await Promise.all(
    Object.entries(projPromises).map(async ([id, promise]) => {
      const page = await promise
      if (!page) return
      const name = page.properties?.['Project Name']?.title?.[0]?.plain_text ?? null
      projMap[id] = { id, name }
    }),
  )

  return { itemMap, projMap }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  try {
    // No sorts — Notion rejects server-side sorts if the property name doesn't
    // exactly match (title fields are especially fussy). Sort client-side instead.
    const pages = await queryAll(DB_DRAWINGS, null)

    // Collect unique item IDs across all drawings
    const itemIdSet = new Set()
    for (const p of pages) {
      const rel = p.properties?.['Item']?.relation ?? []
      for (const r of rel) itemIdSet.add(r.id)
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
