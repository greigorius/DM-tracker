/**
 * POST /api/dt-checker-drawings
 * Returns drawing rows for a selected item from the drawings DB.
 * Env mapping: NOTION_DRAWING_SCHEDULE_DB_ID → NOTION_DB_DRAWINGS
 * Body: { itemPageId: string }
 */
import { corsHeaders, tokenGuard, errResponse, fetchNotion, notionHeaders } from './_helpers.js'

const DB_DRAWINGS = process.env.NOTION_DB_DRAWINGS

function getVal(prop) {
  if (!prop) return null
  switch (prop.type) {
    case 'title':      return prop.title?.map(t => t.plain_text).join('') || null
    case 'rich_text':  return prop.rich_text?.map(t => t.plain_text).join('') || null
    case 'select':     return prop.select?.name || null
    case 'date':       return prop.date?.start || null
    case 'people':     return prop.people?.map(p => p.name).filter(Boolean).join(', ') || null
    case 'formula':
      if (prop.formula?.type === 'string') return prop.formula.string || null
      if (prop.formula?.type === 'date')   return prop.formula.date?.start || null
      return null
    case 'rollup':
      if (prop.rollup?.type === 'array')
        return prop.rollup.array?.map(i => getVal(i)).filter(Boolean).join(', ') || null
      if (prop.rollup?.type === 'date') return prop.rollup.date?.start || null
      return null
    default: return null
  }
}

function mapRow(row) {
  const p = row.properties
  return {
    project:                getVal(p['Project']),
    item:                   getVal(p['Item']),
    assignedTo:             getVal(p['Person']),
    suffixNumber:           getVal(p['Suffix #']),
    drawingNumber:          getVal(p['Drawing Number']),
    pageDescription:        getVal(p['Page Description']),
    drawingTitle1:          getVal(p['Drawing Title 1']),
    drawingTitle2:          getVal(p['Drawing Title 2']),
    drawingTitle3:          getVal(p['Drawing Title 3']),
    revision:               getVal(p['Rev']),
    s4Status:               getVal(p['S4 Status (LOR)']),
    s4StatusDate:           getVal(p['S4 Status Date (LOR)']) ?? getVal(p['S4 Status Date (Actual)']),
    s4DtDeliveryDateActual: getVal(p['S4 DT Delivery Date (Actual)']),
    s5Status:               getVal(p['S5 Status (F&P)']),
    s5StatusDate:           getVal(p['S5 Status Date (F&P)']) ?? getVal(p['S5 Status Date (Actual)']),
    s5DtDeliveryDateActual: getVal(p['S5 DT Delivery Date (Actual)']),
    designStage:            getVal(p['Design Stage']),
  }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  let body
  try { body = JSON.parse(event.body || '{}') } catch { body = {} }

  const { itemPageId } = body
  if (!itemPageId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ rows: [], error: 'itemPageId is required' }) }
  }

  try {
    let allRows = []
    let cursor
    do {
      const reqBody = {
        page_size: 100,
        filter: { property: 'Item', relation: { contains: itemPageId } },
        sorts: [{ property: 'Drawing Number', direction: 'ascending' }],
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
      allRows = allRows.concat((data.results || []).map(mapRow))
      cursor = data.has_more ? data.next_cursor : undefined
    } while (cursor)

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ rows: allRows, error: null }) }
  } catch (err) {
    return errResponse('dt-checker-drawings', err)
  }
}
