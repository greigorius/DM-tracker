/**
 * item-status-background.js — full sweep of every item, writing changes.
 * Netlify background function (up to 15 minutes). Answers 202 straight away.
 *
 *   POST /.netlify/functions/item-status-background   header x-status-secret: $STATUS_SECRET
 *
 * Called by the nightly schedule and used once for the first migration.
 */
import { computeStatuses, writeChanges, summarise } from './_itemStatusEngine.js'

export const handler = async (event) => {
  if (!process.env.STATUS_SECRET || event.headers['x-status-secret'] !== process.env.STATUS_SECRET) {
    console.error('[item-status-background] refused: missing or wrong secret')
    return
  }
  const started = Date.now()
  const result = await computeStatuses()
  const written = await writeChanges(result)
  console.log('[item-status-background]', JSON.stringify({ ...summarise(result), written, seconds: Math.round((Date.now() - started) / 1000) }))
}
