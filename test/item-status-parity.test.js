// The Hub's snapshot-based Item/Drawing Status (hub-core/item-status.js) must give
// the same answer as the live automation (netlify/functions/_itemStatusEngine.js).
// Same Notion pages go through both: mocked Notion for the engine, mapPage → snapshot
// rows for the Hub.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.NOTION_TOKEN = 'test'
const { computeStatuses } = await import('../netlify/functions/_itemStatusEngine.js')
const { mapPage } = await import('../hub-core/mappers.js')
const { deriveStatuses, statusPlan } = await import('../hub-core/item-status.js')

const id = (ch) => ch.repeat(32).slice(0, 32)
const I = Object.fromEntries('abcdefghijkl'.split('').map((k, n) => [k.toUpperCase(), id('0123456789abcdef'[n % 16] + k).replace(/[g-z]/g, '9')]))
const D = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, `d${n}`.repeat(16)]))
const SUPPLIER = '34b210e4582e80cb992cc2906a250c82'

const rel = (...ids) => ({ type: 'relation', relation: ids.map((x) => ({ id: x })) })
const sel = (name) => ({ type: 'select', select: name ? { name } : null })
const st = (name) => ({ type: 'status', status: name ? { name } : null })
const dt = (start) => ({ type: 'date', date: start ? { start } : null })
const ttl = (t) => ({ type: 'title', title: [{ plain_text: t }] })
const chk = (b) => ({ type: 'checkbox', checkbox: !!b })
const num = (n) => ({ type: 'number', number: n })

const sub = (n, drawing, item, stage, status, submitted, extra = {}) => ({ id: `5${String(n).padStart(31, '0')}`, url: `u/s${n}`, created_time: `${submitted}T09:00:00Z`,
  properties: { Submission: ttl(`S${n}`), Drawing: drawing ? rel(drawing) : rel(), Item: rel(item), Stage: sel(stage), Status: sel(status), 'Client Grade': sel(extra.grade || null), DT: extra.dt ? rel(extra.dt) : rel(), Submitted: dt(submitted), Blocked: chk(extra.blocked) } })
const task = (k, status, extra = {}) => ({ id: I[k], url: `u/${k}`, created_time: '2026-01-01T00:00:00Z',
  properties: { 'Item Name': ttl(k), 'Item Status': st(status), '1st DT Start (Actual)': dt(extra.dtStart || null), 'WO Raised': dt(extra.wo || null), 'Lock Status': chk(extra.locked) } })
const dwg = (n, item, status, extra = {}) => ({ id: D[n], url: `u/d${n}`, created_time: '2026-01-01T00:00:00Z',
  properties: { Item: rel(item), 'Drawing Number': ttl(`D-00${n}`), 'Drawing Status': sel(status), 'Schedule Production (Actual)': dt(extra.sched || null), 'Lock Status': chk(extra.locked) } })
const rfi = (n, items, drawings, stopsWork, status, raised, extra = {}) => ({ id: `7${String(n).padStart(31, '0')}`, url: `u/r${n}`, created_time: `${raised}T09:00:00Z`,
  properties: { 'RFI Description': ttl(`R${n}`), 'RFI Number': num(n), 'Related Item(s)': rel(...items), Drawing: rel(...drawings), 'Stops Work': chk(stopsWork), 'RFI Status': sel(status), 'TBC by': sel(extra.tbc || 'Architect'),
    'Date Raised': dt(raised), 'Date Responded': dt(extra.responded || null), 'Date Closed': dt(null) } })
const vc = (n, items, type, status, requested, decision = null, override = null) => ({ id: `8${String(n).padStart(31, '0')}`, url: `u/v${n}`, created_time: '2026-01-01T00:00:00Z',
  properties: { 'Variation Description': ttl(`V${n}`), ID: { type: 'unique_id', unique_id: { number: n } }, Items: rel(...items), 'Variation Type': sel(type), 'Pause Override': sel(override), 'Variation Status': sel(status), 'Change Request Date': dt(requested), 'Decision Date': dt(decision) } })

const PAGES = {
  submissions: [
    sub(1, D[1], I.A, 'S4', 'Graded', '2026-09-01', { grade: 'B' }), sub(2, D[1], I.A, 'S5', 'Issued', '2026-10-01'),
    sub(3, D[3], I.F, 'S4', 'Submitted', '2026-10-02', { blocked: true }),
    sub(4, D[5], I.H, 'PRD', 'Complete', '2026-09-10'), sub(5, D[6], I.I, 'PRD', 'Issued', '2026-10-10'),
    sub(6, D[7], I.J, 'S4', 'Rejected', '2026-10-05', { dt: SUPPLIER }), sub(7, null, I.L, 'S4', 'Submitted', '2026-10-06', { blocked: true }),
    sub(8, D[8], I.K, 'S4', 'Submitted', '2026-10-06'),
  ],
  rfis: [
    rfi(1, [I.B], [], true, 'Open', '2026-10-01'), rfi(2, [], [D[4]], true, 'Open', '2026-10-01'),
    rfi(3, [I.A], [], true, 'Closed', '2026-09-01', { responded: '2026-09-10' }), rfi(4, [I.A], [D[1]], false, 'Open', '2026-10-01', { tbc: 'Supplier' }),
  ],
  variations: [
    vc(1, [I.C, I.D, I.E], 'Scope Change', 'Awaiting Instruction', '2026-01-01'),
    vc(2, [I.I], 'Design Change', 'Instruction Received', '2026-09-01', '2026-09-20'),
    vc(3, [I.H], 'Minor', 'Awaiting Instruction', '2026-10-01'),
  ],
  tasks: [
    task('A', 'In Design', { dtStart: '2026-08-01' }), task('B', 'Ongoing'), task('C', 'Complete'), task('D', 'Blocked', { locked: true }),
    task('E', 'In Progress', { dtStart: '2026-06-01' }), task('F', 'In Progress', { dtStart: '2026-06-01' }), task('G', 'In Progress', { dtStart: '2026-06-01' }),
    task('H', 'In Production', { wo: '2026-09-05' }), task('I', 'In Design'), task('J', 'To Do'), task('K', 'Omitted'), task('L', 'In Progress'),
  ],
  drawings: [
    dwg(1, I.A, 'DM Review'), dwg(2, I.A, 'Complete'), dwg(3, I.F, 'DM Review'), dwg(4, I.G, 'Client Review'),
    dwg(5, I.H, 'In Production'), dwg(6, I.I, 'DM Review'), dwg(7, I.J, 'DT Review'), dwg(8, I.K, 'DM Review', { locked: true }),
  ],
}
const DB = { '36f210e4582e8035baaeee8d16b11d4e': 'submissions', '22d210e4582e80189f63f2cee93be4b3': 'rfis', '22d210e4582e81359357c8ce288be096': 'variations',
  'bb783a35a407463789c678ebc76c8699': 'tasks', '13b210e4582e8168923ff79fa8628b59': 'drawings' }

globalThis.fetch = async (url, opts = {}) => {
  const m = url.match(/databases\/([0-9a-f]+)\/query/)
  if (m) {
    const db = DB[m[1]]; let rows = PAGES[db] ?? []
    // Apply the one filter that changes which rows come back: drawings by item.
    const f = JSON.parse(opts.body || '{}').filter
    if (db === 'drawings' && f) {
      const want = new Set((f.or || [f]).map((x) => x.relation.contains))
      rows = rows.filter((p) => p.properties.Item.relation.some((r) => want.has(r.id)))
    }
    return { ok: true, json: async () => ({ results: rows, has_more: false }) }
  }
  const pg = url.match(/pages\/([0-9a-f]+)$/)
  if (pg && !opts.method) { const p = PAGES.drawings.find((d) => d.id === pg[1]) || PAGES.tasks.find((d) => d.id === pg[1]); return p ? { ok: true, json: async () => p } : { ok: false } }
  throw new Error('unexpected fetch ' + url)
}

const snaps = Object.fromEntries(Object.entries(PAGES).map(([db, pages]) => [db, pages.map((p) => mapPage(db, p))]))
const TODAY = '2026-10-26'

test('Hub and automation agree on every item and drawing', async () => {
  const live = await computeStatuses({ today: TODAY })
  const hub = deriveStatuses(snaps, TODAY)
  const pick = (rows) => Object.fromEntries(rows.map((r) => [r.id, { proposed: r.proposed, changed: r.changed, held: (r.blockers || []).map((b) => b.kind).sort() }]))
  assert.deepEqual(pick(hub.items), pick(live.items))
  assert.deepEqual(pick(hub.drawings), pick(live.drawings))
  // Reasons match too, apart from the Hub naming variations by their VC code
  const why = (rows) => Object.fromEntries(rows.map((r) => [r.id, r.reason.replace(/VC-\d+ /g, '')]))
  assert.deepEqual(why(hub.items), why(live.items))
  assert.deepEqual(why(hub.drawings), why(live.drawings))
})

test('fixture covers every outcome', () => {
  const hub = deriveStatuses(snaps, TODAY)
  const by = Object.fromEntries(hub.items.map((r) => [r.name, r.proposed]))
  assert.deepEqual(by, { A: 'In Progress', B: 'Blocked', C: 'Design Complete', D: 'Blocked', E: 'Blocked', F: 'Blocked', G: 'Blocked',
    H: 'Design Complete', I: 'In Production', J: 'In Progress', K: 'Omitted', L: 'Blocked' })
  const dw = Object.fromEntries(hub.drawings.map((r) => [r.number, r.proposed]))
  assert.equal(dw['D-001'], 'Client Review', 'supplier RFI only matters during design stages')
  assert.equal(dw['D-007'], 'With Supplier', 'drawn by a supplier')
  assert.equal(dw['D-008'], 'DM Review', 'locked drawing kept')
})

test('plan lists changes, holds, locks and gaps', () => {
  const p = statusPlan(snaps, TODAY)
  const A = p.changes.find((r) => r.title === 'A')
  assert.equal(A.from, 'In Design'); assert.equal(A.to, 'In Progress')
  assert.equal(A.drawings[0].to, 'Client Review')
  assert.equal(A.id, I.A, 'dashless page id kept for writes')
  assert.ok(!p.changes.some((r) => r.title === 'D' || r.title === 'K'), 'locked and Omitted never change')
  assert.ok(p.held.find((r) => r.title === 'D').locked, 'locked items still show their holds')
  assert.deepEqual(p.locked.map((r) => r.title), ['D'])
  const gaps = Object.fromEntries(p.gaps.map((g) => [g.id, g.count]))
  assert.equal(gaps['rfi-open-undecided'], 1, 'RFI 4 is open without Stops Work')
  assert.equal(gaps['sub-unlinked'], 1, 'submission 7 has no drawing')
  assert.equal(gaps['vc-no-type'], undefined, 'every open variation has a type')
})
