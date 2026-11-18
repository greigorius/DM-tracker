// Notion page builders for tests: Scheduling Tool fixture rows → Notion pages
// (the inverse of its lib/routes.js mapping).
import { ACCEL_PROPS } from '../../hub-core/programme/schedule.js';

// ── Notion property builders ────────────────────────────────────────────────
const date = v => ({ type: 'date', date: v ? { start: v } : null });
const num = v => ({ type: 'number', number: v ?? null });
const check = v => ({ type: 'checkbox', checkbox: !!v });
const select = v => ({ type: 'select', select: v ? { name: v } : null });
const status = v => ({ type: 'status', status: v ? { name: v } : null });
const multi = v => ({ type: 'multi_select', multi_select: (v || []).map(name => ({ name })) });
const title = v => ({ type: 'title', title: v ? [{ plain_text: v }] : [] });
const text = v => ({ type: 'rich_text', rich_text: v ? [{ plain_text: v }] : [] });
const rel = ids => ({ type: 'relation', relation: (ids || []).map(id => ({ id })) });

// Scheduling Tool task row key → Tasks DB property (inverse of its routes.js)
const TASK_PROPS = {
  dateOfInstruction: ['Date of Instruction', date], dtStart1PlanInput: ['1st DT Start (Plan)', date],
  prodDate: ['Production Date (Plan)', date], installDate: ['Install Date (Plan)', date],
  coordDays: ['Coordination Days', num], holdDaysManual: ['Hold Days', num],
  coordS4Days: ['S4 Coord Days', num], coordS5Days: ['S5 Coord Days', num], coordC01Days: ['C01 Coord Days', num],
  dd1: ['Draw Days - DD1', num], constrDrawDays: ['Draw Days - DD-C', num],
  ...Object.fromEntries(Object.entries(ACCEL_PROPS).map(([k, p]) => [k, [p, num]])),
  dtStart1Act: ['1st DT Start (Actual)', date], del1Act: ['1st DT Delivery (Actual)', date],
  dtStart2Act: ['2nd DT Start (Actual)', date], del2Act: ['2nd DT Delivery (Actual)', date],
  stCActDate: ['Constr. DT Start (Actual)', date], delCAct: ['Constr. DT Delivery (Actual)', date],
  noClientApproval: ['No Client Approval', check], programmeDriven: ['Programme-driven', check],
  reissueReason: ['Reissue Reason', select], manualDtStart: ['Manual DT Start', multi],
  subAdj1In: ['1st Submission Date (Adj)', date], subAdj2In: ['2nd Submission Date (Adj)', date],
  subAdjCIn: ['Constr. Submission Date (Adj)', date], del1AdjIn: ['1st DT Delivery (Adj)', date],
  st2AdjIn: ['2nd DT Start (Adj)', date], del2AdjIn: ['2nd DT Delivery (Adj)', date],
  stCAdjIn: ['Constr. DT Start (Adj)', date], delCAdjIn: ['Constr. DT Delivery (Adj)', date],
};

export function taskPage(row, projectId) {
  const properties = { 'Item Name': title(row.name), 'Item Status': status(row.status), Projects: rel([projectId]) };
  for (const [k, [prop, mk]] of Object.entries(TASK_PROPS)) properties[prop] = mk(row[k]);
  return { id: row.pageId, url: `https://notion.so/${row.pageId}`, properties };
}

export function drawingPage(d, itemId) {
  return {
    id: d.id, url: `https://notion.so/${d.id}`,
    properties: {
      'Drawing Number': title(d.no), 'Drawing Title 1': text(d.title || null), Item: rel([itemId]),
      'Dwg No. Assigned': select(d.assigned ?? 'Drawing'), 'No Client Approval': check(d.nca),
      'S4 Submit Date (Actual)': date(d.s4Sub), 'S4 Status': select(d.s4St), 'S4 Status Date': date(d.s4Date),
      'S5 Submit Date (Actual)': date(d.s5Sub), 'S5 Status': select(d.s5St), 'S5 Status Date': date(d.s5Date),
      'C01 Submit Date (Actual)': date(d.cSub), 'C01 Sign Off': date(d.cSo),
    },
  };
}

const PERIOD_PROPS = {
  approvalDays: 'Approval Days', mobilisationDays: 'DT Mobilisation Days', revisionDays: 'Revision Days',
  coordinationDays: 'Coordination Days', approvalIssueDays: 'Approval Issue Days', qaDays: 'QA Days',
  constrIssueDays: 'Construction Issue Days', c01SignOffDays: 'C01 Sign Off Days', productionPackDays: 'Production Pack Days',
  minApprovalIssueDays: 'Min Approval Issue Days', minRevisionDays: 'Min Revision Days',
  minConstrIssueDays: 'Min Construction Issue Days', minQaDays: 'Min QA Days',
};
export function projectPage(id, periods = {}, st = 'In progress') {
  const properties = { 'Project Name': title('P'), Status: status(st) };
  for (const [k, prop] of Object.entries(PERIOD_PROPS)) properties[prop] = num(periods[k]);
  return { id, url: '', properties };
}

