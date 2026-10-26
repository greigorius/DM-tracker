import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.NOTION_TOKEN = 'test'
const { computeStatuses, writeChanges } = await import('../netlify/functions/_itemStatusEngine.js')

const ITEM_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'   // has submissions
const ITEM_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'   // held by a variation, no history
const ITEM_C = 'cccccccccccccccccccccccccccccccc'   // legacy Complete, held
const DWG_1 = 'd1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1'
const DWG_2 = 'd2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2'

const rel = (...ids) => ({ relation: ids.map((id) => ({ id })) })
const sel = (name) => ({ select: name ? { name } : null })
const dt = (start) => ({ date: start ? { start } : null })
const ttl = (t) => ({ title: [{ plain_text: t }] })

const DATA = {
  '36f210e4582e80ed8b2ce9e245bda433': [ // submissions
    { id: 's1', created_time: '2026-09-01T09:00:00Z', properties: { Drawing: rel(DWG_1), Item: rel(ITEM_A), Stage: sel('S4'), Status: sel('Graded'), 'Client Grade': sel('B'), DT: rel(), Submitted: dt('2026-09-01') } },
    { id: 's2', created_time: '2026-10-01T09:00:00Z', properties: { Drawing: rel(DWG_1), Item: rel(ITEM_A), Stage: sel('S5'), Status: sel('Issued'), 'Client Grade': sel(null), DT: rel(), Submitted: dt('2026-10-01') } },
  ],
  '22d210e4582e80189f63f2cee93be4b3': [], // rfis
  '22d210e4582e81359357c8ce288be096': [ // variations
    { id: 'v1', properties: { Items: rel(ITEM_B, ITEM_C), 'Variation Type': sel('Scope Change'), 'Pause Override': sel(null), 'Variation Status': sel('Awaiting Instruction'), 'Change Request Date': dt('2026-01-01'), 'Decision Date': dt(null) } },
  ],
  'bb783a35a407463789c678ebc76c8699': [ // tasks
    { id: ITEM_A, url: 'u/a', properties: { 'Item Name': ttl('A'), 'Item Status': { status: { name: 'In Design' } }, '1st DT Start (Actual)': dt('2026-08-01'), 'WO Raised': dt(null) } },
    { id: ITEM_B, url: 'u/b', properties: { 'Item Name': ttl('B'), 'Item Status': { status: { name: 'Ongoing' } }, '1st DT Start (Actual)': dt(null), 'WO Raised': dt(null) } },
    { id: ITEM_C, url: 'u/c', properties: { 'Item Name': ttl('C'), 'Item Status': { status: { name: 'Complete' } }, '1st DT Start (Actual)': dt(null), 'WO Raised': dt(null) } },
  ],
  '13b210e4582e8168923ff79fa8628b59': [ // drawings
    { id: DWG_1, url: 'u/d1', properties: { Item: rel(ITEM_A), 'Drawing Number': ttl('D-001'), 'Drawing Status': sel('DM Review'), 'Schedule Production (Actual)': dt(null) } },
    { id: DWG_2, url: 'u/d2', properties: { Item: rel(ITEM_A), 'Drawing Number': ttl('D-002'), 'Drawing Status': sel('Complete'), 'Schedule Production (Actual)': dt(null) } },
  ],
}

const patches = []
globalThis.fetch = async (url, opts = {}) => {
  const m = url.match(/databases\/([0-9a-f]+)\/query/)
  if (m) return { ok: true, json: async () => ({ results: DATA[m[1]] ?? [], has_more: false }) }
  if (opts.method === 'PATCH') { patches.push({ url, body: JSON.parse(opts.body) }); return { ok: true, json: async () => ({}) } }
  throw new Error('unexpected fetch ' + url)
}

test('engine works out statuses from Notion pages', async () => {
  const r = await computeStatuses({ today: '2026-10-26' })
  const item = (id) => r.items.find((i) => i.id === id)
  assert.equal(item(ITEM_A).proposed, 'In Progress')
  assert.equal(item(ITEM_B).proposed, 'Blocked')
  assert.equal(item(ITEM_C).proposed, 'Design Complete', 'held but finished stays finished')
  const d1 = r.drawings.find((d) => d.id === DWG_1)
  assert.equal(d1.proposed, 'Client Review', 'latest submission is the S5 issue')
  assert.equal(d1.changed, true)
  const d2 = r.drawings.find((d) => d.id === DWG_2)
  assert.equal(d2.proposed, 'Complete', 'no history keeps its status')
  assert.equal(d2.changed, false)

  const w = await writeChanges(r)
  assert.equal(w.errors.length, 0)
  assert.equal(w.drawingsWritten, 1)
  assert.equal(w.itemsWritten, 3)
  assert.deepEqual(patches[0].body, { properties: { 'Drawing Status': { select: { name: 'Client Review' } } } })
  assert.ok(patches.slice(1).every((p) => p.body.properties['Item Status'].status.name))
})
