/**
 * GET /api/task-categories
 * Returns the predefined options for the 'Task Category' select property
 * from the TASKS (NOTION_DB_TODO) Notion database schema.
 */
import {
  corsHeaders, tokenGuard, errResponse,
  fetchNotion, notionHeaders,
} from './_helpers.js'

const NOTION_API = 'https://api.notion.com/v1'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  const DB_TODO = process.env.NOTION_DB_TODO
  if (!DB_TODO) return { statusCode: 503, headers: corsHeaders, body: JSON.stringify({ error: 'NOTION_DB_TODO not configured' }) }

  try {
    const r = await fetchNotion(`${NOTION_API}/databases/${DB_TODO}`, { headers: notionHeaders() })
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      throw new Error(`Notion DB fetch failed: ${r.status} ${txt.slice(0, 200)}`)
    }
    const db = await r.json()
    const options = db.properties?.['Task Category']?.select?.options ?? []
    const categories = options.map(o => o.name).filter(Boolean).sort()
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(categories) }
  } catch (err) {
    return errResponse('task-categories', err)
  }
}
