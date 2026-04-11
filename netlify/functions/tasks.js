/**
 * GET /api/tasks
 * Returns tasks with project & item names resolved.
 * Server-side excludes: done tasks created more than 7 days ago (UI 7-day retention).
 * Query params: ?showDone=true to include done tasks (still within 7d window)
 */
import {
  corsHeaders, tokenGuard, errResponse,
  fetchNotion, notionHeaders, queryAll,
} from './_helpers.js'

const DB_TODO    = process.env.NOTION_DB_TODO
const NOTION_API = 'https://api.notion.com/v1'

async function fetchPage(id) {
  try {
    const r = await fetchNotion(`${NOTION_API}/pages/${id}`, { headers: notionHeaders() })
    return r.ok ? r.json() : null
  } catch { return null }
}

/** Fetch pages in serial batches of `size` to avoid hammering Notion rate limits */
async function batchFetch(ids, size = 10) {
  const results = []
  for (let i = 0; i < ids.length; i += size) {
    const chunk = ids.slice(i, i + size)
    const pages = await Promise.all(chunk.map(fetchPage))
    results.push(...pages)
  }
  return results
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  const showDone = event.queryStringParameters?.showDone === 'true'

  // Cutoff: tasks done AND created before this date are skipped entirely
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  try {
    // Build filter:
    //   If showDone=false → only undone tasks
    //   If showDone=true  → undone tasks OR (done tasks created within last 7 days)
    const filter = showDone
      ? {
          or: [
            { property: 'Task Done', checkbox: { equals: false } },
            {
              and: [
                { property: 'Task Done', checkbox: { equals: true } },
                { timestamp: 'created_time', created_time: { after: sevenDaysAgo } },
              ],
            },
          ],
        }
      : {
          or: [
            { property: 'Task Done', checkbox: { equals: false } },
            { property: 'Task Done', checkbox: { does_not_equal: true } },
          ],
        }

    const pages = await queryAll(DB_TODO, filter, {
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    })

    // Collect unique item page IDs from Item relation
    const itemIdSet = new Set()
    for (const p of pages) {
      const rel = p.properties?.['Item']?.relation ?? []
      for (const r of rel) itemIdSet.add(r.id)
    }

    // Batch-fetch item pages in chunks of 10
    const itemIds   = [...itemIdSet]
    const itemPages = await batchFetch(itemIds, 10)
    const itemMap   = {}
    const projIdSet = new Set()

    itemIds.forEach((id, i) => {
      const page = itemPages[i]
      if (!page) return
      const props         = page.properties ?? {}
      const name          = props['Item Name']?.title?.[0]?.plain_text ?? null
      const projectPageId = props['Projects']?.relation?.[0]?.id ?? null
      itemMap[id] = { name, projectPageId }
      if (projectPageId) projIdSet.add(projectPageId)
    })

    // Batch-fetch project pages in chunks of 10
    const projIds   = [...projIdSet]
    const projPages = await batchFetch(projIds, 10)
    const projMap   = {}

    projIds.forEach((id, i) => {
      const page = projPages[i]
      if (!page) return
      const name = page.properties?.['Project Name']?.title?.[0]?.plain_text ?? null
      projMap[id] = { id, name }
    })

    const tasks = pages.map(p => {
      const props      = p.properties ?? {}
      const itemPageId = props['Item']?.relation?.[0]?.id ?? null
      const item       = itemMap[itemPageId] ?? {}
      const proj       = item.projectPageId ? projMap[item.projectPageId] : null

      return {
        id:           p.id,
        tdlId:        props['ID']?.unique_id?.number != null
                        ? `TDL-${props['ID'].unique_id.number}`
                        : null,
        itemId:       itemPageId,
        itemName:     item.name ?? null,
        projectId:    proj?.id    ?? null,
        projectName:  proj?.name  ?? null,
        description:  props['Item Description']?.title?.[0]?.plain_text ?? null,
        assignedTo:   props['Assigned To']?.people?.[0]?.name           ?? null,
        subTaskHours: props['Sub Task Hours']?.number                    ?? null,
        taskCategory: props['Task Category']?.select?.name              ?? null,
        changeTask:   props['Change Task']?.checkbox                     ?? false,
        taskDone:     props['Task Done']?.checkbox                       ?? false,
        startDate:    props['Start Date']?.date?.start                   ?? null,
        createdAt:    p.created_time,
      }
    })

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(tasks) }
  } catch (err) {
    return errResponse('tasks', err)
  }
}
