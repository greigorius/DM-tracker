/**
 * GET /api/tasks
 * Returns all TODO tasks with project & item names resolved.
 * Query params: ?showDone=true to include completed tasks
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

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  const showDone = event.queryStringParameters?.showDone === 'true'

  try {
    const filter = showDone ? undefined : {
      or: [
        { property: 'Task Done', checkbox: { equals: false } },
        { property: 'Task Done', checkbox: { does_not_equal: true } },
      ]
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

    // Batch-fetch item pages (to get item name + project relation)
    const itemIds  = [...itemIdSet]
    const itemPages = await Promise.all(itemIds.map(fetchPage))
    const itemMap  = {}           // itemPageId → { name, projectId, projectPageId }
    const projIdSet = new Set()

    itemIds.forEach((id, i) => {
      const page = itemPages[i]
      if (!page) return
      const props     = page.properties ?? {}
      const name      = props['Item Name']?.title?.[0]?.plain_text ?? null
      const projectRel = props['Projects']?.relation ?? []
      const projectPageId = projectRel[0]?.id ?? null
      itemMap[id] = { name, projectPageId }
      if (projectPageId) projIdSet.add(projectPageId)
    })

    // Batch-fetch project pages to get project names
    const projIds   = [...projIdSet]
    const projPages = await Promise.all(projIds.map(fetchPage))
    const projMap   = {}  // projectPageId → { name }

    projIds.forEach((id, i) => {
      const page = projPages[i]
      if (!page) return
      const name = page.properties?.['Project Name']?.title?.[0]?.plain_text ?? null
      projMap[id] = { id, name }
    })

    const tasks = pages.map(p => {
      const props     = p.properties ?? {}
      const itemRel   = props['Item']?.relation ?? []
      const itemPageId = itemRel[0]?.id ?? null
      const item      = itemMap[itemPageId] ?? {}
      const proj      = item.projectPageId ? projMap[item.projectPageId] : null

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
