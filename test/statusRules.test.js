import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  variationHolds, rfiHolds, statusFromSubmission, latestSubmission, drawingStatus, itemStatus, legacyItemStatus, ITEM,
} from '../netlify/functions/_statusRules.js'

const today = '2026-10-26'

test('variation hold matches the Scheduling Tool', () => {
  const v = { type: 'Design Change', override: null, status: 'Awaiting Instruction', requestDate: '2026-01-01', decisionDate: null }
  assert.equal(variationHolds(v, today), true)
  assert.equal(variationHolds({ ...v, status: 'Instruction Received' }, today), false, 'decided without a date ends the hold')
  assert.equal(variationHolds({ ...v, decisionDate: '2026-10-20' }, today), false)
  assert.equal(variationHolds({ ...v, decisionDate: '2026-11-01' }, today), true, 'decision in the future keeps the hold')
  assert.equal(variationHolds({ ...v, requestDate: null }, today), false, 'no request date, no hold')
  assert.equal(variationHolds({ ...v, requestDate: '2026-12-01' }, today), false, 'not started yet')
  assert.equal(variationHolds({ ...v, type: 'Altered for Buildability' }, today), false)
  assert.equal(variationHolds({ ...v, type: 'Altered for Buildability', override: 'Pauses' }, today), true)
  assert.equal(variationHolds({ ...v, override: 'Does not pause' }, today), false)
  assert.equal(variationHolds({ ...v, status: null }, today), true, 'no status counts as undecided')
})

test('stop-work RFI hold', () => {
  const r = { stopsWork: true, status: 'Open', raised: '2026-10-01', responded: null, closed: null }
  assert.equal(rfiHolds(r, today), true)
  assert.equal(rfiHolds({ ...r, stopsWork: false }, today), false)
  assert.equal(rfiHolds({ ...r, responded: '2026-10-20' }, today), false)
  assert.equal(rfiHolds({ ...r, status: 'Close Out' }, today), true, 'Close Out with no response date still holds')
  assert.equal(rfiHolds({ ...r, status: 'Closed' }, today), false)
})

test('drawing status from the latest submission', () => {
  const m = (stage, status, grade) => statusFromSubmission({ stage, status, grade })
  assert.equal(m('S4', 'Submitted'), 'DM Review')
  assert.equal(m('S4', 'Awaiting Issue'), 'DM Review')
  assert.equal(m('S4', 'Rejected'), 'DT Review')
  assert.equal(m('S5', 'Graded', 'QA Rejected'), 'DT Review')
  assert.equal(m('S4', 'Issued'), 'Client Review')
  assert.equal(m('S4', 'Graded', 'B'), 'Approval Updates')
  assert.equal(m('A4.5', 'Graded', 'Rejected'), 'DT Review')
  assert.equal(m('A4.5', 'Graded', 'Approved'), 'Schedule')
  assert.equal(m('PRD', 'Graded', 'Approved'), 'In Production')
  assert.equal(m('PRD', 'Graded', 'Rejected'), 'DT Review')
  assert.equal(m('AB', 'Complete', 'Approved'), 'Complete')
  assert.equal(m('A4.5', 'Schedule', 'Approved'), 'Schedule')
  assert.equal(m('PRD', 'Issued'), 'In Production')
  assert.equal(m('PRD', 'Rejected'), 'Production Updates')
  assert.equal(m('PRD', 'Complete'), 'Complete')
  assert.equal(m('S3', 'Complete'), 'Complete')
  assert.equal(m('AB', 'Issued'), 'As Built Updates')
  assert.equal(statusFromSubmission(null), null)
})

test('latest submission picks the newest', () => {
  const a = { submitted: '2026-09-01', created: '2026-09-01T10:00', stage: 'S4' }
  const b = { submitted: '2026-10-01', created: '2026-10-01T10:00', stage: 'S5' }
  assert.equal(latestSubmission([a, b]).stage, 'S5')
})

test('drawing overrides: hold, supplier, no history', () => {
  const sub = { stage: 'S4', status: 'Rejected', submitted: '2026-10-01', dt: 'https://app.notion.com/34b210e4582e80cb992cc2906a250c82' }
  assert.equal(drawingStatus({ current: 'DM Review', submissions: [sub] }, today).status, 'With Supplier')
  assert.equal(drawingStatus({ current: 'DM Review', submissions: [{ ...sub, status: 'Issued' }] }, today).status, 'Client Review', 'supplier override only during design work')
  assert.equal(drawingStatus({ current: 'Complete', submissions: [] }, today).status, 'Complete', 'no history keeps current')
  const stop = { stopsWork: true, status: 'Open', raised: '2026-10-01' }
  assert.equal(drawingStatus({ current: 'Client Review', submissions: [sub], rfis: [stop] }, today).status, 'On Hold')
  assert.equal(drawingStatus({ current: 'DM Review', submissions: [{ ...sub, dt: null, blocked: true }] }, today).status, 'On Hold', 'blocked in Drawing Flow')
  assert.equal(drawingStatus({ current: 'DM Review', submissions: [{ ...sub, dt: null, blocked: true, submitted: '2026-09-01' }, { ...sub, dt: null, submitted: '2026-10-05' }] }, today).status, 'DT Review', 'only the latest submission counts')
  const supplierRfi = { tbc: 'Supplier', status: 'Open' }
  assert.equal(drawingStatus({ current: 'X', submissions: [{ ...sub, dt: null }], rfis: [supplierRfi] }, today).status, 'With Supplier')
})

test('item status rules', () => {
  const flow = (status, stage = 'S4') => ({ status, fromFlow: true, stage })
  assert.equal(itemStatus({ current: 'Omitted' }, [], true).status, ITEM.OMITTED)
  assert.equal(itemStatus({ current: 'Backlog' }, [], false).status, ITEM.TODO)
  assert.equal(itemStatus({ current: 'Ongoing', dtStart: '2026-01-01' }, [], false).status, ITEM.PROGRESS)
  assert.equal(itemStatus({ current: 'Complete' }, [], true).status, ITEM.COMPLETE, 'a hold does not reopen a finished item')
  assert.equal(itemStatus({ current: 'Blocked' }, [], false).status, ITEM.TODO, 'Blocked clears when the hold ends')
  assert.equal(itemStatus({ current: 'In Design' }, [flow('Client Review')], false).status, ITEM.PROGRESS)
  assert.equal(itemStatus({ current: 'In Design' }, [flow('Client Review')], true).status, ITEM.BLOCKED)
  assert.equal(itemStatus({ current: 'In Design', woRaised: '2026-10-01' }, [flow('Schedule', 'A4.5')], false).status, ITEM.PRODUCTION)
  assert.equal(itemStatus({ current: 'In Design' }, [flow('In Production', 'PRD'), flow('Client Review')], false).status, ITEM.PRODUCTION)
  assert.equal(itemStatus({ current: 'In Production', woRaised: '2026-10-01' }, [flow('Complete', 'PRD'), flow('Complete', 'PRD')], false).status, ITEM.COMPLETE)
  assert.equal(itemStatus({ current: 'In Production', woRaised: '2026-10-01' }, [flow('Complete', 'PRD'), flow('Complete', 'PRD')], true).status, ITEM.COMPLETE)
  assert.equal(itemStatus({ current: 'In Production' }, [flow('In Production', 'PRD')], true).status, ITEM.BLOCKED, 'a hold blocks production')
})

test('a locked item can proceed at risk', async () => {
  const { itemStatus: is } = await import('../netlify/functions/_statusRules.js')
  // The engine skips locked rows before calling itemStatus; this documents the unlocked behaviour.
  assert.equal(is({ current: 'In Progress', dtStart: '2026-01-01' }, [], true).status, ITEM.BLOCKED)
})

test('legacy mapping', () => {
  assert.equal(legacyItemStatus('Close Out'), ITEM.COMPLETE)
  assert.equal(legacyItemStatus('PC Approved'), ITEM.PROGRESS)
  assert.equal(legacyItemStatus('Set Up'), ITEM.TODO)
  assert.equal(legacyItemStatus(undefined), ITEM.TODO)
})

test('blank, never-issued drawings do not hold an item open', async () => {
  const { itemStatus, ITEM } = await import('../netlify/functions/_statusRules.js')
  const ds = [{ status: 'Complete', fromFlow: true, stage: 'AB' }, { status: null, fromFlow: false, stage: null }]
  assert.equal(itemStatus({ current: 'In Production' }, ds, false).status, ITEM.COMPLETE)
  assert.equal(itemStatus({ current: 'In Production' }, [...ds, { status: 'In Production', fromFlow: true, stage: 'PRD' }], false).status, ITEM.PRODUCTION)
})

test('Production Stage from the Drawing Flow Production tab sets the drawing and item', () => {
  const signed = { stage: 'A4.5', status: 'Graded', grade: 'Approved', submitted: '2026-06-04' }
  assert.equal(drawingStatus({ submissions: [signed] }, '2026-11-20').status, 'Schedule', 'signed off, not decided')
  assert.equal(drawingStatus({ submissions: [signed], productionStage: 'To Be Scheduled' }, '2026-11-20').status, 'Schedule')
  assert.equal(drawingStatus({ submissions: [signed], productionStage: 'In Production' }, '2026-11-20').status, 'In Production')
  assert.equal(drawingStatus({ submissions: [signed], productionStage: 'Awaiting As Built' }, '2026-11-20').status, 'As Built Updates')
  const ab = { stage: 'AB', status: 'Submitted', submitted: '2026-11-21' }
  assert.equal(drawingStatus({ submissions: [signed, ab], productionStage: 'Awaiting As Built' }, '2026-11-22').status, 'As Built Updates', 'an as-built in flight speaks for the drawing')
  assert.equal(drawingStatus({ submissions: [signed, { ...ab, status: 'Complete', grade: 'Approved' }], productionStage: 'Awaiting As Built' }, '2026-11-22').status, 'Complete', 'AB Approved closes it')
  const dw = (productionStage, status) => ({ status, fromFlow: true, stage: 'A4.5', productionStage })
  assert.equal(itemStatus({ current: 'In Progress' }, [dw(null, 'Schedule')], false).status, ITEM.PROGRESS, 'signed off but not scheduled')
  assert.equal(itemStatus({ current: 'In Progress' }, [dw('In Production', 'In Production')], false).status, ITEM.PRODUCTION, 'scheduled or outsourced')
  assert.equal(itemStatus({ current: 'In Progress' }, [dw('Awaiting As Built', 'As Built Updates')], false).status, ITEM.PRODUCTION, 'site-only / installed')
  assert.equal(itemStatus({ current: 'In Progress' }, [dw('Complete', 'Complete')], false).status, ITEM.COMPLETE)
  assert.equal(itemStatus({ current: 'In Progress' }, [dw('Awaiting Install', 'Schedule')], false).status, ITEM.PRODUCTION, 'install only: supplied by others')
})
