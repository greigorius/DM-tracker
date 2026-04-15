/**
 * GET /api/all-items
 * Returns all items across all projects, enriched with project names.
 * Query params: ?project=id, ?phase=phase, ?status=status, ?category=category
 */
import {
  corsHeaders, tokenGuard, errResponse,
  fetchNotion, notionHeaders, queryAll, transformItem, withNoPcsa,
} from './_helpers.js'

const DB_TASKS    = process.env.NOTION_DB_TASKS
const DB_PROJECTS = process.env.NOTION_DB_PROJECTS
const NOTION_API  = 'https://api.notion.com/v1'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  const { project, phase, status, category } = event.queryStringParameters || {}

  try {
    // Fetch items (optionally filtered by project)
    let filter = null
    if (project && project !== 'all') {
      filter = { property: 'Projects', relation: { contains: project } }
    }
    const pages = await queryAll(DB_TASKS, withNoPcsa(filter))

    // Build item→project mapping from raw pages before transformation
    const itemProjectIds = {}
    const projIdSet      = new Set()
    for (const page of pages) {
      const projId = page.properties?.['Projects']?.relation?.[0]?.id ?? null
      itemProjectIds[page.id] = projId
      if (projId) projIdSet.add(projId)
    }

    // Resolve project names — prefer querying DB (one request) over per-page fetches
    const projMap = {}
    if (DB_PROJECTS && projIdSet.size > 0) {
      try {
        const projectPages = await queryAll(DB_PROJECTS, null)
        for (const p of projectPages) {
          projMap[p.id] = {
            id:   p.id,
            name: p.properties?.['Project Name']?.title?.[0]?.plain_text ?? p.id,
          }
        }
      } catch {
        // Fallback to individual fetches if DB query fails
        await Promise.all([...projIdSet].map(async id => {
          try {
            const r = await fetchNotion(`${NOTION_API}/pages/${id}`, { headers: notionHeaders() })
            if (r.ok) {
              const page = await r.json()
              projMap[id] = { id, name: page.properties?.['Project Name']?.title?.[0]?.plain_text ?? id }
            }
          } catch {}
        }))
      }
    } else {
      await Promise.all([...projIdSet].map(async id => {
        try {
          const r = await fetchNotion(`${NOTION_API}/pages/${id}`, { headers: notionHeaders() })
          if (r.ok) {
            const page = await r.json()
            projMap[id] = { id, name: page.properties?.['Project Name']?.title?.[0]?.plain_text ?? id }
          }
        } catch {}
      }))
    }

    // Transform items and enrich with project info
    let items = pages.map(page => {
      const item      = transformItem(page)
      const projectId = itemProjectIds[page.id] ?? null
      return {
        ...item,
        projectId,
        projectName: projectId ? (projMap[projectId]?.name ?? null) : null,
      }
    })

    // Apply query-param filters
    if (phase    && phase    !== 'all') items = items.filter(i => i.dmPhase          === phase)
    if (category && category !== 'all') items = items.filter(i => i.contractCategory === category)
    if (status   && status   !== 'all') {
      const COMPLETE = new Set(['PC Approved', 'In Manufacture', 'Complete', 'Omitted'])
      if      (status === 'active')   items = items.filter(i => !COMPLETE.has(i.status))
      else if (status === 'complete') items = items.filter(i =>  COMPLETE.has(i.status))
      else                            items = items.filter(i => i.status === status)
    }

    // Sort: project name → item name
    items.sort((a, b) => {
      const p = (a.projectName ?? '').localeCompare(b.projectName ?? '')
      return p !== 0 ? p : (a.name ?? '').localeCompare(b.name ?? '')
    })

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(items) }
  } catch (err) {
    return errResponse('all-items', err)
  }
}
