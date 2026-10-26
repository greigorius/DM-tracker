/**
 * GET /api/projects/:id/items
 * Path: /api/projects/{id}/items  → redirected here, id extracted from event.path
 * Query params: ?phase=, ?status=, ?category=
 */
import {
  corsHeaders, tokenGuard, errResponse,
  queryAll, transformItem, withNoPcsa,
} from './_helpers.js'

const DB_TASKS = process.env.NOTION_DB_TASKS

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  // Extract project id from path: /api/projects/:id/items
  const pathParts = event.path.split('/')
  const id = pathParts[3]
  if (!id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'project id required' }) }

  const { phase, status, category } = event.queryStringParameters || {}

  try {
    let filter = { property: 'Projects', relation: { contains: id } }
    if (phase && phase !== 'all') {
      filter = { and: [filter, { property: 'DM Phase', select: { equals: phase } }] }
    }

    const pages = await queryAll(DB_TASKS, withNoPcsa(filter))
    let items = pages.map(p => transformItem(p))

    if (status && status !== 'all') {
      const COMPLETE = ['PC Approved', 'In Manufacture', 'Complete', 'Omitted', 'Design Complete', 'Close Out', 'On Site']
      if (status === 'active')        items = items.filter(i => !COMPLETE.includes(i.status))
      else if (status === 'complete') items = items.filter(i => ['PC Approved', 'In Manufacture', 'Complete', 'Design Complete', 'Close Out', 'On Site'].includes(i.status))
      else                            items = items.filter(i => i.status === status)
    }

    if (category && category !== 'all') {
      items = items.filter(i => i.contractCategory === category)
    }

    items.sort((a, b) => {
      if (a.nextDate && b.nextDate) return a.nextDate.localeCompare(b.nextDate)
      if (a.nextDate) return -1
      if (b.nextDate) return 1
      return a.name.localeCompare(b.name)
    })

    const COMPLETE = new Set(['PC Approved', 'In Manufacture', 'Complete', 'Omitted', 'Design Complete', 'Close Out', 'On Site'])
    const summary = {
      total:  items.length,
      byPhase: {
        ph1:   items.filter(i => i.dmPhase === 'Ph1 - Design Intent').length,
        ph2:   items.filter(i => i.dmPhase === 'Ph2 - DT Tasking').length,
        ph3:   items.filter(i => i.dmPhase === 'Ph3 - Review & Issue').length,
        ph4:   items.filter(i => i.dmPhase === 'Ph4 - Comment Resolution').length,
        ph5:   items.filter(i => i.dmPhase === 'Ph5 - Client Response').length,
        ph6:   items.filter(i => i.dmPhase === 'Ph6 - Manufacturing').length,
        unset: items.filter(i => !i.dmPhase).length,
      },
      openRfis: items.reduce((n, i) => n + i.rfiCount, 0),
      openTdl:  items.reduce((n, i) => n + i.tdlCount, 0),
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ items, summary }) }
  } catch (err) {
    return errResponse('project-items', err)
  }
}
