/**
 * POST /api/tasks/update
 * Body: {
 *   id:            string  (Notion page ID, required)
 *   description:   string
 *   subTaskHours:  number | null
 *   taskCategory:  string | null
 *   changeTask:    boolean
 *   taskDone:      boolean
 *   itemId:        string | null  (Notion page ID of the Item)
 *   projectId:     string | null  (Notion page ID of the Project — not stored directly, drives item list)
 * }
 */
import { corsHeaders, tokenGuard, errResponse, fetchNotion, notionHeaders } from './_helpers.js'

const NOTION_API = 'https://api.notion.com/v1'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { id, description, subTaskHours, taskCategory, changeTask, taskDone, itemId, startDate, endDate } = body
  if (!id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'id is required' }) }

  const properties = {}

  if (description !== undefined && description !== null)
    properties['Item Description'] = { title: [{ text: { content: String(description) } }] }

  if (subTaskHours !== undefined)
    properties['Sub Task Hours'] = subTaskHours !== null ? { number: Number(subTaskHours) } : { number: null }

  if (taskCategory !== undefined)
    properties['Task Category'] = taskCategory ? { select: { name: taskCategory } } : { select: null }

  if (changeTask !== undefined)
    properties['Change Task'] = { checkbox: Boolean(changeTask) }

  if (taskDone !== undefined)
    properties['Task Done'] = { checkbox: Boolean(taskDone) }

  if (itemId !== undefined)
    properties['Item'] = itemId ? { relation: [{ id: itemId }] } : { relation: [] }

  if (startDate !== undefined)
    properties['Start Date'] = startDate ? { date: { start: startDate } } : { date: null }

  if (endDate !== undefined)
    properties['End Date'] = endDate ? { date: { start: endDate } } : { date: null }

  try {
    const r = await fetchNotion(`${NOTION_API}/pages/${id}`, {
      method: 'PATCH',
      headers: notionHeaders(),
      body: JSON.stringify({ properties }),
    })
    if (!r.ok) {
      const t = await r.text()
      throw new Error(`${r.status} ${t.slice(0, 200)}`)
    }
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    return errResponse('task-update', err)
  }
}
