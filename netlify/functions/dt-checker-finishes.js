/**
 * POST /api/dt-checker-finishes
 * Finishes database lookup by suffix number (and optionally project page ID).
 * Env mapping: NOTION_FINISHES_DB_ID → NOTION_DB_FINISHES
 * Body: { suffixNumber: string, projectPageId?: string }
 */
import { corsHeaders, tokenGuard, errResponse, fetchNotion, notionHeaders } from './_helpers.js'

const DB_FINISHES = process.env.NOTION_DB_FINISHES

function getVal(prop) {
  if (!prop) return null
  switch (prop.type) {
    case 'title':      return prop.title?.map(t => t.plain_text).join('') || null
    case 'rich_text':  return prop.rich_text?.map(t => t.plain_text).join('') || null
    case 'select':     return prop.select?.name || null
    case 'checkbox':   return String(prop.checkbox)
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

  if (!DB_FINISHES) {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ rows: [], error: 'Finishes database not configured' }) }
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch { body = {} }

  const { suffixNumber, projectPageId } = body
  if (!suffixNumber) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ rows: [], error: 'suffixNumber is required' }) }
  }

  const suffixFilter = {
    property: 'Suffix',
    rollup: { any: { rich_text: { equals: suffixNumber } } },
  }
  const filter = projectPageId
    ? { and: [suffixFilter, { property: 'Project', relation: { contains: projectPageId } }] }
    : suffixFilter

  try {
    const r = await fetchNotion(
      `https://api.notion.com/v1/databases/${DB_FINISHES}/query`,
      { method: 'POST', headers: notionHeaders(), body: JSON.stringify({ filter, page_size: 100 }) }
    )
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      throw Object.assign(new Error(`Notion query failed: ${r.status} ${txt.slice(0, 200)}`), { status: r.status })
    }
    const data = await r.json()
    const rows = (data.results || []).map(page => {
      const p = page.properties
      return {
        specRef:          getVal(p['Spec Ref']),
        cadRef:           getVal(p['CAD Ref']),
        finishDescription:getVal(p['Finish Description']),
        sampleRef:        getVal(p['Sample Ref']),
        approved:         getVal(p['APPROVED']),
        pageId:           page.id,
      }
    })

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ rows, error: null }) }
  } catch (err) {
    return errResponse('dt-checker-finishes', err)
  }
}
