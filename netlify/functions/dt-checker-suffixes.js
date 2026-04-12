/**
 * POST /api/dt-checker-suffixes
 * Returns unique {suffixNumber, itemPageId} pairs for a project from the drawings DB.
 * Env mapping: NOTION_DRAWING_SCHEDULE_DB_ID → NOTION_DB_DRAWINGS
 * Body: { projectName: string }
 */
import { corsHeaders, tokenGuard, errResponse, fetchNotion, notionHeaders } from './_helpers.js'

const DB_DRAWINGS = process.env.NOTION_DB_DRAWINGS

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  let body
  try { body = JSON.parse(event.body || '{}') } catch { body = {} }

  const { projectName } = body
  if (!projectName) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ suffixes: [], error: 'projectName is required' }) }
  }

  // Use first token of project name as a reliable contains filter on the formula string
  const projectIdentifier = projectName.split(' ')[0]

  try {
    let allRows = []
    let cursor
    do {
      const reqBody = {
        page_size: 100,
        filter: { property: 'Project', formula: { string: { contains: projectIdentifier } } },
        ...(cursor ? { start_cursor: cursor } : {}),
      }
      const r = await fetchNotion(
        `https://api.notion.com/v1/databases/${DB_DRAWINGS}/query`,
        { method: 'POST', headers: notionHeaders(), body: JSON.stringify(reqBody) }
      )
      if (!r.ok) {
        const txt = await r.text().catch(() => '')
        throw Object.assign(new Error(`Notion query failed: ${r.status} ${txt.slice(0, 200)}`), { status: r.status })
      }
      const data = await r.json()
      allRows = allRows.concat(data.results || [])
      cursor = data.has_more ? data.next_cursor : undefined
    } while (cursor)

    // Extract unique {suffixNumber, itemPageId} pairs
    const seen = new Set()
    const suffixes = []
    for (const row of allRows) {
      const p = row.properties
      const suffixNumber = p['Suffix #']?.rich_text?.[0]?.plain_text
        ?? p['Suffix #']?.title?.[0]?.plain_text
        ?? null
      const itemPageId = p['Item']?.relation?.[0]?.id || null
      const key = itemPageId || suffixNumber
      if (key && !seen.has(key)) {
        seen.add(key)
        suffixes.push({ suffixNumber, itemPageId })
      }
    }
    suffixes.sort((a, b) => (a.suffixNumber || '').localeCompare(b.suffixNumber || ''))

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ suffixes, error: null }) }
  } catch (err) {
    return errResponse('dt-checker-suffixes', err)
  }
}
