/**
 * GET /api/schedule-items?projectId=<id>
 *
 * Returns projects + schedule items for the Item Date Matrix.
 * Only dtStart1Plan and actual dates are fetched from Notion —
 * all plan/adj dates are calculated client-side via calcRow.
 * Drawing DB queried for s4/s5 status dates and C01 sign-off.
 *
 * Response: { projects: [...], items: [...] }
 */
import {
  corsHeaders, tokenGuard, errResponse,
  fetchNotion, notionHeaders, queryAll, withNoPcsa,
  fetchDrawingMap, d,
} from './_helpers.js'

function transformScheduleItem(page, pid) {
  const p    = page.properties ?? {}
  const name = p['Item Name']?.title?.[0]?.plain_text ?? ''
  return {
    id:               page.id,
    name,
    status:           p['Drawing Progress']?.status?.name    ?? null,
    projectId:        pid,
    noClientApproval: p['No Client Approval']?.checkbox      ?? false,
    dmPhase:          p['DM Phase']?.select?.name            ?? null,
    contractCategory: p['Contract Category']?.formula?.string
                   ?? (name.toLowerCase().includes('pcsa') ? 'PCSA' : 'Main Works'),

    // Only the 1st DT Start plan date — everything else calculated client-side
    dtStart1Plan:  d(p, '1st DT Start (Plan)'),

    // Actual dates from Notion (inputs to calcRow)
    dtStart1Act:   d(p, '1st DT Start (Actual)'),
    del1ActDate:   d(p, '1st DT Delivery (Actual)'),
    sub1ActDate:   d(p, '1st Submission Date (Actual)'),
    dtStart2Act:   d(p, '2nd DT Start (Actual)'),
    del2ActDate:   d(p, '2nd DT Delivery (Actual)'),
    sub2ActDate:   d(p, '2nd Submission Date (Actual)'),
    stCActDate:    d(p, 'Constr. DT Start (Actual)'),
    delCActDate:   d(p, 'Constr. DT Delivery (Actual)'),
    subCActDate:   d(p, 'Constr. Submission Date (Actual)'),

    // Draw-day values (Notion-sourced, editable from matrix)
    dd1:            p['Draw Days - DD1']?.number   ?? null,
    constrDrawDays: p['Draw Days - DD-C']?.number ?? null,
  }
}

function transformProject(page) {
  const p = page.properties ?? {}
  return {
    id:                   page.id,
    name:                 p['Project Name']?.title?.[0]?.plain_text ?? page.id,
    // These may not exist in the DB; frontend will use localStorage + defaults if null
    approvalDays:         p['Approval Days']?.number          ?? null,
    revisionDays:         p['Revision Days']?.number          ?? null,
    productionPrepPeriod: p['Production Prep Period']?.number ?? null,
    qaDefault:            p['QA Default Days']?.number        ?? null,
  }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  const projectId = event.queryStringParameters?.projectId ?? null

  try {
    // ── Projects ───────────────────────────────────────────────────────────────
    const projectPages = await queryAll(
      process.env.NOTION_DB_PROJECTS,
      { property: 'Status', status: { does_not_equal: 'Done' } },
      { sorts: [{ property: 'Start Date', direction: 'descending' }] },
    )
    const projects = projectPages.map(transformProject)

    // ── Tasks ──────────────────────────────────────────────────────────────────
    const baseFilter = projectId
      ? { property: 'Projects', relation: { contains: projectId } }
      : null

    const taskPages = await queryAll(
      process.env.NOTION_DB_TASKS,
      withNoPcsa(baseFilter),
      { sorts: [{ property: 'Item Name', direction: 'ascending' }] },
    )

    const items = taskPages.map(page => {
      const pid = projectId
        ?? page.properties['Projects']?.relation?.[0]?.id
        ?? null
      return transformScheduleItem(page, pid)
    })

    // ── Drawings: s4/s5 dates + statuses + C01 sign-off ─────────────────────
    // Wrapped in try/catch — if drawings fetch fails or times out we still
    // return items (s4/s5 fields will be null). Only fetch when we have items.
    if (items.length > 0) {
      try {
        const taskIds    = items.map(i => i.id)
        const drawingMap = await fetchDrawingMap(taskIds)

        for (const item of items) {
          const drawings = drawingMap.get(item.id) ?? []
          const s4Dates  = drawings.map(drw => drw.s4StatusDate).filter(Boolean)
          const s5Dates  = drawings.map(drw => drw.s5StatusDate).filter(Boolean)
          const c01Dates = drawings.map(drw => drw.c01SignOff?.actual ?? drw.c01Submit?.actual).filter(Boolean)
          item.s4Date           = s4Dates.length  ? [...s4Dates].sort()[0]  : null
          item.s5Date           = s5Dates.length  ? [...s5Dates].sort()[0]  : null
          item.c01SignOffActDate = c01Dates.length ? [...c01Dates].sort()[0] : null
          item.s4Statuses       = [...new Set(drawings.map(drw => drw.s4Status).filter(Boolean))]
          item.s5Statuses       = [...new Set(drawings.map(drw => drw.s5Status).filter(Boolean))]
        }
      } catch (drawErr) {
        console.warn('[schedule-items] drawings fetch failed:', drawErr.message)
        // Items still returned, drawings fields will be absent (undefined → null in UI)
      }
    }

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
