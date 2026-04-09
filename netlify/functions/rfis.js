/**
 * GET /api/rfis
 * Query params: ?ids=id1,id2,...  (optional)
 */
import { corsHeaders, tokenGuard, errResponse, queryAll, transformRFI } from './_helpers.js'

const DB_RFIS = process.env.NOTION_DB_RFIS

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
        ? { property: 'Related Item(s)', relation: { contains: ids[0] } }
        : { or: ids.map(id => ({ property: 'Related Item(s)', relation: { contains: id } })) }
    }

    const pages = await queryAll(DB_RFIS, filter)
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(pages.map(transformRFI)) }
  } catch (err) {
    return errResponse('rfis', err)
  }
}
