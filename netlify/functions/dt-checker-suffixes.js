/**
 * POST /api/dt-checker-suffixes
 * Returns unique {suffixNumber, itemPageId} pairs for a project from the drawings DB.
 * Two-step query: get item IDs for the project from tasks DB, then query drawings by item relation.
 * Body: { projectPageId: string }
 */
import { corsHeaders, tokenGuard, errResponse, fetchNotion, notionHeaders } from './_helpers.js'

const DB_TASKS    = process.env.NOTION_DB_TASKS
const DB_DRAWINGS = process.env.NOTION_DB_DRAWINGS

async function getItemIdsForProject(projectPageId) {
  const itemIds = []
  let cursor
  do {
    const reqBody = {
      page_size: 100,
      filter: { property: 'Projects', relation: { contains: projectPageId } },
      ...(cursor ? { start_cursor: cursor } : {}),
    }
    const r = await fetchNotion(
      `https://api.notion.com/v1/databases/${DB_TASKS}/query`,
      { method: 'POST', headers: notionHeaders(), body: JSON.stringify(reqBody) }
    )
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      throw Object.assign(new Error(`Tasks query failed: ${r.status} ${txt.slice(0, 200)}`), { status: r.status })
    }
    const data = await r.json()
    for (const row of data.results || []) itemIds.push(row.id)
    cursor = data.has_more ? data.next_cursor : undefined
  } while (cursor)
  return itemIds
}

async function getSuffixesForItems(itemIds) {
  const CHUNK = 100
  const seen = new Set()
  const suffixes = []

  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const chunk = itemIds.slice(i, i + CHUNK)
    const filter = chunk.length === 1
      ? { property: 'Item', relation: { contains: chunk[0] } }
      : { or: chunk.map(id => ({ property: 'Item', relation: { contains: id } })) }

    let cursor
    do {
      const reqBody = {
        page_size: 100,
        filter,
        ...(cursor ? { start_cursor: cursor } : {}),
      }
      const r = await fetchNotion(
        `https://api.notion.com/v1/databases/${DB_DRAWINGS}/query`,
        { method: 'POST', headers: notionHeaders(), body: JSON.stringify(reqBody) }
      )
      if (!r.ok) {
        const txt = await r.text().catch(() => '')
        throw Object.assign(new Error(`Drawings query failed: ${r.status} ${txt.slice(0, 200)}`), { status: r.status })
      }
      const data = await r.json()
      for (const row of data.results || []) {
        const p = row.properties
        const suffixNumber = p['Suffix #']?.rich_text?.[0]?.plain_text
          ?? p['Suffix #']?.title?.[0]?.plain_text
          ?? null
        const itemPageId = p['Item']?.relation?.[0]?.id || null
        const key = itemPageId || suffixNumber
        if (key && !seen.has(key)) {
          seen.add(key)
          suffixes.push({ suffixNumber, itemPageId })
        }
      }
      cursor = data.has_more ? data.next_cursor : undefined
    } while (cursor)
  }

  suffixes.sort((a, b) => (a.suffixNumber || '').localeCompare(b.suffixNumber || ''))
  return suffixes
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  let body
  try { body = JSON.parse(event.body || '{}') } catch { body = {} }

  const { projectPageId } = body
  if (!projectPageId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ suffixes: [], error: 'projectPageId is required' }) }
  }

  try {
    const itemIds = await getItemIdsForProject(projectPageId)
    if (!itemIds.length) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ suffixes: [], error: null }) }
    }
    const suffixes = await getSuffixesForItems(itemIds)
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ suffixes, error: null }) }
  } catch (err) {
    return errResponse('dt-checker-suffixes', err)
  }
}
