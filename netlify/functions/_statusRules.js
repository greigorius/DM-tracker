/**
 * _statusRules.js — Item Status and Drawing Status rules (pure functions, no I/O).
 *
 * Spec: "Item & Drawing Status Automation — Spec" (claude.ai doc).
 *  - Drawing Status comes from the drawing's latest submission. Drawings with no
 *    Drawing Flow history keep whatever status they have.
 *  - Item Status is one of To Do / In Progress / Blocked / In Production /
 *    Design Complete / Omitted. Omitted is only ever set by hand.
 *  - An item is Blocked by an open pausing variation or a stop-work RFI, using the same
 *    hold rule as the Scheduling Tool. An RFI only blocks when Stops Work is ticked.
 *  - A drawing whose latest submission has Blocked ticked in Drawing Flow is On Hold, and
 *    work stops on its item. A stop-work RFI linked only to a drawing also blocks that item.
 *  - To proceed at risk while a variation is open, the DM ticks Lock Status on the item
 *    and sets its status by hand. Locked items and drawings are skipped (handled in the engine).
 */

export const ITEM = {
  TODO: 'To Do',
  PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  PRODUCTION: 'In Production',
  COMPLETE: 'Design Complete',
  OMITTED: 'Omitted',
}

// Team members who represent outside design work (Team DB).
export const SUPPLIER_TEAM_IDS = new Set([
  '34b210e4582e80cb992cc2906a250c82', // Outsourced
  '34b210e4582e809fbad0fd4e3fc85d51', // By Supplier
])

const PAUSE_TYPES = new Set(['Design Change', 'Scope Change'])
const DECIDED = new Set(['Instruction Received', 'Declined', 'Withdrawn'])
const DESIGN_STAGES = new Set(['First Issue', 'DT Review', 'Approval Updates', 'Production Updates'])

export const cleanId = (id) => String(id || '').replace(/-/g, '').split('/').pop().slice(-32)

/** A hold is active today when it has started and has not ended (end exclusive). */
const activeOn = (start, end, today) => !!start && start <= today && (!end || end > today)

/**
 * Variation hold — mirrors the Scheduling Tool's /api/notion/holds.
 * v: { type, override, status, requestDate, decisionDate }
 */
export function variationHolds(v, today) {
  const pauses = v.override === 'Pauses' || (!v.override && PAUSE_TYPES.has(v.type))
  if (!pauses || !v.requestDate) return false
  // A decided variation with no Decision Date ends its hold on its last edit (always in the past here).
  if (!v.decisionDate && DECIDED.has(v.status)) return false
  return activeOn(v.requestDate, v.decisionDate, today)
}

/**
 * Stop-work RFI hold — mirrors the Scheduling Tool.
 * r: { stopsWork, status, raised, responded, closed, created }
 */
export function rfiHolds(r, today) {
  if (!r.stopsWork) return false
  const start = r.raised || r.created
  const end = r.responded || r.closed || null
  if (!end && r.status === 'Closed') return false
  return activeOn(start, end, today)
}

/** Open RFI waiting on a supplier. */
export const supplierRfiOpen = (r) => r.tbc === 'Supplier' && (r.status === 'Raise' || r.status === 'Open')

/**
 * Drawing Status from the latest submission.
 * s: { stage, status, grade }
 * Returns null when the submission doesn't map to a status.
 */
export function statusFromSubmission(s) {
  if (!s) return null
  const { stage, status, grade } = s
  if (stage === 'AB') return status === 'Complete' || grade === 'Approved' ? 'Complete' : 'As Built Updates'
  if (status === 'Complete') return 'Complete'
  if (grade === 'QA Rejected') return 'DT Review'
  if (status === 'Submitted' || status === 'Approved' || status === 'Awaiting Issue') return 'DM Review'
  if (status === 'Rejected') return stage === 'PRD' ? 'Production Updates' : 'DT Review'
  if (status === 'Issued') return stage === 'PRD' ? 'In Production' : 'Client Review'
  if (status === 'Schedule') return 'Schedule'
  if (status === 'Graded') return stage === 'A4.5' && grade === 'Approved' ? 'Schedule' : 'Approval Updates'
  return null
}

/** Latest submission: newest Submitted date, then newest created time. */
export function latestSubmission(subs) {
  let best = null
  for (const s of subs || []) {
    const key = [s.submitted || s.created || '', s.created || '']
    if (!best || key[0] > best.key[0] || (key[0] === best.key[0] && key[1] > best.key[1])) best = { s, key }
  }
  return best ? best.s : null
}

/**
 * Drawing Status.
 * d: { current, submissions: [...], rfis: [...] } — rfis linked to this drawing.
 * Returns { status, reason, fromFlow, stage }.
 */
export function drawingStatus(d, today) {
  const rfis = d.rfis || []
  const latest = latestSubmission(d.submissions)
  const base = statusFromSubmission(latest)

  if (rfis.some((r) => rfiHolds(r, today))) return { status: 'On Hold', reason: 'Stop-work RFI open on this drawing', fromFlow: !!base, stage: latest?.stage ?? null, held: true }
  if (latest?.blocked) return { status: 'On Hold', reason: 'Blocked in Drawing Flow', fromFlow: true, stage: latest.stage, held: true }

  if (!base) return { status: d.current || null, reason: 'No Drawing Flow history', fromFlow: false, stage: null }

  const supplierDt = latest && SUPPLIER_TEAM_IDS.has(cleanId(latest.dt))
  if (DESIGN_STAGES.has(base) && (supplierDt || rfis.some(supplierRfiOpen))) {
    return { status: 'With Supplier', reason: supplierDt ? 'Drawn by a supplier' : 'Open RFI with the supplier', fromFlow: true, stage: latest.stage }
  }
  return { status: base, reason: `Latest submission: ${latest.stage} ${latest.status}${latest.grade ? ' (' + latest.grade + ')' : ''}`, fromFlow: true, stage: latest.stage }
}

/** Old Item Status values mapped to the new set (used for items with no Drawing Flow history). */
export function legacyItemStatus(current) {
  switch (current) {
    case 'In Production': return ITEM.PRODUCTION
    case 'On Site': case 'Close Out': case 'Complete': case 'Design Complete': return ITEM.COMPLETE
    case 'In Design': case 'Awaiting Approval': case 'By Others': case 'PC Approved': case 'In Progress': return ITEM.PROGRESS
    case 'Omitted': return ITEM.OMITTED
    default: return ITEM.TODO // Backlog, Set Up, Ongoing, Blocked, To Do, blank
  }
}

/**
 * Item Status.
 * item: { current, dtStart, woRaised }
 * drawings: [{ status, fromFlow, stage, schedProdActual }] — proposed drawing statuses
 * held: boolean (hold rule)
 * Returns { status, reason }.
 */
export function itemStatus(item, drawings, held) {
  if (item.current === ITEM.OMITTED) return { status: ITEM.OMITTED, reason: 'Set by hand' }

  const ds = drawings || []
  const flow = ds.filter((d) => d.fromFlow).length
  const complete = ds.filter((d) => d.status === 'Complete').length
  const prd = ds.some((d) => (d.stage === 'PRD' || d.stage === 'AB') && (d.status === 'In Production' || d.status === 'Complete'))
  const sched = ds.some((d) => !!d.schedProdActual)
  const woSignal = !!item.woRaised || prd || sched
  const evidence = flow > 0 || !!item.woRaised

  let base
  if (!evidence) {
    const mapped = legacyItemStatus(item.current)
    base = mapped === ITEM.TODO && item.dtStart
      ? { status: ITEM.PROGRESS, reason: 'DT has started' }
      : { status: mapped, reason: 'No Drawing Flow history: kept from current status' }
  } else if (woSignal && ds.length > 0 && complete === ds.length) {
    base = { status: ITEM.COMPLETE, reason: 'Works order raised, all drawings complete' }
  } else if (woSignal) {
    base = { status: ITEM.PRODUCTION, reason: item.woRaised ? 'Works order raised' : 'Production issue or schedule date found' }
  } else if (item.dtStart || flow > 0) {
    base = { status: ITEM.PROGRESS, reason: 'Drawing submissions in progress' }
  } else {
    base = { status: ITEM.TODO, reason: 'No work started' }
  }

  // A hold interrupts any stage before Design Complete.
  if (held && base.status !== ITEM.COMPLETE) return { status: ITEM.BLOCKED, reason: 'On hold: open pausing variation or stop-work RFI' }
  return base
}
