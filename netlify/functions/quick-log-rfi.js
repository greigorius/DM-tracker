/**
 * POST /api/quick-log/rfi
 * Body: { description or subject (required), date }
 */
import { corsHeaders, tokenGuard, errResponse, fetchNotion, notionHeaders } from './_helpers.js'

const NOTION_API = 'https://api.notion.com/v1'
const DB_RFIS    = process.env.NOTION_DB_RFIS

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  const { description, subject, date } = JSON.parse(event.body || '{}')
  const content = subject || description
  if (!content) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'subject / description is required' }) }
  }

  try {
    const r = await fetchNotion(`${NOTION_API}/pages`, {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify({
        parent: { database_id: DB_RFIS },
        properties: {
          'Name': { title: [{ text: { content } }] },
          ...(date && { 'Date': { date: { start: date } } }),
        },
      }),
    })
    if (!r.ok) { const t = await r.text(); throw new Error(`${r.status} ${t.slice(0, 200)}`) }
    const page = await r.json()
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ id: page.id, url: page.url }) }
  } catch (err) {
    return errResponse('quick-log/rfi', err)
  }
}
