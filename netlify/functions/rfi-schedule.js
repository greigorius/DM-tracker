/**
 * GET /api/rfi-schedule
 * Returns all RFIs with project and item info resolved server-side.
 */
import {
  corsHeaders, tokenGuard, errResponse,
  fetchNotion, notionHeaders, queryAll, transformRFI,
} from './_helpers.js'

const DB_RFIS     = process.env.NOTION_DB_RFIS
const DB_PROJECTS = process.env.NOTION_DB_PROJECTS
const NOTION_API  = 'https://api.notion.com/v1'

async function fetchPage(id) {
  try {
    const r = await fetchNotion(`${NOTION_API}/pages/${id}`, { headers: notionHeaders() })
    return r.ok ? await r.json() : null
  } catch { return null }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  try {
    const pages = await queryAll(DB_RFIS, null)
    const rfis  = pages.map(transformRFI)

    // Collect every unique item ID referenced by any RFI
    const itemIdSet = new Set()
    for (const rfi of rfis) {
      for (const id of rfi.relatedItemIds) itemIdSet.add(id)
    }

    // Batch-fetch item pages to resolve item names + project IDs
    const itemInfoMap = {}  // itemId → { name, projectId }
    const projIdSet   = new Set()
    const itemIds     = [...itemIdSet]

    for (let i = 0; i < itemIds.length; i += 25) {
      const chunk     = itemIds.slice(i, i + 25)
      const itemPages = await Promise.all(chunk.map(fetchPage))
      for (let j = 0; j < chunk.length; j++) {
        const page = itemPages[j]
        if (!page) continue
        const p       = page.properties ?? {}
        const projId  = p['Projects']?.relation?.[0]?.id ?? null
        const name    = p['Item Name']?.title?.[0]?.plain_text ?? null
        itemInfoMap[chunk[j]] = { name, projectId: projId }
        if (projId) projIdSet.add(projId)
      }
    }

    // Resolve project names — prefer a single DB query over N page fetches
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

    // Enrich each RFI with project + item name info
    const enriched = rfis.map(rfi => {
      const firstItemInfo = rfi.relatedItemIds.length > 0
        ? (itemInfoMap[rfi.relatedItemIds[0]] ?? null)
        : null
      const projectId = firstItemInfo?.projectId ?? null

      return {
        ...rfi,
        projectId,
        projectName:       projectId ? (projMap[projectId]?.name ?? null) : null,
        relatedItemNames:  rfi.relatedItemIds
          .map(id => itemInfoMap[id]?.name)
          .filter(Boolean),
      }
    })

    // Sort by project name, then RFI number
    enriched.sort((a, b) => {
      const p = (a.projectName ?? '').localeCompare(b.projectName ?? '')
      return p !== 0 ? p : (a.rfiNumber ?? 0) - (b.rfiNumber ?? 0)
    })

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(enriched) }
  } catch (err) {
    return errResponse('rfi-schedule', err)
  }
}
