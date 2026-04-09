/**
 * GET /api/projects/:id/drawings?taskIds=id1,id2,...
 * Returns drawings grouped by task ID: { [taskId]: drawing[] }
 * Called after the timeline task fetch to load drawings without re-fetching tasks.
 */
import {
  corsHeaders, tokenGuard, errResponse,
  fetchDrawingMap,
} from './_helpers.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  const taskIdsParam = event.queryStringParameters?.taskIds ?? ''
  const taskIds = taskIdsParam.split(',').filter(Boolean)

  if (!taskIds.length) {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({}) }
  }

  try {
    const drawingMap = await fetchDrawingMap(taskIds)
    const result = {}
    drawingMap.forEach((drawings, taskId) => { result[taskId] = drawings })
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(result) }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { statusCode: 504, headers: corsHeaders, body: JSON.stringify({ error: 'Notion API timed out' }) }
    }
    return errResponse('project-drawings', err)
  }
}
