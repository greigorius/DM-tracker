/**
 * GET /api/schedule-items?projectId=<id>
 *
 * Returns all schedule items (Tasks DB) with every date field required for the
 * Item Date Matrix — actual dates come directly from Notion rather than being
 * entered manually in the UI.
 *
 * Response: { projects: [...], items: [...] }
 *   projects — all active projects (for the filter dropdown)
 *   items    — tasks with flat date keys matching the schedule column definitions
 */
import {
  corsHeaders, tokenGuard, errResponse,
  fetchNotion, notionHeaders, queryAll, withNoPcsa,
} from './_helpers.js'

const NOTION_API = 'https://api.notion.com/v1'

function d(props, key) {
  return props[key]?.date?.start ?? null
}

function transformScheduleItem(page, projectId) {
  const p = page.properties ?? {}

  const sub1P        = d(p, '1st Submission Date (Plan)')
  const sub1ActDate  = d(p, '1st Submission Date (Actual)')
  const sub2P        = d(p, '2nd Submission Date (Plan)')
  const sub2ActDate  = d(p, '2nd Submission Date (Actual)')
  const subCP        = d(p, 'Constr. Submission Date (Plan)')
  const subCActDate  = d(p, 'Constr. Submission Date (Actual)')

  return {
    id:               page.id,
    name:             p['Item Name']?.title?.[0]?.plain_text ?? '',
    status:           p['Status']?.status?.name              ?? null,
    projectId,
    noClientApproval: p['No Client Approval']?.checkbox      ?? false,
    s4Status:         p['S4 Status']?.select?.name           ?? null,
    s5Status:         p['S5 Status']?.select?.name           ?? null,

    // 1st Issue — Design Intent
    dtStart1Plan:  d(p, '1st DT Start (Plan)'),
    dtStart1Act:   d(p, '1st DT Start (Actual)'),
    del1P:         d(p, '1st DT Delivery (Plan)'),
    del1A:         d(p, '1st DT Delivery (Adj)'),
    del1ActDate:   d(p, '1st DT Delivery (Actual)'),
    sub1P,
    sub1A:         d(p, '1st Submission Date (Adj)'),
    sub1ActDate,

    // 2nd Issue — For Approval
    st2P:          d(p, '2nd DT Start (Plan)'),
    st2A:          d(p, '2nd DT Start (Adj)'),
    dtStart2Act:   d(p, '2nd DT Start (Actual)'),
    del2P:         d(p, '2nd DT Delivery (Plan)'),
    del2A:         d(p, '2nd DT Delivery (Adj)'),
    del2ActDate:   d(p, '2nd DT Delivery (Actual)'),
    sub2P,
    sub2A:         d(p, '2nd Submission Date (Adj)'),
    sub2ActDate,

    // Construction Issue — C01
    stCP:          d(p, 'Constr. DT Start (Plan)'),
    stCA:          d(p, 'Constr. DT Start (Adj)'),
    stCActDate:    d(p, 'Constr. DT Start (Actual)'),
    delCP:         d(p, 'Constr. DT Delivery (Plan)'),
    delCA:         d(p, 'Constr. DT Delivery (Adj)'),
    delCActDate:   d(p, 'Constr. DT Delivery (Actual)'),
    subCP,
    subCA:         d(p, 'Constr. Submission Date (Adj)'),
    subCActDate,

    // Production & Install
    prodDateP:     d(p, 'Production Date (Plan)'),
    prodDateAdj:   d(p, 'Production Date (Adj)'),
    instDate:      d(p, 'Install Date'),
  }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  const projectId = event.queryStringParameters?.projectId ?? null

  try {
    // ── Fetch projects (for dropdown) ─────────────────────────────────────────
    const projectPages = await queryAll(
      process.env.NOTION_DB_PROJECTS,
      { property: 'Status', status: { does_not_equal: 'Done' } },
      { sorts: [{ property: 'Start Date', direction: 'descending' }] },
    )
    const projects = projectPages.map(p => ({
      id:   p.id,
      name: p.properties['Project Name']?.title?.[0]?.plain_text ?? p.id,
    }))

    // ── Fetch tasks ───────────────────────────────────────────────────────────
    const baseFilter = projectId
      ? { property: 'Projects', relation: { contains: projectId } }
      : null

    const taskPages = await queryAll(
      process.env.NOTION_DB_TASKS,
      withNoPcsa(baseFilter),
      { sorts: [{ property: 'Item Name', direction: 'ascending' }] },
    )

    const items = taskPages.map(page => {
      // Determine which project this task belongs to for the response
      const pid = projectId
        ?? page.properties['Projects']?.relation?.[0]?.id
        ?? null
      return transformScheduleItem(page, pid)
    })

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ projects, items }),
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      return {
        statusCode: 504,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Notion API timed out — try again' }),
      }
    }
    return errResponse('schedule-items', err)
  }
}
