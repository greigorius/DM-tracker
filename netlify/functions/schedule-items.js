/**
 * GET /api/schedule-items
 * Returns items enriched with all fields required by the Item Date Matrix
 * (calcRow inputs + project-level scheduling config). Actual dates are pulled
 * directly from Notion — no manual entry required.
 *
 * Query params: ?project=<id>  — optional, filters to a single project
 */
import {
  corsHeaders, tokenGuard, errResponse,
  queryAll, withNoPcsa, d, anyDate,
} from './_helpers.js'

const DB_TASKS    = process.env.NOTION_DB_TASKS
const DB_PROJECTS = process.env.NOTION_DB_PROJECTS
const DB_DRAWINGS = process.env.NOTION_DB_DRAWINGS

const num = (p, k) => p[k]?.number ?? p[k]?.formula?.number ?? null

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }
  const guard = tokenGuard(); if (guard) return guard

  const { project } = event.queryStringParameters || {}

  try {
    // 1. Fetch projects (config drives approvalDays / revisionDays / productionPrepPeriod / qaDefault)
    const projectPages = await queryAll(DB_PROJECTS, null)
    const projectMap = {}
    for (const p of projectPages) {
      const pr = p.properties ?? {}
      projectMap[p.id] = {
        id:                   p.id,
        name:                 pr['Project Name']?.title?.[0]?.plain_text ?? p.id,
        approvalDays:         num(pr, 'Approval Days'),
        revisionDays:         num(pr, 'Revision Days'),
        productionPrepPeriod: num(pr, 'Production Prep Period'),
        qaDefault:            num(pr, 'QA Default') ?? num(pr, 'QA Days Default'),
      }
    }

    // 2. Fetch items (optionally filtered to a single project)
    const itemFilter = project && project !== 'all'
      ? { property: 'Projects', relation: { contains: project } }
      : null
    const itemPages = await queryAll(DB_TASKS, withNoPcsa(itemFilter))

    // 3. Build initial item rows + collect all item IDs to fetch linked drawings
    const items = []
    const itemIds = []
    for (const page of itemPages) {
      const p = page.properties ?? {}
      const name = p['Item Name']?.title?.[0]?.plain_text ?? ''
      const projectId = p['Projects']?.relation?.[0]?.id ?? null
      itemIds.push(page.id)

      items.push({
        id:          page.id,
        pageId:      page.id,
        name,
        projectId,
        projectName: projectMap[projectId]?.name ?? null,
        status:      p['Status']?.status?.name ?? p['Status']?.select?.name ?? null,
        dmPhase:     p['DM Phase']?.select?.name ?? null,
        contractCategory: p['Contract Category']?.formula?.string
          ?? (name.toLowerCase().includes('pcsa') ? 'PCSA' : 'Main Works'),
        noClientApproval: p['No Client Approval']?.checkbox ?? false,
        s4Status:    p['S4 Status']?.select?.name ?? null,
        s5Status:    p['S5 Status']?.select?.name ?? null,

        // Numeric inputs (fall back to project defaults in the UI)
        dd1:            num(p, '1st DT Drawing Days')   ?? num(p, 'Draw Days 1')     ?? null,
        qa1:            num(p, '1st QA Days')           ?? num(p, 'QA Days 1')       ?? null,
        qa2:            num(p, '2nd QA Days')           ?? num(p, 'QA Days 2')       ?? null,
        qaC:            num(p, 'Constr. QA Days')       ?? num(p, 'QA Days C')       ?? null,
        constrDrawDays: num(p, 'Constr. Drawing Days')  ?? num(p, 'Draw Days C')     ?? null,
        productionTime: num(p, 'Production Time')       ?? num(p, 'Install Lead Time') ?? null,

        // Plan anchor + actuals (all pulled from Notion — no manual entry)
        dtStart1Plan:       d(p, '1st DT Start (Plan)'),
        dtStart1Act:        d(p, '1st DT Start (Actual)'),
        del1ActDate:        d(p, '1st DT Delivery (Actual)'),
        sub1ActDate:        d(p, '1st Submission Date (Actual)'),
        dtStart2Act:        d(p, '2nd DT Start (Actual)'),
        del2ActDate:        d(p, '2nd DT Delivery (Actual)'),
        sub2ActDate:        d(p, '2nd Submission Date (Actual)'),
        stCActDate:         d(p, 'Constr. DT Start (Actual)'),
        delCActDate:        d(p, 'Constr. DT Delivery (Actual)'),
        subCActDate:        d(p, 'Constr. Submission Date (Actual)'),
        c01SignOffActDate:  d(p, 'C01 Sign Off (Actual)') ?? d(p, 'C01 Sign Off Date (Actual)'),

        // S4/S5 actual dates will be filled from linked drawings (MDS) below
        s4Date: null,
        s5Date: null,
      })
    }

    // 4. Fetch linked drawings in chunks to populate S4/S5 approval actual dates.
    //    We take the earliest S4/S5 status date across all drawings linked to an item.
    const s4Map = new Map()
    const s5Map = new Map()
    if (itemIds.length > 0 && DB_DRAWINGS) {
      const CHUNK = 100
      for (let i = 0; i < itemIds.length; i += CHUNK) {
        const chunk = itemIds.slice(i, i + CHUNK)
        const filter = chunk.length === 1
          ? { property: 'Item', relation: { contains: chunk[0] } }
          : { or: chunk.map(id => ({ property: 'Item', relation: { contains: id } })) }
        try {
          const drawingPages = await queryAll(DB_DRAWINGS, filter)
          for (const page of drawingPages) {
            const props = page.properties ?? {}
            const itemRels = (props['Item']?.relation ?? []).map(r => r.id)
            const s4Date = d(props, 'S4 Status Date (Actual)') ?? anyDate(props, 'S4 Status Date')
            const s5Date = d(props, 'S5 Status Date (Actual)') ?? anyDate(props, 'S5 Status Date')
            for (const itemId of itemRels) {
              if (s4Date) {
                const existing = s4Map.get(itemId)
                if (!existing || s4Date < existing) s4Map.set(itemId, s4Date)
              }
              if (s5Date) {
                const existing = s5Map.get(itemId)
                if (!existing || s5Date < existing) s5Map.set(itemId, s5Date)
              }
            }
          }
        } catch (e) {
          console.warn('[schedule-items] drawings fetch chunk failed:', e.message)
        }
      }
    }
    for (const item of items) {
      item.s4Date = s4Map.get(item.id) ?? null
      item.s5Date = s5Map.get(item.id) ?? null
    }

    // Sort: project name → item name
    items.sort((a, b) => {
      const p = (a.projectName ?? '').localeCompare(b.projectName ?? '')
      return p !== 0 ? p : (a.name ?? '').localeCompare(b.name ?? '')
    })

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ items, projects: Object.values(projectMap) }),
    }
  } catch (err) {
    return errResponse('schedule-items', err)
  }
}
