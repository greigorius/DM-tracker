/**
 * GET /api/stats
 * Query params: ?projectId= (optional)
 */
import { corsHeaders, tokenGuard, errResponse, queryAll, withNoPcsa } from './_helpers.js'

const DB_TASKS = process.env.NOTION_DB_TASKS

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  const { projectId } = event.queryStringParameters || {}

  try {
    const filter = projectId
      ? { property: 'Projects', relation: { contains: projectId } }
      : undefined

    const pages = await queryAll(DB_TASKS, withNoPcsa(filter))
    const COMPLETE = new Set(['PC Approved', 'In Manufacture', 'Complete', 'Omitted'])
    const items = pages.map(p => ({
      status:  p.properties['Status']?.status?.name   ?? null,
      dmPhase: p.properties['DM Phase']?.select?.name ?? null,
    }))

    return {
      statusCode: 200,
      headers:    corsHeaders,
      body:       JSON.stringify({
        total:    items.length,
        active:   items.filter(i => !COMPLETE.has(i.status)).length,
        complete: items.filter(i => COMPLETE.has(i.status)).length,
        byPhase: {
          ph1:   items.filter(i => i.dmPhase === 'Ph1 - Design Intent').length,
          ph2:   items.filter(i => i.dmPhase === 'Ph2 - DT Tasking').length,
          ph3:   items.filter(i => i.dmPhase === 'Ph3 - Review & Issue').length,
          ph4:   items.filter(i => i.dmPhase === 'Ph4 - Comment Resolution').length,
          ph5:   items.filter(i => i.dmPhase === 'Ph5 - Client Response').length,
          ph6:   items.filter(i => i.dmPhase === 'Ph6 - Manufacturing').length,
          unset: items.filter(i => !i.dmPhase).length,
        },
      }),
    }
  } catch (err) {
    return errResponse('stats', err)
  }
}
