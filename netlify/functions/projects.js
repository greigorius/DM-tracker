/**
 * GET /api/projects
 * Returns all non-Done projects enriched with client name.
 */
import {
  corsHeaders, tokenGuard, errResponse,
  fetchNotion, notionHeaders, queryAll,
} from './_helpers.js'

const NOTION_API = 'https://api.notion.com/v1'
const DB_PROJECTS = process.env.NOTION_DB_PROJECTS

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  try {
    const pages = await queryAll(
      DB_PROJECTS,
      { property: 'Status', status: { does_not_equal: 'Done' } },
      { sorts: [{ property: 'Start Date', direction: 'descending' }] },
    )

    const clientIds = [...new Set(
      pages.map(p => p.properties['Client']?.relation?.[0]?.id).filter(Boolean)
    )]
    const clientMap = {}
    await Promise.all(clientIds.map(async id => {
      try {
        const r = await fetchNotion(`${NOTION_API}/pages/${id}`, { headers: notionHeaders() })
        const page = r.ok ? await r.json() : null
        clientMap[id] = page?.properties['Company']?.title?.[0]?.plain_text ?? null
      } catch { clientMap[id] = null }
    }))

    const enriched = pages.map(p => ({
      id:            p.id,
      name:          p.properties['Project Name']?.title?.[0]?.plain_text ?? p.id,
      status:        p.properties['Status']?.status?.name                  ?? null,
      client:        clientMap[p.properties['Client']?.relation?.[0]?.id]  ?? null,
      hoursRequired: p.properties['Total Hours Required']?.rollup?.number  ?? null,
      hoursSpent:    p.properties['Total Hours Spent']?.rollup?.number     ?? null,
      hoursLeft:     p.properties['Hrs Left']?.rollup?.number              ?? null,
    }))

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(enriched) }
  } catch (err) {
    return errResponse('projects', err)
  }
}
