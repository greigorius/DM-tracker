/**
 * notionHelpers.js
 * Shared Notion fetch utilities, field extractors, transformers, and TTL cache.
 */

const NOTION_API = 'https://api.notion.com/v1'
const DEPLOY_ID  = process.env.DEPLOY_ID || `local-${Date.now()}`
const _cache     = new Map()

// ── TTL cache ─────────────────────────────────────────────────────────────────
export function getCached(key) {
  const k     = `${DEPLOY_ID}:${key}`
  const entry = _cache.get(k)
  if (!entry) return null
  if (Date.now() > entry.expires) { _cache.delete(k); return null }
  return entry.data
}

export function setCached(key, data, ttlMs = 5 * 60 * 1000) {
  _cache.set(`${DEPLOY_ID}:${key}`, { data, expires: Date.now() + ttlMs })
}

export function deleteCached(key) {
  _cache.delete(`${DEPLOY_ID}:${key}`)
}

// ── Notion fetch helper ────────────────────────────────────────────────────────
export function notionHeaders() {
  return {
    Authorization:    `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type':   'application/json',
  }
}

export function fetchNotion(url, opts, timeoutMs = 25000) {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer))
}

// ── DB schema helper ──────────────────────────────────────────────────────────
export async function getSchemaIds(dbId) {
  const cacheKey = `schema:${dbId}`
  const cached   = getCached(cacheKey)
  if (cached) return cached

  try {
    const r = await fetchNotion(`${NOTION_API}/databases/${dbId}`,
      { headers: notionHeaders() }, 8000)
    if (!r.ok) return null
    const data  = await r.json()
    const idMap = {}
    for (const [name, prop] of Object.entries(data.properties || {})) {
      idMap[name] = prop.id
    }
    setCached(cacheKey, idMap, 60 * 60 * 1000)
    return idMap
  } catch { return null }
}

// ── Field extractors ──────────────────────────────────────────────────────────
export const titleVal  = (p, k) => p[k]?.title?.[0]?.plain_text   ?? null
export const statusVal = (p, k) => p[k]?.status?.name             ?? null
export const selectVal = (p, k) => p[k]?.select?.name             ?? null
export const personVal = (p, k) => p[k]?.people?.[0]?.name        ?? null
export const checkVal  = (p, k) => p[k]?.checkbox                 ?? false
export const dateVal   = (p, k) => p[k]?.date?.start              ?? null
export const relCount  = (p, k) => (p[k]?.relation || []).length
export const relIds    = (p, k) => (p[k]?.relation || []).map(r => r.id)

/** Plain date field → ISO string or null */
export function d(props, field) {
  return props[field]?.date?.start ?? null
}

/** Try plain date first, then formula string */
export function anyDate(props, field) {
  return props[field]?.date?.start
      ?? props[field]?.formula?.date?.start
      ?? props[field]?.formula?.string
      ?? null
}

// ── Paginated query helper ────────────────────────────────────────────────────
export async function queryAll(databaseId, filter, extraBody = {}, timeoutMs = 55000) {
  const pages  = []
  let   cursor
  do {
    const body = {
      page_size: 100,
      ...(filter ? { filter } : {}),
      ...extraBody,
      ...(cursor ? { start_cursor: cursor } : {}),
    }
    const r = await fetchNotion(
      `${NOTION_API}/databases/${databaseId}/query`,
      { method: 'POST', headers: notionHeaders(), body: JSON.stringify(body) },
      timeoutMs,
    )
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      throw Object.assign(new Error(`Notion query failed: ${r.status} ${txt.slice(0, 200)}`), { status: r.status })
    }
    const data = await r.json()
    pages.push(...data.results)
    cursor = data.has_more ? data.next_cursor : null
  } while (cursor && pages.length < 2000)
  return pages
}

// ── Task transformer ──────────────────────────────────────────────────────────
export function transformTask(page, drawings = []) {
  const props = page.properties ?? {}
  const name  = props['Item Name']?.title?.[0]?.plain_text ?? ''

  return {
    id:   page.id,
    name,
    status:           props['Status']?.status?.name                   ?? null,
    assignee:         props['Assigned To']?.people?.[0]?.name         ?? null,
    contractCategory: props['Contract Category']?.formula?.string
                   ?? (name.toLowerCase().includes('pcsa') ? 'PCSA' : 'Main Works'),
    noClientApproval: props['No Client Approval']?.checkbox           ?? false,
    inProduction:     props['In Production']?.checkbox                ?? false,
    dmPhase:          props['DM Phase']?.select?.name                 ?? null,

    dates: {
      dt1Start:    { plan:   d(props, '1st DT Start (Plan)'),
                     actual: d(props, '1st DT Start (Actual)'),
                     adj:    null },
      dt1Delivery: { plan:   d(props, '1st DT Delivery (Plan)'),
                     adj:    d(props, '1st DT Delivery (Adj)'),
                     actual: d(props, '1st DT Delivery (Actual)') },
      sub1:        { plan:   d(props, '1st Submission Date (Plan)'),
                     adj:    d(props, '1st Submission Date (Adj)'),
                     actual: d(props, '1st Submission Date (Actual)') },
      s4Status:    { plan:   d(props, '2nd DT Start (Plan)'),
                     adj:    d(props, '2nd DT Start (Adj)'),
                     actual: null },
      dt2Start:    { plan:   d(props, '2nd DT Start (Plan)'),
                     adj:    d(props, '2nd DT Start (Adj)'),
                     actual: null },
      dt2Delivery: { plan:   d(props, '2nd DT Delivery (Plan)'),
                     adj:    d(props, '2nd DT Delivery (Adj)'),
                     actual: d(props, '2nd DT Delivery (Actual)') },
      sub2:        { plan:   d(props, '2nd Submission Date (Plan)'),
                     adj:    d(props, '2nd Submission Date (Adj)'),
                     actual: d(props, '2nd Submission Date (Actual)') },
      s5Status:    { plan:   d(props, 'Constr. DT Start (Plan)'),
                     adj:    d(props, 'Constr. DT Start (Adj)'),
                     actual: null },
      dtcDelivery: { plan:   d(props, 'Constr. DT Delivery (Plan)'),
                     adj:    d(props, 'Constr. DT Delivery (Adj)'),
                     actual: d(props, 'Constr. DT Delivery (Actual)') },
      subC01:      { plan:   d(props, 'Constr. Submission Date (Plan)'),
                     adj:    d(props, 'Constr. Submission Date (Adj)'),
                     actual: d(props, 'Constr. Submission Date (Actual)') },
      production:  { plan: null },
    },

    drawings,
  }
}

// ── Items transformer (for /api/projects/:id/items) ───────────────────────────
const contractCat = name =>
  (name || '').toUpperCase().includes('PCSA') ? 'PCSA' : 'Main Works'

export function transformItem(page) {
  const id   = page.id
  const p    = page.properties ?? {}
  const name = titleVal(p, 'Item Name') ?? 'Untitled'

  const rfiCount     = relCount(p, 'Related RFI')
  const drawingCount = relCount(p, 'Drawing No(s)')
  const tdlCount     = relCount(p, 'To Do List')
  const finishCount  = relCount(p, 'Finishes')

  const sub1Adj   = dateVal(p, '1st Submission Date (Adj)')
  const s4Adj     = dateVal(p, '2nd DT Start (Adj)')
  const sub2Adj   = dateVal(p, '2nd Submission Date (Adj)')
  const s5Adj     = dateVal(p, 'Constr. DT Start (Adj)')
  const subC01Adj = dateVal(p, 'Constr. Submission Date (Adj)')

  const upcomingDates = [sub1Adj, s4Adj, sub2Adj, s5Adj, subC01Adj].filter(Boolean).map(d => new Date(d))
  const nextDate = upcomingDates.length
    ? new Date(Math.min(...upcomingDates)).toISOString().slice(0, 10)
    : null

  // Timeline-keyed shape for MiniTimeline compatibility
  const dates = {
    sub1:     { adj: sub1Adj },
    s4Status: { adj: s4Adj },
    sub2:     { adj: sub2Adj },
    s5Status: { adj: s5Adj },
    subC01:   { adj: subC01Adj },
  }

  return {
    id,
    name,
    status:           statusVal(p, 'Status'),
    dmPhase:          selectVal(p, 'DM Phase'),
    assignee:         personVal(p, 'Assigned To'),
    contractCategory: contractCat(name),
    noClientApproval: checkVal(p, 'No Client Approval'),
    inProduction:     checkVal(p, 'In Production'),
    rfiCount,
    tdlCount,
    drawingCount,
    finishCount,
    dates,
    nextDate,
    rfiIds: rfiCount <= 20 ? relIds(p, 'Related RFI') : [],
    tdlIds: tdlCount <= 20 ? relIds(p, 'To Do List')  : [],
  }
}

// ── Drawing transformer ───────────────────────────────────────────────────────
export function transformDrawing(page) {
  const props = page.properties ?? {}
  const t1 = props['Drawing Title 1']?.rich_text?.[0]?.plain_text ?? ''
  const t2 = props['Drawing Title 2']?.rich_text?.[0]?.plain_text ?? ''
  const t3 = props['Drawing Title 3']?.rich_text?.[0]?.plain_text ?? ''

  return {
    id:            page.id,
    drawingNumber: props['Drawing Number']?.title?.[0]?.plain_text ?? '',
    title:         [t1, t2, t3].filter(Boolean).join(' — '),
    rev:           props['Rev']?.select?.name
                ?? props['Rev']?.rich_text?.[0]?.plain_text
                ?? null,

    s4Submit: {
      plan:   anyDate(props, 'S4 Submit Date (Plan)'),
      actual: d(props,       'S4 Submit Date (Actual)'),
      adj:    anyDate(props, 'S4 Submit Date (Adj)'),
    },
    s4Status:     props['S4 Status (LOR)']?.select?.name ?? null,

    s5Submit: {
      plan:   anyDate(props, 'S5 Submit Date (Plan)'),
      actual: d(props,       'S5 Submit Date (Actual)'),
      adj:    anyDate(props, 'S5 Submit Date (Adj)'),
    },
    s5Status:     props['S5 Status (F&P)']?.select?.name ?? null,

    c01Submit: {
      plan:   anyDate(props, 'C01 Submit Date (Plan)'),
      actual: d(props,       'C01 Submit Date (Actual)'),
      adj:    anyDate(props, 'C01 Submit Date (Adj)'),
    },

    itemIds: props['Item']?.relation?.map(r => r.id) ?? [],
  }
}

// ── Task pages fetcher (with filter_properties optimisation) ──────────────────
export async function fetchTaskPages(projectId) {
  const cacheKey = `tasks:${projectId}`
  const cached   = getCached(cacheKey)
  if (cached) return cached

  const TASKS_DB = process.env.NOTION_DB_TASKS
  const queryUrl = `${NOTION_API}/databases/${TASKS_DB}/query`

  const pages  = []
  let   cursor
  do {
    const body = {
      page_size: 100,
      filter: { property: 'Projects', relation: { contains: projectId } },
      ...(cursor ? { start_cursor: cursor } : {}),
    }
    const r = await fetchNotion(
      queryUrl,
      { method: 'POST', headers: notionHeaders(), body: JSON.stringify(body) },
      27000,
    )
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      throw Object.assign(new Error(`Tasks query failed: ${r.status} ${txt.slice(0, 200)}`), { status: r.status })
    }
    const data = await r.json()
    pages.push(...data.results)
    cursor = data.has_more ? data.next_cursor : undefined
  } while (cursor)

  setCached(cacheKey, pages, 5 * 60 * 1000)
  return pages
}

// ── Drawing map fetcher ────────────────────────────────────────────────────────
export async function fetchDrawingMap(taskIds) {
  if (taskIds.length === 0) return new Map()

  const DRAWINGS_DB = process.env.NOTION_DB_DRAWINGS
  const allPages    = []
  const CHUNK       = 100

  for (let i = 0; i < taskIds.length; i += CHUNK) {
    const chunk  = taskIds.slice(i, i + CHUNK)
    const filter = chunk.length === 1
      ? { property: 'Item', relation: { contains: chunk[0] } }
      : { or: chunk.map(id => ({ property: 'Item', relation: { contains: id } })) }

    let cursor
    do {
      const body = { page_size: 100, filter, ...(cursor ? { start_cursor: cursor } : {}) }
      const r = await fetchNotion(
        `${NOTION_API}/databases/${DRAWINGS_DB}/query`,
        { method: 'POST', headers: notionHeaders(), body: JSON.stringify(body) },
        27000,
      )
      if (!r.ok) {
        const txt = await r.text().catch(() => '')
        throw Object.assign(new Error(`Drawings query failed: ${r.status} ${txt.slice(0, 200)}`), { status: r.status })
      }
      const data = await r.json()
      allPages.push(...data.results)
      cursor = data.has_more ? data.next_cursor : undefined
    } while (cursor)
  }

  const map = new Map()
  for (const page of allPages) {
    const drawing = transformDrawing(page)
    for (const itemId of drawing.itemIds) {
      if (!map.has(itemId)) map.set(itemId, [])
      map.get(itemId).push(drawing)
    }
  }
  return map
}

// ── RFI transformer ───────────────────────────────────────────────────────────
export function transformRFI(page) {
  const p = page.properties ?? {}
  return {
    id:             page.id,
    rfiNumber:      p['RFI Number']?.number                        ?? null,
    description:    p['RFI Description']?.title?.[0]?.plain_text   ?? null,
    status:         p['RFI Status']?.select?.name                  ?? null,
    tbcBy:          p['TBC by']?.select?.name                      ?? null,
    relatedItemIds: p['Related Item(s)']?.relation?.map(r => r.id) ?? [],
  }
}
