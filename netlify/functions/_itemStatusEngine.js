/**
 * _itemStatusEngine.js — loads what the status rules need from Notion, works out
 * every Item Status and Drawing Status, and (outside dry runs) writes the changes.
 */
import { queryAll, fetchNotion, notionHeaders } from './_helpers.js'
import { variationHolds, rfiHolds, drawingStatus, itemStatus, cleanId } from './_statusRules.js'

const NOTION_API = 'https://api.notion.com/v1'
const DB = {
  tasks:       () => process.env.NOTION_DB_TASKS       || 'bb783a35a407463789c678ebc76c8699',
  drawings:    () => process.env.NOTION_DB_DRAWINGS    || '13b210e4582e8168923ff79fa8628b59',
  submissions: () => process.env.NOTION_DB_SUBMISSIONS || '36f210e4582e80ed8b2ce9e245bda433',
  rfis:        () => process.env.NOTION_DB_RFIS        || '22d210e4582e80189f63f2cee93be4b3',
  variations:  () => process.env.NOTION_DB_VARIATIONS  || '22d210e4582e81359357c8ce288be096',
}

const sel   = (p, k) => p[k]?.select?.name ?? null
const stat  = (p, k) => p[k]?.status?.name ?? null
const date  = (p, k) => p[k]?.date?.start ?? null
const rel   = (p, k) => (p[k]?.relation ?? []).map((r) => cleanId(r.id))
const title = (p, k) => (p[k]?.title ?? []).map((t) => t.plain_text).join('')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export const todayLondon = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

/** Runs async jobs with a small concurrency limit (Notion allows about 3 requests a second). */
async function pool(items, limit, fn) {
  const out = []; let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]) }
  }))
  return out
}

async function loadSources() {
  const [subs, rfis, vars] = await Promise.all([
    queryAll(DB.submissions(), null),
    queryAll(DB.rfis(), { or: [
      { property: 'Stops Work', checkbox: { equals: true } },
      { and: [{ property: 'TBC by', select: { equals: 'Supplier' } }, { or: [
        { property: 'RFI Status', select: { equals: 'Raise' } }, { property: 'RFI Status', select: { equals: 'Open' } }] }] },
    ] }),
    queryAll(DB.variations(), { property: 'Change Request Date', date: { is_not_empty: true } }),
  ])
  return {
    submissions: subs.map((pg) => { const p = pg.properties
      return { id: cleanId(pg.id), drawing: rel(p, 'Drawing')[0] ?? null, item: rel(p, 'Item')[0] ?? null,
        stage: sel(p, 'Stage'), status: sel(p, 'Status'), grade: sel(p, 'Client Grade'),
        dt: rel(p, 'DT')[0] ?? null, submitted: date(p, 'Submitted'), created: pg.created_time } }),
    rfis: rfis.map((pg) => { const p = pg.properties
      return { id: cleanId(pg.id), items: rel(p, 'Related Item(s)'), drawings: rel(p, 'Drawing'),
        stopsWork: !!p['Stops Work']?.checkbox, status: sel(p, 'RFI Status'), tbc: sel(p, 'TBC by'),
        raised: date(p, 'Date Raised'), responded: date(p, 'Date Responded'), closed: date(p, 'Date Closed'),
        created: (pg.created_time || '').slice(0, 10) } }),
    variations: vars.map((pg) => { const p = pg.properties
      return { id: cleanId(pg.id), items: rel(p, 'Items'), type: sel(p, 'Variation Type'), override: sel(p, 'Pause Override'),
        status: sel(p, 'Variation Status'), requestDate: date(p, 'Change Request Date'), decisionDate: date(p, 'Decision Date') } }),
  }
}

async function loadItems(itemIds) {
  if (itemIds?.length) {
    const pages = await pool(itemIds, 3, (id) =>
      fetchNotion(`${NOTION_API}/pages/${id}`, { headers: notionHeaders() }).then((r) => (r.ok ? r.json() : null)))
    return pages.filter(Boolean)
  }
  return queryAll(DB.tasks(), null)
}

/** Drawings for the given items, 20 items per query. */
async function loadDrawings(itemIds) {
  const chunks = []
  for (let i = 0; i < itemIds.length; i += 20) chunks.push(itemIds.slice(i, i + 20))
  const res = await pool(chunks, 3, (ids) => queryAll(DB.drawings(),
    ids.length === 1 ? { property: 'Item', relation: { contains: ids[0] } } : { or: ids.map((id) => ({ property: 'Item', relation: { contains: id } })) }))
  return res.flat()
}

/**
 * Works out statuses. Returns { today, items: [...], drawings: [...] } where each row
 * has current, proposed, reason and changed.
 * opts: { itemIds?: string[], today?: 'YYYY-MM-DD' }
 */
export async function computeStatuses(opts = {}) {
  const today = opts.today || todayLondon()
  const ids = opts.itemIds?.map(cleanId)
  const [src, itemPages] = await Promise.all([loadSources(), loadItems(ids)])

  const subsByDrawing = new Map(), subItems = new Set()
  for (const s of src.submissions) {
    if (s.item) subItems.add(s.item)
    if (!s.drawing) continue
    if (!subsByDrawing.has(s.drawing)) subsByDrawing.set(s.drawing, [])
    subsByDrawing.get(s.drawing).push(s)
  }
  const heldItems = new Set(), rfisByDrawing = new Map()
  for (const v of src.variations) if (variationHolds(v, today)) v.items.forEach((i) => heldItems.add(i))
  for (const r of src.rfis) {
    if (rfiHolds(r, today)) r.items.forEach((i) => heldItems.add(i))
    for (const d of r.drawings) { if (!rfisByDrawing.has(d)) rfisByDrawing.set(d, []); rfisByDrawing.get(d).push(r) }
  }

  const items = itemPages.map((pg) => { const p = pg.properties
    return { id: cleanId(pg.id), url: pg.url, name: title(p, 'Item Name'), current: stat(p, 'Item Status'),
      dtStart: date(p, '1st DT Start (Actual)'), woRaised: date(p, 'WO Raised'), locked: !!p['Lock Status']?.checkbox } })

  // Only items with Drawing Flow history or a works order need their drawings.
  const needDrawings = items.filter((i) => subItems.has(i.id) || i.woRaised).map((i) => i.id)
  const drawingPages = needDrawings.length ? await loadDrawings(needDrawings) : []

  const drawingsByItem = new Map(), drawingRows = []
  for (const pg of drawingPages) {
    const p = pg.properties, id = cleanId(pg.id), item = rel(p, 'Item')[0]
    const current = sel(p, 'Drawing Status'), locked = !!p['Lock Status']?.checkbox
    const r = drawingStatus({ current, submissions: subsByDrawing.get(id) || [], rfis: rfisByDrawing.get(id) || [] }, today)
    if (locked) { r.status = current; r.reason = 'Locked: status set by hand' }
    const row = { id, url: pg.url, item, number: title(p, 'Drawing Number'), current, proposed: r.status, reason: r.reason,
      fromFlow: r.fromFlow, stage: r.stage, schedProdActual: date(p, 'Schedule Production (Actual)'), locked }
    row.changed = !locked && !!row.proposed && row.proposed !== row.current
    drawingRows.push(row)
    if (!drawingsByItem.has(item)) drawingsByItem.set(item, [])
    drawingsByItem.get(item).push({ status: row.proposed, fromFlow: row.fromFlow, stage: row.stage, schedProdActual: row.schedProdActual })
  }

  const itemRows = items.map((i) => {
    if (i.locked) return { ...i, proposed: i.current, reason: 'Locked: status set by hand', changed: false }
    const r = itemStatus(i, drawingsByItem.get(i.id) || [], heldItems.has(i.id))
    return { ...i, proposed: r.status, reason: r.reason, changed: r.status !== i.current }
  })
  return { today, items: itemRows, drawings: drawingRows }
}

async function patchPage(id, properties) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetchNotion(`${NOTION_API}/pages/${id}`, { method: 'PATCH', headers: notionHeaders(), body: JSON.stringify({ properties }) })
    if (r.ok) return true
    if (r.status === 429 || r.status >= 500) { await sleep(1000 * (attempt + 1)); continue }
    throw new Error(`Update ${id} failed: ${r.status} ${(await r.text().catch(() => '')).slice(0, 160)}`)
  }
  throw new Error(`Update ${id} failed after retries`)
}

/** Writes changed Drawing Statuses first, then changed Item Statuses. Only changed rows are written. */
export async function writeChanges(result) {
  const errors = []; let drawings = 0, items = 0
  for (const d of result.drawings.filter((x) => x.changed)) {
    try { await patchPage(d.id, { 'Drawing Status': { select: { name: d.proposed } } }); drawings++ } catch (e) { errors.push(e.message) }
    await sleep(350)
  }
  for (const i of result.items.filter((x) => x.changed)) {
    try { await patchPage(i.id, { 'Item Status': { status: { name: i.proposed } } }); items++ } catch (e) { errors.push(e.message) }
    await sleep(350)
  }
  return { drawingsWritten: drawings, itemsWritten: items, errors }
}

/** Summary counts for a dry run. */
export function summarise(result) {
  const count = (rows) => rows.filter((r) => r.changed).reduce((m, r) => {
    const k = `${r.current ?? '(blank)'} → ${r.proposed}`; m[k] = (m[k] || 0) + 1; return m }, {})
  return {
    today: result.today,
    items: { total: result.items.length, changing: result.items.filter((r) => r.changed).length, byChange: count(result.items),
      locked: result.items.filter((r) => r.locked).map(({ name, url, current }) => ({ name, url, current })) },
    drawings: { checked: result.drawings.length, changing: result.drawings.filter((r) => r.changed).length, byChange: count(result.drawings),
      locked: result.drawings.filter((r) => r.locked).map(({ number, url, current }) => ({ number, url, current })) },
  }
}
