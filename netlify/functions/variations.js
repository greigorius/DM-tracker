/**
 * GET /api/variations
 * Returns all variations from the Notion Variations database, with project names resolved.
 * Requires NOTION_DB_VARIATIONS env var. Returns { items: [], configured: false } if not set.
 *
 * The transformer tries multiple common property-name conventions so it works
 * with different Notion database schemas.
 */
import {
  corsHeaders, tokenGuard, errResponse,
  fetchNotion, notionHeaders, queryAll,
  titleVal, statusVal, selectVal,
} from './_helpers.js'

const DB_VARIATIONS = process.env.NOTION_DB_VARIATIONS
const DB_PROJECTS   = process.env.NOTION_DB_PROJECTS
const NOTION_API    = 'https://api.notion.com/v1'

function transformVariation(page) {
  const p = page.properties ?? {}

  const varNumber =
    p['Variation Number']?.number ??
    p['Var No.']?.number          ??
    p['Var No']?.number           ??
    p['ID']?.unique_id?.number    ??
    null

  const title =
    titleVal(p, 'Variation Title') ??
    titleVal(p, 'Variation Name')  ??
    titleVal(p, 'Name')            ??
    titleVal(p, 'Title')           ??
    null

  const description =
    p['Description']?.rich_text?.[0]?.plain_text          ??
    p['Variation Description']?.rich_text?.[0]?.plain_text ??
    p['Notes']?.rich_text?.[0]?.plain_text                 ??
    null

  const status =
    statusVal(p, 'Status') ??
    selectVal(p, 'Status') ??
    null

  // Project may be a direct relation or resolved via an Item relation
  const projectId =
    p['Projects']?.relation?.[0]?.id ??
    p['Project']?.relation?.[0]?.id  ??
    null

  const itemId =
    p['Item']?.relation?.[0]?.id          ??
    p['Related Item']?.relation?.[0]?.id  ??
    p['Items']?.relation?.[0]?.id         ??
    null

  const value =
    p['Value']?.number            ??
    p['Variation Value']?.number  ??
    p['Cost']?.number             ??
    p['Amount']?.number           ??
    null

  const dateIssued =
    p['Date Issued']?.date?.start  ??
    p['Issue Date']?.date?.start   ??
    p['Date']?.date?.start         ??
    null

  const dateApproved =
    p['Date Approved']?.date?.start  ??
    p['Approval Date']?.date?.start  ??
    null

  return {
    id: page.id,
    varNumber,
    title,
    description,
    status,
    projectId,
    itemId,
    value,
    dateIssued,
    dateApproved,
    type:       selectVal(p, 'Type') ?? selectVal(p, 'Variation Type') ?? null,
    contractor: p['Contractor']?.select?.name ?? p['Contractor']?.rich_text?.[0]?.plain_text ?? null,
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

    // Separate items that already have a direct projectId from those needing item resolution
    const directProjSet      = new Set()
    const itemsNeedingLookup = []

    for (const v of variations) {
      if (v.projectId) {
        directProjSet.add(v.projectId)
      } else if (v.itemId) {
        itemsNeedingLookup.push(v.itemId)
      }
    }

    // Fetch item pages to derive project IDs AND item names
    const itemInfoMap = {}   // itemId → { projectId, name }
    const projIdSet   = new Set(directProjSet)
    const uniqueItemIds = [...new Set(itemsNeedingLookup)]

    // Also fetch items that have a direct projectId so we can get their names
    const allItemIds = [...new Set([
      ...uniqueItemIds,
      ...variations.filter(v => v.itemId).map(v => v.itemId),
    ])]

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

    // Resolve project names
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

    // Enrich variations with project info + item name
    const enriched = variations.map(v => {
      const itemInfo  = v.itemId ? (itemInfoMap[v.itemId] ?? null) : null
      const projectId = v.projectId ?? itemInfo?.projectId ?? null
      return {
        ...v,
        projectId,
        projectName: projectId ? (projMap[projectId]?.name ?? null) : null,
        itemName:    itemInfo?.name ?? null,
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
