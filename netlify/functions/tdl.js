/**
 * GET /api/tdl
 * Query params: ?ids=id1,id2,...  (optional, filters by Item relation)
 */
import { corsHeaders, tokenGuard, errResponse, queryAll } from './_helpers.js'

const DB_TODO = process.env.NOTION_DB_TODO

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  const ids = event.queryStringParameters?.ids
    ? event.queryStringParameters.ids.split(',').filter(Boolean)
    : null

  try {
    let filter
    if (ids && ids.length > 0) {
      filter = ids.length === 1
        ? { property: 'Item', relation: { contains: ids[0] } }
        : { or: ids.map(id => ({ property: 'Item', relation: { contains: id } })) }
    }

    const pages = await queryAll(DB_TODO, filter)
    const items = pages.map(p => ({
      id:          p.id,
      tdlId:       p.properties['ID']?.unique_id?.number               ?? null,
      description: p.properties['Item Description']?.title?.[0]?.plain_text ?? null,
      status:      p.properties['Status']?.status?.name                ?? null,
      assignee:    p.properties['Assigned To']?.people?.[0]?.name      ?? null,
      date:        p.properties['Start Date']?.date?.start             ?? null,
      category:    p.properties['Task Category']?.select?.name         ?? null,
    }))

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(items) }
  } catch (err) {
    return errResponse('tdl', err)
  }
}
