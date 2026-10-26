/**
 * item-status.js — Item & Drawing Status automation.
 *
 *   GET  /api/item-status?dryRun=1            → what would change, nothing written
 *   GET  /api/item-status?dryRun=1&detail=1   → the same, with every changing row
 *   POST /api/item-status  { itemIds: [...] } → recompute those items and write changes
 *        header x-status-secret: $STATUS_SECRET   (Make scenarios call this)
 *
 * A full sweep that writes runs in item-status-background (too long for a normal function).
 */
import { corsHeaders, tokenGuard, errResponse } from './_helpers.js'
import { computeStatuses, writeChanges, summarise } from './_itemStatusEngine.js'

const json = (statusCode, body) => ({ statusCode, headers: corsHeaders, body: JSON.stringify(body) })

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard
  const q = event.queryStringParameters || {}

  try {
    if (event.httpMethod === 'GET') {
      if (q.dryRun !== '1') return json(400, { error: 'GET only supports dryRun=1. Writes need POST with the shared secret.' })
      const itemIds = q.itemIds ? q.itemIds.split(',') : undefined
      const result = await computeStatuses({ itemIds, today: q.today })
      const out = summarise(result)
      if (q.detail === '1') {
        out.itemChanges = result.items.filter((r) => r.changed).map(({ name, url, current, proposed, reason }) => ({ name, url, current, proposed, reason }))
        out.drawingChanges = result.drawings.filter((r) => r.changed).map(({ number, url, current, proposed, reason }) => ({ number, url, current, proposed, reason }))
      }
      return json(200, out)
    }

    if (event.httpMethod === 'POST') {
      if (!process.env.STATUS_SECRET || event.headers['x-status-secret'] !== process.env.STATUS_SECRET) return json(401, { error: 'Missing or wrong x-status-secret' })
      const body = JSON.parse(event.body || '{}')
      const itemIds = (Array.isArray(body.itemIds) ? body.itemIds : [body.itemIds]).filter(Boolean)
      if (!itemIds.length) return json(400, { error: 'itemIds is required. Use item-status-background for a full sweep.' })
      if (itemIds.length > 25) return json(400, { error: 'At most 25 items per call. Use item-status-background for more.' })
      const result = await computeStatuses({ itemIds })
      const written = body.dryRun ? null : await writeChanges(result)
      return json(written?.errors.length ? 207 : 200, { ...summarise(result), written })
    }

    return json(405, { error: 'Method not allowed' })
  } catch (err) {
    return errResponse('item-status', err)
  }
}
