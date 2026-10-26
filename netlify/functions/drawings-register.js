/**
 * GET /api/drawings-register
 * Returns all drawings from MDS DB, enriched with item name, item status,
 * and project name so the frontend can group and filter.
 *
 * Performance strategy:
 *   1. queryAll drawings  (1–N paginated Notion calls, very fast)
 *   2. queryAll ALL items (1–N paginated calls — 1 batch vs N individual fetches)
 *   3. fetch project pages concurrently (one per unique project, ~5-20)
 *
 * This replaces the original approach of fetching every item page individually,
 * which was timing out Netlify's 10-second function limit.
 */
import {
  corsHeaders, tokenGuard, errResponse,
  fetchNotion, notionHeaders, queryAll, transformDrawing, withNoPcsa,
} from './_helpers.js'

const DB_DRAWINGS = process.env.NOTION_DB_DRAWINGS
const DB_TASKS    = process.env.NOTION_DB_TASKS
const NOTION_API  = 'https://api.notion.com/v1'

async function fetchPage(id) {
  try {
    const r = await fetchNotion(`${NOTION_API}/pages/${id}`, { headers: notionHeaders() })
    if (!r.ok) return null
    return await r.json()
  } catch { return null }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  try {
    // ── 1. Fetch all drawings (paginated, no sort) ───────────────────────────
    const drawingPages = await queryAll(DB_DRAWINGS, null)

    // ── 2. Fetch ALL items from TASKS DB in one paginated query ──────────────
    //    This is far faster than fetching each item page individually.
    const allItemPages = await queryAll(DB_TASKS, withNoPcsa(null))

    // Index items by page ID
    const itemMap  = {}
    const projIdSet = new Set()
    for (const page of allItemPages) {
      const p             = page.properties ?? {}
      const projectPageId = p['Projects']?.relation?.[0]?.id ?? null
      itemMap[page.id] = {
        name:           p['Item Name']?.title?.[0]?.plain_text ?? null,
        status:         (p['Item Status'] ?? p['Status'])?.status?.name              ?? null,
        projectPageId,
      }
      if (projectPageId) projIdSet.add(projectPageId)
    }

    // ── 3. Fetch project pages concurrently (one per unique project) ─────────
    const projMap = {}
    await Promise.allSettled([...projIdSet].map(async (projId) => {
      const page = await fetchPage(projId)
      if (!page?.properties) return
      projMap[projId] = {
        id:   projId,
        name: page.properties['Project Name']?.title?.[0]?.plain_text ?? null,
      }
    }))

    // ── 4. Assemble and sort drawings ────────────────────────────────────────
    const drawings = drawingPages
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
      .sort((a, b) =>
        (a.drawingNumber ?? '').localeCompare(b.drawingNumber ?? '', undefined, { numeric: true })
      )

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(drawings) }
  } catch (err) {
    return errResponse('drawings-register', err)
  }
}
