/**
 * POST /api/quick-log/todo
 * Body: { description (required), itemId, assignee, category, date }
 */
import { corsHeaders, tokenGuard, errResponse, fetchNotion, notionHeaders } from './_helpers.js'

const NOTION_API = 'https://api.notion.com/v1'
const DB_TODO    = process.env.NOTION_DB_TODO

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  const { description, itemId, assignee, category, date } = JSON.parse(event.body || '{}')
  if (!description) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'description is required' }) }
  }

  const today = new Date().toISOString().slice(0, 10)

  try {
    const r = await fetchNotion(`${NOTION_API}/pages`, {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify({
        parent: { database_id: DB_TODO },
        properties: {
          'Item Description': { title: [{ text: { content: description } }] },
          'Start Date':       { date:  { start: date || today } },
          ...(itemId   && { 'Item':          { relation: [{ id: itemId }] } }),
          ...(assignee && { 'Assigned To':   { people:   [{ id: assignee }] } }),
          ...(category && { 'Task Category': { select:   { name: category } } }),
        },
      }),
    })
    if (!r.ok) { const t = await r.text(); throw new Error(`${r.status} ${t.slice(0, 200)}`) }
    const page = await r.json()
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ id: page.id, url: page.url }) }
  } catch (err) {
    return errResponse('quick-log/todo', err)
  }
}
