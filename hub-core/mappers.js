// Notion page → flattened snapshot row. Pure functions, no SDK import.
// Rows hold plain values only (strings, numbers, booleans, id arrays).

import { HIDDEN_PARTY } from './config.js';

// ── Property readers ─────────────────────────────────────────────────────────
const P = (page, name) => page.properties?.[name];

export function plain(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case 'title':            return prop.title.map(t => t.plain_text).join('').trim() || null;
    case 'rich_text':        return prop.rich_text.map(t => t.plain_text).join('').trim() || null;
    case 'select':           return prop.select?.name ?? null;
    case 'status':           return prop.status?.name ?? null;
    case 'multi_select':     return prop.multi_select.map(o => o.name);
    case 'date':             return prop.date?.start ?? null;
    case 'checkbox':         return !!prop.checkbox;
    case 'number':           return prop.number ?? null;
    case 'url':              return prop.url ?? null;
    case 'email':            return prop.email ?? null;
    case 'relation':         return prop.relation.map(r => r.id);
    case 'people':           return prop.people.map(p => p.name).filter(Boolean);
    case 'unique_id':        return prop.unique_id?.number ?? null;
    case 'created_time':     return prop.created_time ?? null;
    case 'last_edited_time': return prop.last_edited_time ?? null;
    case 'formula': {
      const f = prop.formula;
      if (!f) return null;
      if (f.type === 'date') return f.date?.start ?? null;
      return f[f.type] ?? null;
    }
    case 'rollup': {
      const r = prop.rollup;
      if (!r) return null;
      if (r.type === 'array') return r.array.map(plain).flat().filter(v => v != null);
      if (r.type === 'date') return r.date?.start ?? null;
      return r[r.type] ?? null;
    }
    default: return null;
  }
}

const v = (page, name) => plain(P(page, name));
const ids = (page, name) => v(page, name) || [];
const party = val => (val && HIDDEN_PARTY.test(val) ? 'DM' : val); // "Axiom" never leaves the server
const day = iso => (iso ? iso.slice(0, 10) : null);

// Strictly typed readers for the programme engine's inputs. They read a value
// only when the property has the type the Scheduling Tool reads (a formula or
// roll-up of the same name gives null there, so it gives null here too).
const tDate = (page, name) => day(P(page, name)?.date?.start ?? null);
const tNum = (page, name) => P(page, name)?.number ?? null;
const tCheck = (page, name) => P(page, name)?.checkbox ?? false;
const tMulti = (page, name) => (P(page, name)?.multi_select || []).map(o => o.name);

// Accel property for each engine row key (hub-core/programme/schedule.js ACCEL_PROPS)
const ACCEL = {
  accApprovalIssueDays: 'Accel Approval Issue Days', accS4ReviewDays: 'Accel S4 Review Days',
  accRevisionDays: 'Accel Revision Issue Days', accS5ReviewDays: 'Accel S5 Review Days',
  accConstrIssueDays: 'Accel Construction Issue Days', accQaDays: 'Accel QA Days',
  accC01SignOffDays: 'Accel C01 Sign Off Days', accProdPackDays: 'Accel Production Pack Days',
};

// Programme engine inputs, keyed exactly as the Scheduling Tool's task rows
// (its lib/routes.js GET /api/notion/tasks). Read by hub-core/programme/adapter.js.
function schedInputs(page) {
  return {
    dateOfInstruction: tDate(page, 'Date of Instruction'),
    dtStart1PlanInput: tDate(page, '1st DT Start (Plan)'),
    prodDate: tDate(page, 'Production Date (Plan)'),
    installDate: tDate(page, 'Install Date (Plan)'),
    coordDays: tNum(page, 'Coordination Days'),
    holdDaysManual: tNum(page, 'Hold Days'),
    coordS4Days: tNum(page, 'S4 Coord Days'),
    coordS5Days: tNum(page, 'S5 Coord Days'),
    coordC01Days: tNum(page, 'C01 Coord Days'),
    dd1: tNum(page, 'Draw Days - DD1'),
    constrDrawDays: tNum(page, 'Draw Days - DD-C'),
    ...Object.fromEntries(Object.entries(ACCEL).map(([k, prop]) => [k, tNum(page, prop)])),
    dtStart1Act: tDate(page, '1st DT Start (Actual)'),
    del1Act: tDate(page, '1st DT Delivery (Actual)'),
    dtStart2Act: tDate(page, '2nd DT Start (Actual)'),
    del2Act: tDate(page, '2nd DT Delivery (Actual)'),
    stCActDate: tDate(page, 'Constr. DT Start (Actual)'),
    delCAct: tDate(page, 'Constr. DT Delivery (Actual)'),
    noClientApproval: tCheck(page, 'No Client Approval'),
    programmeDriven: tCheck(page, 'Programme-driven'),
    reissueReason: P(page, 'Reissue Reason')?.select?.name ?? null,
    manualDtStart: tMulti(page, 'Manual DT Start'),
    subAdj1In: tDate(page, '1st Submission Date (Adj)'),
    subAdj2In: tDate(page, '2nd Submission Date (Adj)'),
    subAdjCIn: tDate(page, 'Constr. Submission Date (Adj)'),
    del1AdjIn: tDate(page, '1st DT Delivery (Adj)'),
    st2AdjIn: tDate(page, '2nd DT Start (Adj)'),
    del2AdjIn: tDate(page, '2nd DT Delivery (Adj)'),
    stCAdjIn: tDate(page, 'Constr. DT Start (Adj)'),
    delCAdjIn: tDate(page, 'Constr. DT Delivery (Adj)'),
  };
}

// Project period overrides and squeeze minimums, keyed as the Scheduling Tool's
// project objects (PROJECT_PERIOD_KEYS / MIN_PROJECT_KEYS). Blank = default.
function schedPeriods(page) {
  return {
    approvalDays: tNum(page, 'Approval Days'),
    mobilisationDays: tNum(page, 'DT Mobilisation Days'),
    revisionDays: tNum(page, 'Revision Days'),
    coordinationDays: tNum(page, 'Coordination Days'),
    approvalIssueDays: tNum(page, 'Approval Issue Days'),
    qaDays: tNum(page, 'QA Days'),
    constrIssueDays: tNum(page, 'Construction Issue Days'),
    c01SignOffDays: tNum(page, 'C01 Sign Off Days'),
    productionPackDays: tNum(page, 'Production Pack Days'),
    minApprovalIssueDays: tNum(page, 'Min Approval Issue Days'),
    minRevisionDays: tNum(page, 'Min Revision Days'),
    minConstrIssueDays: tNum(page, 'Min Construction Issue Days'),
    minQaDays: tNum(page, 'Min QA Days'),
  };
}

function base(page) {
  return {
    id: page.id,
    url: page.url,
    createdAt: page.created_time,
    editedAt: page.last_edited_time,
    archived: !!(page.archived || page.in_trash),
  };
}

// ── Per-DB mappers ───────────────────────────────────────────────────────────
export const mappers = {
  tasks: page => ({
    ...base(page),
    title: v(page, 'Item Name'),
    status: v(page, 'Item Status'),
    bic: party(v(page, 'Ball In Court')),
    projectId: ids(page, 'Projects')[0] ?? null,
    dtIds: ids(page, 'Person'),
    priority: v(page, 'Priority'),
    blocker: v(page, 'Blocker') || [],
    blockerNote: v(page, 'Blocker Note'),
    lockStatus: v(page, 'Lock Status'),
    drawingRef: v(page, 'Drawing Ref'),
    holdDays: v(page, 'Hold Days'),
    noClientApproval: v(page, 'No Client Approval'),
    programmeDriven: v(page, 'Programme-driven'),
    reissueReason: v(page, 'Reissue Reason'),
    sched: schedInputs(page),
    // Submission dates exactly as the Scheduling Tool stores them on the Tasks DB
    // (Adj = current forecast / reissue date, Plan = locked baseline). Read by the Timeline.
    prog: {
      s4Adj: day(v(page, '1st Submission Date (Adj)')), s4Plan: day(v(page, '1st Submission Date (Plan)')),
      s5Adj: day(v(page, '2nd Submission Date (Adj)')), s5Plan: day(v(page, '2nd Submission Date (Plan)')),
      conAdj: day(v(page, 'Constr. Submission Date (Adj)')), conPlan: day(v(page, 'Constr. Submission Date (Plan)')),
      // Scheduling Tool acceleration: a shorter review / sign-off for this item (blank = normal)
      s4ReviewDays: v(page, 'Accel S4 Review Days'), s5ReviewDays: v(page, 'Accel S5 Review Days'), signOffDays: v(page, 'Accel C01 Sign Off Days'),
    },
    dates: {
      instruction: day(v(page, 'Date of Instruction')),
      dt1Start: day(v(page, '1st DT Start (Plan)')),
      sub1: day(v(page, '1st Submission Date (Adj)')) || day(v(page, '1st Submission Date (Plan)')),
      sub2: day(v(page, '2nd Submission Date (Adj)')) || day(v(page, '2nd Submission Date (Plan)')),
      constrSub: day(v(page, 'Constr. Submission Date (Adj)')) || day(v(page, 'Constr. Submission Date (Plan)')),
      production: day(v(page, 'Production Date (Actual)')) || day(v(page, 'Production Date (Plan)')),
      install: day(v(page, 'Install Date (Actual)')) || day(v(page, 'Install Date (Plan)')),
      woRaised: day(v(page, 'WO Raised')),
    },
    // DT milestones: planned/adjusted vs actual (read by Brief, Triage and Timeline; never written by the Hub's Cockpit)
    dt: {
      s4Start: day(v(page, '1st DT Start (Plan)')), s4StartAct: day(v(page, '1st DT Start (Actual)')),
      s4Del: day(v(page, '1st DT Delivery (Adj)')) || day(v(page, '1st DT Delivery (Plan)')), s4DelAct: day(v(page, '1st DT Delivery (Actual)')),
      s5Start: day(v(page, '2nd DT Start (Adj)')) || day(v(page, '2nd DT Start (Plan)')), s5StartAct: day(v(page, '2nd DT Start (Actual)')),
      s5Del: day(v(page, '2nd DT Delivery (Adj)')) || day(v(page, '2nd DT Delivery (Plan)')), s5DelAct: day(v(page, '2nd DT Delivery (Actual)')),
      cStart: day(v(page, 'Constr. DT Start (Adj)')) || day(v(page, 'Constr. DT Start (Plan)')), cStartAct: day(v(page, 'Constr. DT Start (Actual)')),
      cDel: day(v(page, 'Constr. DT Delivery (Adj)')) || day(v(page, 'Constr. DT Delivery (Plan)')), cDelAct: day(v(page, 'Constr. DT Delivery (Actual)')),
      productionAct: day(v(page, 'Production Date (Actual)')),
      installAct: day(v(page, 'Install Date (Actual)')),
    },
  }),

  rfis: page => ({
    ...base(page),
    number: v(page, 'RFI Number'),
    title: v(page, 'RFI Description'),
    question: v(page, 'Question'),
    status: v(page, 'RFI Status'),
    tbcBy: party(v(page, 'TBC by')),
    bic: party(v(page, 'Ball in Court')),
    stopsWork: v(page, 'Stops Work'),
    itemIds: ids(page, 'Related Item(s)'),
    raised: day(v(page, 'Date Raised')),
    due: day(v(page, 'Response Due')),
    responded: day(v(page, 'Date Responded')),
    closed: day(v(page, 'Date Closed')),
    answered: !!v(page, 'Response'),
  }),

  variations: page => {
    const n = v(page, 'ID');
    return {
      ...base(page),
      number: n,
      code: n != null ? `VC-${String(n).padStart(4, '0')}` : null,
      title: v(page, 'Variation Description'),
      status: v(page, 'Variation Status'),
      type: v(page, 'Variation Type'),
      raisedBy: party(v(page, 'Raised By')),
      tbcBy: (v(page, 'TBC by') || []).map(party),
      bic: party(v(page, 'Ball in Court')),
      instructed: v(page, 'Instructed Change'),
      itemIds: ids(page, 'Items'),
      requested: day(v(page, 'Change Request Date')),
      decision: day(v(page, 'Decision Date')),
      addedDays: v(page, 'Added Days'),
      pauseOverride: v(page, 'Pause Override'),
    };
  },

  submissions: page => ({
    ...base(page),
    title: v(page, 'Submission'),
    status: v(page, 'Status'),
    stage: v(page, 'Stage'),
    revision: v(page, 'Revision'),
    bic: party(v(page, 'Ball In Court')),
    blocked: v(page, 'Blocked'),
    grade: v(page, 'Client Grade'),
    dmAction: v(page, 'DM Action'),
    itemIds: ids(page, 'Item'),
    drawingIds: ids(page, 'Drawing'),
    dtIds: ids(page, 'DT'),
    submitted: day(v(page, 'Submitted')),
    reviewed: day(v(page, 'Reviewed')),
    issued: day(v(page, 'Issued')),
    qaRound: v(page, 'QA Round'),
    bicSince: day(v(page, 'BIC Since')),
  }),

  drawings: page => ({
    ...base(page),
    title: v(page, 'Drawing Number'),
    title1: v(page, 'Drawing Title 1'),
    name: [v(page, 'Drawing Title 1'), v(page, 'Drawing Title 2'), v(page, 'Drawing Title 3')].filter(Boolean).join(' · ') || null,
    status: v(page, 'Drawing Status'),
    stage: v(page, 'Submission Stage'),
    rev: v(page, 'Rev'),
    type: v(page, 'Dwg No. Assigned'),
    itemIds: ids(page, 'Item'),
    lockStatus: v(page, 'Lock Status'),
    noClientApproval: v(page, 'No Client Approval'),
    // Actuals only. Planned dates come from the Tasks DB, where the Scheduling Tool writes them.
    s4: { submitted: day(v(page, 'S4 Submit Date (Actual)')), status: v(page, 'S4 Status'), statusDate: day(v(page, 'S4 Status Date')) },
    s5: { submitted: day(v(page, 'S5 Submit Date (Actual)')), status: v(page, 'S5 Status'), statusDate: day(v(page, 'S5 Status Date')) },
    c01: { submitted: day(v(page, 'C01 Submit Date (Actual)')), signOff: day(v(page, 'C01 Sign Off')) },
    prd: { status: v(page, 'PRD Status'), statusDate: day(v(page, 'PRD Status Date')), scheduled: day(v(page, 'Schedule Production (Actual)')) },
    holdNotes: v(page, 'Hold Notes'),
  }),

  actions: page => ({
    ...base(page),
    title: v(page, 'Note'),
    type: v(page, 'Type') || 'Action',
    bic: party(v(page, 'Ball in Court')),
    due: day(v(page, 'Due')),
    done: v(page, 'Checked'),
    blocks: v(page, 'Blocks Item'),
    itemIds: ids(page, 'Items'),
    personIds: ids(page, 'Person'),
    category: v(page, 'Category'),
    source: v(page, 'Source'),
    from: v(page, 'From'),
    received: day(v(page, 'Received')),
    log: v(page, 'Response Log'),
    taskIds: ids(page, 'Task'),
  }),

  todo: page => ({
    ...base(page),
    title: v(page, 'Item Description'),
    // Status is the completion flag; Task Done is only a fallback until the
    // backfill has run (npm run backfill:status) and the property is deleted.
    status: v(page, 'Status') || (v(page, 'Task Done') ? 'Done' : 'Not Started'),
    done: (v(page, 'Status') || (v(page, 'Task Done') ? 'Done' : null)) === 'Done',
    itemIds: ids(page, 'Item'),
    personIds: ids(page, 'Person'),
    start: day(v(page, 'Start Date')),
    end: day(v(page, 'End Date (Manual)')),
    number: v(page, 'ID'),
    hours: v(page, 'Task Hours (Est)'),
    changeTask: v(page, 'Change Task'),
    rfiIds: ids(page, 'Related RFI'),
    vcIds: ids(page, 'Related Variation'),
    actionIds: ids(page, 'From Action'),
  }),

  projects: page => ({
    ...base(page),
    title: v(page, 'Project Name'),
    status: v(page, 'Status'),
    clientIds: ids(page, 'Client'),
    ownerIds: ids(page, 'Owner'),
    start: day(v(page, 'Start Date')),
    end: day(v(page, 'End Date')),
    // Scheduling Tool period overrides (blank = the tool's default)
    reviewDays: v(page, 'Approval Days'),
    signOffDays: v(page, 'C01 Sign Off Days'),
    sched: schedPeriods(page),
  }),

  clients: page => ({
    ...base(page),
    title: v(page, 'Company'),
  }),

  activity: page => ({
    ...base(page),
    title: v(page, 'Entry'),
    tag: v(page, 'Tag'),
    source: v(page, 'Source'),
    itemIds: ids(page, 'Task'),
    at: v(page, 'Event Date') || page.created_time,
  }),

  meetings: page => ({
    ...base(page),
    title: v(page, 'Name'),
    itemIds: ids(page, 'Items'),
  }),

  finishes: page => ({
    ...base(page),
    title: v(page, 'CAD Ref'),
    specRefs: v(page, 'Spec Ref') || [],
    approved: v(page, 'APPROVED'),
    actionRequired: v(page, 'Action Required'),
    sampleType: v(page, 'Sample Type'),
    sampleRef: v(page, 'Sample Ref'),
    brand: v(page, 'Brand'),
    productCode: v(page, 'Product Code'),
    supplier: v(page, 'Supplier'),
    materialType: v(page, 'Material Type'),
    faceMaterial: v(page, 'Face Material'),
    finish: v(page, 'Finish'),
    core: v(page, 'Core'),
    matchingPattern: v(page, 'Matching Pattern'),
    sheen: v(page, 'Sheen (%)'),
    lipping: v(page, 'Lipping'),
    finishInfo: v(page, 'Finish Info'),
    fireRating: v(page, 'Fire Rating'),
    submittedOn: day(v(page, 'Submitted on')),
    itemIds: ids(page, 'Items'),
    projectIds: ids(page, 'Project'),
    notes: v(page, 'Notes'),
    comments: v(page, 'Comments'),
  }),

  team: page => ({
    ...base(page),
    title: v(page, 'Name'),
    role: v(page, 'Role'),
    email: v(page, 'Email'),
    capacity: v(page, 'Weekly Capacity (hrs)'),
  }),

  // Programme Dates DB (spec claude/programme-baseline-spec.md §3): one row per item × stage × baseline
  programme: page => ({
    ...base(page),
    title: v(page, 'Name'),
    itemIds: ids(page, 'Item'),
    stage: v(page, 'Stage'),
    current: !!v(page, 'Current'),
    notRequired: !!v(page, 'Not Required'),
    baseline: {
      ref: v(page, 'Baseline Ref'), source: v(page, 'Baseline Source'), issued: day(v(page, 'Baseline Issued')),
      sub: day(v(page, 'Baseline Submission')), appr: day(v(page, 'Baseline Approval')),
      dtDays: v(page, 'Baseline DT Days'), dtStart: day(v(page, 'Baseline DT Start')), dtDel: day(v(page, 'Baseline DT Delivery')),
    },
    dtDays: v(page, 'DT Days'),
    dtDaysUnverified: !!v(page, 'DT Days Unverified'),
    forecast: {
      dtStart: day(v(page, 'Forecast DT Start')), dtDel: day(v(page, 'Forecast DT Delivery')),
      sub: day(v(page, 'Forecast Submission')), appr: day(v(page, 'Forecast Approval')),
    },
    actual: {
      dtStart: day(v(page, 'Actual DT Start')), dtDel: day(v(page, 'Actual DT Delivery')),
      sub: day(v(page, 'Actual Submission')), appr: day(v(page, 'Actual Approval')), grade: v(page, 'Actual Grade'),
    },
    installOverride: day(v(page, 'Install Override')),
    coordDays: v(page, 'Coord Days'),
    accReviewDays: v(page, 'Accel Review Days'),
    accQaDays: v(page, 'Accel QA Days'),
    manualDtStart: !!v(page, 'Manual DT Start'),
    reissueReason: v(page, 'Reissue Reason'),
    variance: v(page, 'Variance (days)'),
    rag: v(page, 'RAG'),
    note: v(page, 'Note'),
    number: v(page, 'Programme ID'),
  }),
};

export function mapPage(db, page) {
  const fn = mappers[db];
  if (!fn) throw new Error(`No mapper for ${db}`);
  return fn(page);
}
