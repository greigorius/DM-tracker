/**
 * GET /api/projects/:id/timeline
 * Path: /api/projects/{id}/timeline  → redirected here, id extracted from event.path
 * Query params: ?phase=tasks|all
 */
import {
  corsHeaders, tokenGuard, errResponse,
  fetchTaskPages, fetchDrawingMap, transformTask,
} from './_helpers.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  // Extract project id from path: /api/projects/:id/timeline
  const pathParts = event.path.split('/')
  const id = pathParts[3]
  if (!id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'project id required' }) }

  const { phase = 'tasks' } = event.queryStringParameters || {}

  try {
    if (phase === 'tasks') {
      const taskPages = await fetchTaskPages(id)
      const items     = taskPages.map(p => transformTask(p, []))
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ items, phase: 'tasks' }) }
    }

    // phase=all: fetch tasks + drawings
    const taskPages  = await fetchTaskPages(id)
    const taskIds    = taskPages.map(p => p.id)
    const drawingMap = await fetchDrawingMap(taskIds)
    const items      = taskPages.map(p => transformTask(p, drawingMap.get(p.id) ?? []))

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ items }) }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { statusCode: 504, headers: corsHeaders, body: JSON.stringify({ error: 'Notion API timed out — try again' }) }
    }
    return errResponse('project-timeline', err)
  }
}
