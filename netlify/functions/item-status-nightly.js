/**
 * item-status-nightly.js — scheduled trigger for the nightly status sweep.
 * Runs at 02:13 UTC and hands the work to item-status-background.
 * Does nothing until ITEM_STATUS_NIGHTLY=on, so it stays off until the first migration is approved.
 */
export const config = { schedule: '13 2 * * *' }

export const handler = async () => {
  if (process.env.ITEM_STATUS_NIGHTLY !== 'on') { console.log('[item-status-nightly] off (ITEM_STATUS_NIGHTLY is not "on")'); return { statusCode: 200 } }
  const base = process.env.URL
  const r = await fetch(`${base}/.netlify/functions/item-status-background`, {
    method: 'POST', headers: { 'x-status-secret': process.env.STATUS_SECRET || '' },
  })
  console.log('[item-status-nightly] background sweep requested:', r.status)
  return { statusCode: 200 }
}
