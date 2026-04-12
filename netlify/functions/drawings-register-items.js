/**
 * GET /api/drawings-register/items
 * Returns all items from the MDS (TASKS) DB with the fields needed to
 * build the drawing register groups: id, name, status, projectId.
 * Fast — one paginated queryAll, no individual page fetches.
 */
import { corsHeaders, tokenGuard, errResponse, queryAll } from './_helpers.js'

const DB_TASKS = process.env.NOTION_DB_TASKS

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  try {
    const pages = await queryAll(DB_TASKS, null)

    const items = pages.map(p => {
      const props = p.properties ?? {}
      return {
        id:        p.id,
        name:      props['Item Name']?.title?.[0]?.plain_text ?? null,
        status:    props['Status']?.status?.name              ?? null,
        projectId: props['Projects']?.relation?.[0]?.id       ?? null,
      }
    })

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(items) }
  } catch (err) {
    return errResponse('drawings-register-items', err)
  }
}
