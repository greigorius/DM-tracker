/**
 * POST /api/dt-checker-suffixes
 * Returns all items (tasks) for a project as {suffixNumber, itemPageId} pairs.
 * suffixNumber = item name (used as the suffix display label).
 * Body: { projectPageId: string }
 */
import { corsHeaders, tokenGuard, errResponse, fetchNotion, notionHeaders } from './_helpers.js'

const DB_TASKS = process.env.NOTION_DB_TASKS

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  let body
  try { body = JSON.parse(event.body || '{}') } catch { body = {} }

  const { projectPageId } = body
  if (!projectPageId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ suffixes: [], error: 'projectPageId is required' }) }
  }

  try {
    const suffixes = []
    let cursor
    do {
      const reqBody = {
        page_size: 100,
        filter: { property: 'Projects', relation: { contains: projectPageId } },
        sorts: [{ property: 'Item Name', direction: 'ascending' }],
        ...(cursor ? { start_cursor: cursor } : {}),
      }
      const r = await fetchNotion(
        `https://api.notion.com/v1/databases/${DB_TASKS}/query`,
        { method: 'POST', headers: notionHeaders(), body: JSON.stringify(reqBody) }
      )
      if (!r.ok) {
        const txt = await r.text().catch(() => '')
        throw Object.assign(new Error(`Tasks query failed: ${r.status} ${txt.slice(0, 200)}`), { status: r.status })
      }
      const data = await r.json()
      for (const row of data.results || []) {
        const itemName = row.properties['Item Name']?.title?.[0]?.plain_text ?? null
        suffixes.push({ suffixNumber: itemName, itemPageId: row.id })
      }
      cursor = data.has_more ? data.next_cursor : undefined
    } while (cursor)

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ suffixes, error: null }) }
  } catch (err) {
    return errResponse('dt-checker-suffixes', err)
  }
}
