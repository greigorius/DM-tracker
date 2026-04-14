/**
 * GET /api/item-drawings
 * Returns drawings grouped by item ID.
 * Query params: ?ids=itemId1,itemId2,...
 */
import {
  corsHeaders, tokenGuard, errResponse,
  fetchDrawingMap,
} from './_helpers.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  const ids = (event.queryStringParameters?.ids ?? '').split(',').filter(Boolean)
  if (ids.length === 0) {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({}) }
  }

  try {
    const drawingMap = await fetchDrawingMap(ids)
    // Convert ES6 Map → plain object for JSON serialisation
    const result = {}
    for (const [key, val] of drawingMap) result[key] = val
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(result) }
  } catch (err) {
    return errResponse('item-drawings', err)
  }
}
