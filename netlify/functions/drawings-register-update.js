/**
 * POST /api/drawings-register/update
 * Update one or more fields on a drawing page.
 * Body: { id: string, fields: { [fieldKey]: value } }
 *
 * Supported fieldKeys:
 *   s4SubmitActual    → 'S4 Submit Date (Actual)'  (date string | null)
 *   s4StatusDate      → 'S4 Status Date (Actual)'  (date string | null)
 *   s4Status          → 'S4 Status (LOR)'           (select name | null)
 *   s5SubmitActual    → 'S5 Submit Date (Actual)'  (date string | null)
 *   s5StatusDate      → 'S5 Status Date (Actual)'  (date string | null)
 *   s5Status          → 'S5 Status (F&P)'           (select name | null)
 */
import { corsHeaders, tokenGuard, errResponse, fetchNotion, notionHeaders } from './_helpers.js'

const NOTION_API = 'https://api.notion.com/v1'

// Map from our field keys → Notion property names + type
const FIELD_MAP = {
  s4SubmitActual: { notion: 'S4 Submit Date (Actual)', type: 'date' },
  s4StatusDate:   { notion: 'S4 Status Date (Actual)', type: 'date' },
  s4Status:       { notion: 'S4 Status (LOR)',          type: 'select' },
  s5SubmitActual: { notion: 'S5 Submit Date (Actual)', type: 'date' },
  s5StatusDate:   { notion: 'S5 Status Date (Actual)', type: 'date' },
  s5Status:       { notion: 'S5 Status (F&P)',          type: 'select' },
}

function buildProperties(fields) {
  const properties = {}
  for (const [key, value] of Object.entries(fields)) {
    const mapping = FIELD_MAP[key]
    if (!mapping) continue
    if (mapping.type === 'date') {
      properties[mapping.notion] = value ? { date: { start: value } } : { date: null }
    } else if (mapping.type === 'select') {
      properties[mapping.notion] = value ? { select: { name: value } } : { select: null }
    }
  }
  return properties
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { id, fields } = body
  if (!id)     return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'id is required' }) }
  if (!fields) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'fields is required' }) }

  const properties = buildProperties(fields)
  if (Object.keys(properties).length === 0)
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'No valid fields provided' }) }

  try {
    const r = await fetchNotion(`${NOTION_API}/pages/${id}`, {
      method: 'PATCH',
      headers: notionHeaders(),
      body: JSON.stringify({ properties }),
    })
    if (!r.ok) {
      const t = await r.text()
      throw new Error(`${r.status} ${t.slice(0, 200)}`)
    }
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    return errResponse('drawings-register-update', err)
  }
}
