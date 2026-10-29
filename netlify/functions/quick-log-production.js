/**
 * POST /api/quick-log/production
 * Body: { taskId or itemId (to update existing), targetDate, notes }
 * If no taskId/itemId: creates a TDL entry.
 */
import { corsHeaders, tokenGuard, errResponse, fetchNotion, notionHeaders } from './_helpers.js'

const NOTION_API = 'https://api.notion.com/v1'
const DB_TODO    = process.env.NOTION_DB_TODO

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  const { taskId, itemId, targetDate, notes } = JSON.parse(event.body || '{}')

  try {
    if (taskId || itemId) {
      const pageId = taskId || itemId
      const r = await fetchNotion(`${NOTION_API}/pages/${pageId}`, {
        method: 'PATCH',
        headers: notionHeaders(),
        body: JSON.stringify({
          properties: {
            'Drawing Progress': { status: { name: 'Pre-Production' } },
            ...(targetDate && { 'Production Date': { date: { start: targetDate } } }),
            ...(notes      && { 'Notes':            { rich_text: [{ text: { content: notes } }] } }),
          },
        }),
      })
      if (!r.ok) { const t = await r.text(); throw new Error(`${r.status} ${t.slice(0, 200)}`) }
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ updated: pageId }) }
    }

    const r = await fetchNotion(`${NOTION_API}/pages`, {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify({
        parent: { database_id: DB_TODO },
        properties: {
          'Item Description': { title: [{ text: { content: notes || 'Schedule production' } }] },
          'Task Category':    { select: { name: 'Other' } },
          ...(targetDate && { 'Start Date': { date: { start: targetDate } } }),
        },
      }),
    })
    if (!r.ok) { const t = await r.text(); throw new Error(`${r.status} ${t.slice(0, 200)}`) }
    const page = await r.json()
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ id: page.id, url: page.url }) }
  } catch (err) {
    return errResponse('quick-log/production', err)
  }
}
