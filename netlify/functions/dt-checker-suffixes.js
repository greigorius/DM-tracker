/**
 * POST /api/dt-checker-suffixes
 * Returns unique {suffixNumber, itemPageId} pairs for a project from the drawings DB.
 * Uses projectPageId to look up items via Tasks DB, then drawings via Drawings DB.
 * This avoids a brittle formula/rollup filter on the 'Project' property.
 * Body: { projectPageId: string }
 */
import { corsHeaders, tokenGuard, errResponse, queryAll } from './_helpers.js'

const DB_TASKS    = process.env.NOTION_DB_TASKS
const DB_DRAWINGS = process.env.NOTION_DB_DRAWINGS

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
    // Step 1: Get all items (tasks) for this project via the known relation property
    const itemPages = await queryAll(DB_TASKS, {
      property: 'Projects', relation: { contains: projectPageId },
    })
    const itemIds = itemPages.map(p => p.id)

    if (itemIds.length === 0) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ suffixes: [], error: null }) }
    }

    // Step 2: Fetch drawings for those items (chunked to respect Notion's OR-filter limit)
    const CHUNK = 100
    let allDrawingRows = []
    for (let i = 0; i < itemIds.length; i += CHUNK) {
      const chunk  = itemIds.slice(i, i + CHUNK)
      const filter = chunk.length === 1
        ? { property: 'Item', relation: { contains: chunk[0] } }
        : { or: chunk.map(id => ({ property: 'Item', relation: { contains: id } })) }
      const rows = await queryAll(DB_DRAWINGS, filter)
      allDrawingRows = allDrawingRows.concat(rows)
    }

    // Step 3: Extract unique {suffixNumber, itemPageId} pairs
    const seen = new Set()
    const suffixes = []
    for (const row of allDrawingRows) {
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
    suffixes.sort((a, b) => (a.suffixNumber || '').localeCompare(b.suffixNumber || ''))

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ suffixes, error: null }) }
  } catch (err) {
    return errResponse('dt-checker-suffixes', err)
  }
}
