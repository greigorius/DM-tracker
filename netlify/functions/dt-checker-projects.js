/**
 * GET /api/dt-checker-projects
 * Returns all projects from Notion for the DT Drawing Checker.
 * Env mapping: NOTION_API_KEY → NOTION_TOKEN, NOTION_PROJECTS_DB_ID → NOTION_DB_PROJECTS
 */
import { corsHeaders, tokenGuard, errResponse, fetchNotion, notionHeaders } from './_helpers.js'

const DB_PROJECTS = process.env.NOTION_DB_PROJECTS

function getVal(prop) {
  if (!prop) return null
  switch (prop.type) {
    case 'title':     return prop.title?.map(t => t.plain_text).join('') || null
    case 'rich_text': return prop.rich_text?.map(t => t.plain_text).join('') || null
    case 'select':    return prop.select?.name || null
    case 'formula':
      if (prop.formula?.type === 'string') return prop.formula.string || null
      if (prop.formula?.type === 'number') return prop.formula.number != null ? String(prop.formula.number) : null
      return null
    case 'rollup':
      if (prop.rollup?.type === 'array')
        return prop.rollup.array?.map(i => getVal(i)).filter(Boolean).join(', ') || null
      return null
    default: return null
  }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  try {
    let allResults = []
    let cursor
    do {
      const body = { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }
      const r = await fetchNotion(
        `https://api.notion.com/v1/databases/${DB_PROJECTS}/query`,
        { method: 'POST', headers: notionHeaders(), body: JSON.stringify(body) }
      )
      if (!r.ok) {
        const txt = await r.text().catch(() => '')
        throw Object.assign(new Error(`Notion query failed: ${r.status} ${txt.slice(0, 200)}`), { status: r.status })
      }
      const data = await r.json()
      allResults = allResults.concat(data.results || [])
      cursor = data.has_more ? data.next_cursor : undefined
    } while (cursor)

    const projects = allResults.map(row => ({
      pageId:         row.id,
      projectName:    getVal(row.properties['Project Name']),
      projectNumber:  getVal(row.properties['Project #']),
      projectAddress: getVal(row.properties['Project Address']),
      mainContractor: getVal(row.properties['Main Contractor']),
      architect:      getVal(row.properties['Architect']),
    })).filter(p => p.projectName)

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ projects, error: null }) }
  } catch (err) {
    return errResponse('dt-checker-projects', err)
  }
}
