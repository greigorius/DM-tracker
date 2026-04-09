/**
 * GET /api/projects/:id/timeline
 * Returns task items with drawingIds per item.
 * Drawings are fetched separately via /api/projects/:id/drawings.
 */
import {
  corsHeaders, tokenGuard, errResponse,
  fetchTaskPages, transformTask,
} from './_helpers.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  const pathParts = event.path.split('/')
  const id = pathParts[3]
  if (!id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'project id required' }) }

  try {
    const taskPages = await fetchTaskPages(id)
    const items     = taskPages.map(p => transformTask(p, []))
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ items }) }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { statusCode: 504, headers: corsHeaders, body: JSON.stringify({ error: 'Notion API timed out — try again' }) }
    }
    return errResponse('project-timeline', err)
  }
}
