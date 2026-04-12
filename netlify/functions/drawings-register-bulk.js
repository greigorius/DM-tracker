/**
 * POST /api/drawings-register/bulk
 * Bulk-update multiple drawing pages.
 * Body: { updates: Array<{ id: string, fields: object }> }
 * Runs all PATCH requests concurrently (max 10 at a time to avoid rate limits).
 */
import { corsHeaders, tokenGuard, errResponse, fetchNotion, notionHeaders } from './_helpers.js'

const NOTION_API = 'https://api.notion.com/v1'

const FIELD_MAP = {
  s4SubmitActual:  { notion: 'S4 Submit Date (Actual)',  type: 'date'   },
  s4StatusDate:    { notion: 'S4 Status Date (Actual)',  type: 'date'   },
  s4Status:        { notion: 'S4 Status (LOR)',           type: 'select' },
  s5SubmitActual:  { notion: 'S5 Submit Date (Actual)',  type: 'date'   },
  s5StatusDate:    { notion: 'S5 Status Date (Actual)',  type: 'date'   },
  s5Status:        { notion: 'S5 Status (F&P)',           type: 'select' },
  c01SubmitActual: { notion: 'C01 Submit Date (Actual)', type: 'date'   },
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

async function patchOne(id, properties) {
  const r = await fetchNotion(`${NOTION_API}/pages/${id}`, {
    method: 'PATCH',
    headers: notionHeaders(),
    body: JSON.stringify({ properties }),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`${id}: ${r.status} ${t.slice(0, 100)}`)
  }
  return { id, ok: true }
}

async function runConcurrently(tasks, concurrency = 10) {
  const results = []
  for (let i = 0; i < tasks.length; i += concurrency) {
    const chunk = tasks.slice(i, i + concurrency)
    const settled = await Promise.allSettled(chunk.map(t => t()))
    for (const s of settled) {
      results.push(s.status === 'fulfilled' ? s.value : { ok: false, error: s.reason?.message })
    }
  }
  return results
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { updates } = body
  if (!Array.isArray(updates) || updates.length === 0)
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'updates array is required' }) }

  try {
    const tasks = updates
      .map(({ id, fields }) => {
        if (!id || !fields) return null
        const properties = buildProperties(fields)
        if (Object.keys(properties).length === 0) return null
        return () => patchOne(id, properties)
      })
      .filter(Boolean)

    const results = await runConcurrently(tasks)
    const failed  = results.filter(r => !r.ok)

    return {
      statusCode: failed.length === 0 ? 200 : 207,
      headers: corsHeaders,
      body: JSON.stringify({ ok: failed.length === 0, results, failed }),
    }
  } catch (err) {
    return errResponse('drawings-register-bulk', err)
  }
}
