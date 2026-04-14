/**
 * POST /api/quick-log/comment-review
 * Creates a to-do entry in Notion tagged as "Comment Review".
 * Body: { description, itemId, projectId, date }
 */
import { corsHeaders, tokenGuard, errResponse, fetchNotion, notionHeaders } from './_helpers.js'

const NOTION_API = 'https://api.notion.com/v1'
const DB_TODO    = process.env.NOTION_DB_TODO

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  const { description, itemId, date } = JSON.parse(event.body || '{}')
  const today = new Date().toISOString().slice(0, 10)

  try {
    const r = await fetchNotion(`${NOTION_API}/pages`, {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify({
        parent: { database_id: DB_TODO },
        properties: {
          'Item Description': { title: [{ text: { content: description || 'Review comments' } }] },
          'Start Date':       { date:  { start: date || today } },
          'Task Category':    { select: { name: 'Comment Review' } },
          ...(itemId && { 'Item': { relation: [{ id: itemId }] } }),
        },
      }),
    })
    if (!r.ok) { const t = await r.text(); throw new Error(`${r.status} ${t.slice(0, 200)}`) }
    const page = await r.json()
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ id: page.id, url: page.url }) }
  } catch (err) {
    return errResponse('quick-log/comment-review', err)
  }
}
