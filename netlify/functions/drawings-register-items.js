/**
 * GET /api/drawings-register/items?projectId=xxx
 * Returns items for a specific project — scoped query so it never times out.
 * Mirrors the pattern used by /api/projects/:id/items and the timeline page.
 */
import { corsHeaders, tokenGuard, errResponse, queryAll } from './_helpers.js'

const DB_TASKS = process.env.NOTION_DB_TASKS

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  const projectId = event.queryStringParameters?.projectId
  if (!projectId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'projectId is required' }) }
  }

  try {
    const filter = { property: 'Projects', relation: { contains: projectId } }
    const pages  = await queryAll(DB_TASKS, filter)

    const items = pages.map(p => {
      const props = p.properties ?? {}
      return {
        id:        p.id,
        name:      props['Item Name']?.title?.[0]?.plain_text ?? null,
        status:    props['Status']?.status?.name              ?? null,
        projectId,
      }
    })

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(items) }
  } catch (err) {
    return errResponse('drawings-register-items', err)
  }
}
