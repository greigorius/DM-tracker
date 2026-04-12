/**
 * GET /api/drawings-register/chunk?itemIds=id1,id2,...
 * Returns drawings filtered to a specific set of item IDs using an OR filter —
 * the same chunked approach used by project-drawings / fetchDrawingMap.
 * Frontend fires multiple of these in parallel to load all drawings without
 * any single call timing out.
 * Max ~25 item IDs per call keeps each Notion OR filter small and fast.
 */
import {
  corsHeaders, tokenGuard, errResponse,
  queryAll, transformDrawing,
} from './_helpers.js'

const DB_DRAWINGS = process.env.NOTION_DB_DRAWINGS

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  const itemIds = (event.queryStringParameters?.itemIds ?? '').split(',').filter(Boolean)
  if (!itemIds.length) {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify([]) }
  }

  try {
    const filter = itemIds.length === 1
      ? { property: 'Item', relation: { contains: itemIds[0] } }
      : { or: itemIds.map(id => ({ property: 'Item', relation: { contains: id } })) }

    const pages    = await queryAll(DB_DRAWINGS, filter)
    const drawings = pages.map(transformDrawing)

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(drawings) }
  } catch (err) {
    return errResponse('drawings-register-chunk', err)
  }
}
