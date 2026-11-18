// ─────────────────────────────────────────────────────────────────────────────
// GANTT EXPORT — Excel workbook built in the browser with ExcelJS
//
// Sheet "Gantt": one row per item, weekly columns (week commencing Monday).
// Each issue is drawn as its client review — submission → approval:
//   S4 / S5           submission → S4 / S5 status date
//   A4.5              submission → C01 sign off
//   PRD               (No Client Approval) submission only — no approval
//   ◆ Production date
// Every date is the recorded Actual where one exists, else the Adj date.
// Solid = recorded actual, hatched = forecast (Adj). A stage with a reissue
// pending shows the closed cycle's actual bar AND the reissue's forecast bar.
// Stages with no date are skipped. The current week is outlined in red.
// Sheet "Data": the full tabular export (same columns as before).
// ExcelJS is loaded on demand so it isn't in the main app bundle.
// ─────────────────────────────────────────────────────────────────────────────
import { ISSUE_STAGES, stageLabel, toDate } from './schedule.js';

const COLOURS = { s4: { solid: 'FF3B82F6', dark: 'FF1E40AF' },
                  s5: { solid: 'FF8B5CF6', dark: 'FF5B21B6' },
                  c01:{ solid: 'FFF97316', dark: 'FF9A3412' } };
// Adj (calcRow) keys for each stage's submission and approval
const ADJ_KEYS = { s4: ['sub1A', 's4A'], s5: ['sub2A', 's5A'], c01: ['subCA', 'c01SignOffAdj'] };
const PROD_FONT   = 'FFDC2626';
const TODAY_EDGE  = 'FFDC2626';
const HEAD_FILL   = 'FF1F2937';
const HEAD_FONT   = 'FFFFFFFF';
const GRID        = 'FFE5E7EB';
const FORECAST_FONT = 'FF6B7280';
const TARGET_FONT   = 'FF6B7280';   // subtitle grey (release export)
const MAX_WEEKS   = 156;            // 3 years of weekly columns at most
const DAY = 864e5;

const fill  = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const hatch = argb => ({ type: 'pattern', pattern: 'lightUp', fgColor: { argb }, bgColor: { argb: 'FFFFFFFF' } });
// Local calendar date → UTC midnight (Excel stores dates without a time zone)
const xl = d => (d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) : null);
const asDate = v => toDate(v);   // local noon, no UTC drift
const monday = d => { const m = new Date(d); m.setHours(12, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; };
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * The bars for one item. Pure — tested in lib/schedule.test.js.
 * @param {object} row  Tasks row (for recorded actuals and the NCA flag)
 * @param {object} c    calcRow(row, project)
 * @returns {{ bars: Array<{key,label,sub:{date,actual},appr:{date,actual}|null,cycle}>, cols: object, prod: Date|null }}
 *   cols: per stage { sub, appr } — the dates shown in the table columns (current cycle)
 */
export function ganttBars(row, c) {
  const nca = !!(row?.noClientApproval ?? c?.nca);
  const bars = [], cols = {};
  const pt = (date, actual) => (date ? { date, actual } : null);
  for (const sd of ISSUE_STAGES) {
    if (nca && sd.ncaSkip) continue;
    const label = stageLabel(sd, nca);
    const st = c?.stages?.[sd.key] || {};
    const [subK, apprK] = ADJ_KEYS[sd.key];
    const subAct  = asDate(row?.[sd.subAct]);
    let   apprAct = asDate(row?.[sd.apprAct]);
    if (apprAct && subAct && apprAct < subAct) apprAct = null;   // status from an earlier issue
    const subAdj = asDate(c?.[subK]), apprAdj = asDate(c?.[apprK]);
    const noAppr = sd.key === 'c01' && nca;                      // PRD: submission only
    const reopened = st.state === 'pending' || st.state === 'required' || st.state === 'superseded';
    if (reopened && subAct) {
      // Closed cycle: what actually happened
      bars.push({ key: sd.key, label, cycle: 'closed', sub: pt(subAct, true), appr: noAppr ? null : pt(apprAct, true) });
    }
    const sub  = reopened ? pt(subAdj, false) : (subAct ? pt(subAct, true) : pt(subAdj, false));
    const appr = noAppr ? null
               : reopened ? pt(apprAdj, false) : (apprAct ? pt(apprAct, true) : pt(apprAdj, false));
    cols[sd.key] = { sub, appr };
    if (!sub) continue;                                         // no date → no bar
    bars.push({ key: sd.key, label: reopened ? `${label} reissue` : label, cycle: reopened ? 'reissue' : 'current',
      sub, appr: appr && appr.date >= sub.date ? appr : null });
  }
  return { bars, cols, prod: asDate(c?.prodDateAdj), nca };
}

/**
 * @param {object}   o
 * @param {string}   o.projectName
 * @param {Array<{name:string,status:string,row:object,c:object}>} o.items  Tasks row + calcRow output per item
 * @param {Array<object>} o.data      rows for the Data sheet (column → value)
 * @param {string}   o.fileName
 */
export async function exportGanttWorkbook({ projectName, items, data, fileName }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Axiom Schedule';
  wb.created = new Date();

  const today = asDate(new Date());
  const thisWeek = monday(today);

  // ── Timeline extent ────────────────────────────────────────────────────────
  let lo = null, hi = null;
  const bump = d => { if (!d) return; if (!lo || d < lo) lo = d; if (!hi || d > hi) hi = d; };
  const rows = items.map(it => {
    const g = ganttBars(it.row || {}, it.c || {});
    for (const b of g.bars) { bump(b.sub?.date); bump(b.appr?.date); }
    bump(g.prod);
    return { ...it, c: it.c || {}, ...g };
  });
  if (!lo) { lo = today; hi = today; }
  const firstWk = monday(lo);
  let weeks = Math.floor((monday(hi) - firstWk) / (7 * DAY)) + 1;
  weeks = Math.min(Math.max(weeks, 1), MAX_WEEKS);
  const wkStart = i => new Date(firstWk.getTime() + i * 7 * DAY);
  const weekIndex = d => Math.floor((monday(d) - firstWk) / (7 * DAY));

  // ── Gantt sheet ────────────────────────────────────────────────────────────
  const ws = wb.addWorksheet('Gantt', { views: [{ state: 'frozen', xSplit: 10, ySplit: 4 }] });
  const col = (k, w) => g => g.cols[k]?.[w] || null;
  const fixed = [
    { h: 'Item',               w: 42 },
    { h: 'Status',             w: 16 },
    { h: 'S4 Submission',      w: 10, v: col('s4', 'sub') },
    { h: 'S4 Approval',        w: 10, v: col('s4', 'appr') },
    { h: 'S5 Submission',      w: 10, v: col('s5', 'sub') },
    { h: 'S5 Approval',        w: 10, v: col('s5', 'appr') },
    { h: 'A4.5 / PRD Submission', w: 11, v: col('c01', 'sub') },
    { h: 'A4.5 Sign Off',      w: 10, v: col('c01', 'appr') },
    { h: 'Production',         w: 10, v: g => (g.prod ? { date: g.prod, actual: false } : null) },
    { h: 'Float (days)',       w: 8 },
  ];
  const G0 = fixed.length + 1;                       // first week column (1-based)
  fixed.forEach((f, i) => { ws.getColumn(i + 1).width = f.w; });
  for (let i = 0; i < weeks; i++) ws.getColumn(G0 + i).width = 3.4;

  // Row 1 — title (left) and legend (over the timeline)
  ws.mergeCells(1, 1, 1, 4);
  ws.getCell(1, 1).value = `${projectName} — Adjusted programme`;
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.mergeCells(1, 5, 1, 9);
  ws.getCell(1, 5).value = `Exported ${today.getDate()} ${MONTHS[today.getMonth()]} ${today.getFullYear()}  ·  bars = client review (submission → approval)  ·  solid = recorded actual  ·  hatched = forecast (Adj)`;
  ws.getCell(1, 5).font = { size: 9, italic: true, color: { argb: FORECAST_FONT } };
  ws.getRow(1).height = 20;
  let lc = G0;
  const legend = (f, text, glyph, glyphColour) => {
    if (lc + 5 > G0 + weeks - 1) return;            // not enough timeline width (key also sits under the table)
    const sw = ws.getCell(1, lc); if (f) sw.fill = f;
    if (glyph) { sw.value = glyph; sw.font = { color: { argb: glyphColour }, bold: true, size: 9 }; sw.alignment = { horizontal: 'center' }; }
    ws.mergeCells(1, lc + 1, 1, lc + 5);
    const t = ws.getCell(1, lc + 1); t.value = text; t.font = { size: 9 }; t.alignment = { vertical: 'middle' };
    lc += 7;
  };
  legend(fill(COLOURS.s4.solid), 'S4');
  legend(fill(COLOURS.s5.solid), 'S5');
  legend(fill(COLOURS.c01.solid), 'A4.5 / PRD');
  legend(hatch(COLOURS.s4.dark), 'Forecast');
  legend(null, 'Production', '◆', PROD_FONT);

  // Rows 2–4 — headers
  const headRow = 4;
  fixed.forEach((f, i) => {
    ws.mergeCells(2, i + 1, headRow, i + 1);
    const cell = ws.getCell(2, i + 1);           // merged range keeps the top-left value
    cell.value = f.h; cell.font = { bold: true, color: { argb: HEAD_FONT }, size: 9 };
    cell.fill = fill(HEAD_FILL); cell.alignment = { vertical: 'bottom', wrapText: true };
  });
  // Months (row 2); day numbers (row 4)
  let mStart = 0;
  for (let i = 0; i <= weeks; i++) {
    const d = i < weeks ? wkStart(i) : null;
    const prev = wkStart(mStart);
    if (i === weeks || d.getMonth() !== prev.getMonth()) {
      const c0 = G0 + mStart, c1 = G0 + i - 1;
      if (c1 > c0) ws.mergeCells(2, c0, 2, c1);
      const mc = ws.getCell(2, c0);
      mc.value = `${MONTHS[prev.getMonth()]} ${String(prev.getFullYear()).slice(2)}`;
      mc.font = { bold: true, size: 9, color: { argb: HEAD_FONT } };
      mc.alignment = { horizontal: 'center' };
      mStart = i;
    }
  }
  for (let i = 0; i < weeks; i++) {
    const d = wkStart(i);
    const m = ws.getCell(2, G0 + i); m.fill = fill(HEAD_FILL);
    const w = ws.getCell(3, G0 + i); w.value = 'w/c'; w.font = { size: 7, color: { argb: 'FF9CA3AF' } }; w.fill = fill(HEAD_FILL); w.alignment = { horizontal: 'center' };
    const n = ws.getCell(headRow, G0 + i);
    n.value = d.getDate(); n.font = { size: 8, color: { argb: HEAD_FONT }, bold: +d === +thisWeek };
    n.fill = fill(+d === +thisWeek ? TODAY_EDGE : HEAD_FILL);
    n.alignment = { horizontal: 'center' };
  }
  ws.getRow(headRow).height = 30;

  // Item rows
  const todayIdx = weekIndex(today);
  rows.forEach((r, ri) => {
    const rn = headRow + 1 + ri;
    const row = ws.getRow(rn);
    row.height = 16;
    ws.getCell(rn, 1).value = r.name;
    ws.getCell(rn, 2).value = r.status || '';
    fixed.forEach((f, i) => {
      if (!f.v) return;
      const p = f.v(r);
      const cell = ws.getCell(rn, i + 1);
      cell.value = p ? xl(p.date) : null;
      cell.numFmt = 'dd-mmm-yy';
      cell.font = p && !p.actual ? { italic: true, color: { argb: FORECAST_FONT } } : { bold: !!p };
    });
    const fl = ws.getCell(rn, 10);
    fl.value = r.c.floatDays ?? null;
    if (r.c.floatDays != null && r.c.floatDays < 0) fl.font = { color: { argb: PROD_FONT }, bold: true };
    for (let c = 1; c <= fixed.length; c++) {
      ws.getCell(rn, c).font = { ...(ws.getCell(rn, c).font || {}), size: 9 };
      ws.getCell(rn, c).border = { bottom: { style: 'thin', color: { argb: GRID } } };
    }

    // Grid first, then bars (closed cycles first so the reissue/current bar wins a shared week)
    for (let i = 0; i < weeks; i++) {
      const border = { bottom: { style: 'thin', color: { argb: GRID } }, right: { style: 'hair', color: { argb: GRID } } };
      if (i === todayIdx) { border.left = { style: 'thin', color: { argb: TODAY_EDGE } }; border.right = { style: 'thin', color: { argb: TODAY_EDGE } }; }
      ws.getCell(rn, G0 + i).border = border;
    }
    const inRange = i => i >= 0 && i < weeks;
    for (const b of r.bars) {
      const k = COLOURS[b.key];
      const i0 = weekIndex(b.sub.date), i1 = b.appr ? weekIndex(b.appr.date) : i0;
      const solidAll = b.sub.actual && (!b.appr || b.appr.actual);
      for (let i = Math.max(0, i0); i <= Math.min(weeks - 1, i1); i++) {
        const solid = solidAll || (i === i0 && b.sub.actual) || (b.appr && i === i1 && b.appr.actual);
        ws.getCell(rn, G0 + i).fill = solid ? fill(k.solid) : hatch(k.solid);
      }
      if (inRange(i0)) {
        const lab = ws.getCell(rn, G0 + i0);
        lab.value = b.label;
        lab.font = { size: 8, bold: true, color: { argb: b.sub.actual ? 'FFFFFFFF' : k.dark } };
        lab.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    }
    if (r.prod && inRange(weekIndex(r.prod))) {
      const cell = ws.getCell(rn, G0 + weekIndex(r.prod));
      cell.value = '◆'; cell.font = { color: { argb: PROD_FONT }, bold: true, size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  });
  // Key under the table (always fits, whatever the timeline length)
  const keyRow = headRow + rows.length + 2;
  ws.getCell(keyRow, 1).value = 'Key'; ws.getCell(keyRow, 1).font = { bold: true, size: 9 };
  [
    [fill(COLOURS.s4.solid),  'S4 client review — submission → S4 status (recorded actual)'],
    [fill(COLOURS.s5.solid),  'S5 client review — submission → S5 status (recorded actual)'],
    [fill(COLOURS.c01.solid), 'A4.5 — submission → C01 sign off; PRD (no client approval) — submission only'],
    [hatch(COLOURS.s5.solid), 'Hatched = forecast (Adj date); a reissue shows its old actual bar and the forecast "reissue" bar'],
    [null, 'Production date', '◆'],
    [null, 'Table dates: bold = recorded actual, grey italic = forecast (Adj)'],
  ].forEach(([f, text, glyph], i) => {
    const r = keyRow + 1 + i;
    const sw = ws.getCell(r, 3);
    if (f) sw.fill = f;
    if (glyph) { sw.value = glyph; sw.alignment = { horizontal: 'center' }; sw.font = { bold: true, size: 10, color: { argb: PROD_FONT } }; }
    ws.mergeCells(r, 4, r, 9);
    ws.getCell(r, 4).value = text; ws.getCell(r, 4).font = { size: 9 };
  });

  ws.autoFilter = { from: { row: headRow, column: 1 }, to: { row: headRow, column: fixed.length } };
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 8 /* A3 */ };
  ws.pageSetup.printTitlesRow = `2:${headRow}`;

  // ── Data sheet ─────────────────────────────────────────────────────────────
  const ds = wb.addWorksheet('Data', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  if (data.length) {
    const cols = Object.keys(data[0]);
    ds.columns = cols.map(k => ({ header: k, key: k, width: Math.max(10, Math.min(40, k.length + 2)) }));
    data.forEach(d => ds.addRow(d));
    ds.getRow(1).font = { bold: true };
    ds.getColumn(1).width = 42;
  }

  // ── Download ───────────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ─────────────────────────────────────────────────────────────────────────────
// RELEASE SCHEDULE EXPORT — the Release tab as a single sheet.
// Dates are real Excel dates (adjusted). Fill shows the state:
//   green = all drawings submitted, amber = in progress (n/N in the next cell),
//   lavender = forecast, grey "N/A" = stage skipped (No Client Approval).
// ─────────────────────────────────────────────────────────────────────────────
const REL_FILL = { done: 'FFDCFCE7', progress: 'FFFEF3C7', forecast: 'FFEDE9FE', reissue: 'FFFCE7F3' };
const REL_FONT = { reissue: 'FF9D174D', done: 'FF166534', progress: 'FF92400E', forecast: 'FF5B21B6', na: 'FF9CA3AF', none: 'FF9CA3AF' };

/**
 * @param {object} o
 * @param {string} o.projectName
 * @param {Array}  o.rows      releaseRow() output per item
 * @param {Array}  o.stages    RELEASE_STAGES
 * @param {string} o.fileName
 */
export async function exportReleaseWorkbook({ projectName, rows, stages, fileName }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Axiom Schedule';
  wb.created = new Date();
  const ws = wb.addWorksheet('Release Schedule', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] });

  // Columns: Item | First Dwg No. | Dwgs | (date, n/N) per stage
  const cols = [{ width: 46 }, { width: 30 }, { width: 7 }];
  stages.forEach(() => { cols.push({ width: 13 }, { width: 7 }); });
  ws.columns = cols;
  const lastCol = cols.length;

  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = `${projectName} — Drawing Release Schedule`;
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell(2, 1).value = `Adjusted submission dates · exported ${new Date().toLocaleDateString('en-GB')}`;
  ws.getCell(2, 1).font = { size: 9, color: { argb: TARGET_FONT } };

  const head = ws.getRow(3);
  const headVals = ['Item', 'First Dwg No.', 'Dwgs'];
  stages.forEach(st => headVals.push(st.label, ''));
  head.values = headVals;
  stages.forEach((st, i) => ws.mergeCells(3, 4 + i * 2, 3, 5 + i * 2));
  head.eachCell(c => {
    c.fill = fill(HEAD_FILL);
    c.font = { bold: true, color: { argb: HEAD_FONT }, size: 10 };
    c.alignment = { vertical: 'middle', horizontal: c.col <= 2 ? 'left' : 'center' };
  });
  head.height = 20;

  const edge = { style: 'thin', color: { argb: GRID } };
  rows.forEach((r, i) => {
    const xr = ws.getRow(4 + i);
    xr.getCell(1).value = r.name;
    xr.getCell(2).value = r.dwgFirst || '—';
    xr.getCell(3).value = r.dwgCount || 0;
    xr.getCell(3).alignment = { horizontal: 'center' };
    if (!r.dwgFirst) xr.getCell(2).font = { color: { argb: REL_FONT.none } };
    stages.forEach((st, si) => {
      const s = r.stages[st.key];
      const dc = xr.getCell(4 + si * 2), pc = xr.getCell(5 + si * 2);
      if (s.state === 'na') dc.value = 'N/A';
      else if (s.date) { dc.value = xl(asDate(s.date)); dc.numFmt = 'dd-mmm-yy'; }
      else dc.value = '—';
      if (s.state === 'progress') pc.value = `${s.done}/${s.n}`;
      if (s.state === 'reissue') pc.value = 'Reissue';
      else if (st.key === 'c01' && !pc.value && s.state !== 'none') pc.value = r.constrType;
      dc.alignment = { horizontal: 'center' };
      pc.alignment = { horizontal: 'center' };
      const f = REL_FILL[s.state];
      if (f) { dc.fill = fill(f); pc.fill = fill(f); }
      dc.font = { color: { argb: REL_FONT[s.state] }, bold: s.state === 'done' };
      pc.font = { size: 9, color: { argb: REL_FONT[s.state] } };
    });
    for (let c = 1; c <= lastCol; c++) xr.getCell(c).border = { top: edge, bottom: edge, left: edge, right: edge };
  });

  // Key
  const keyRow = 4 + rows.length + 1;
  ws.getCell(keyRow, 1).value = 'Key'; ws.getCell(keyRow, 1).font = { bold: true, size: 9 };
  [['done', 'Submitted — all drawings (Dwg No. Assigned = Drawing)'],
   ['progress', 'In progress — adjusted forecast for the rest, n/N submitted'],
   ['forecast', 'Forecast — adjusted'],
   ['reissue', 'Reissue pending — next issue date'],
   ['na', 'N/A — no client approval stage']].forEach(([k, text], i) => {
    const sw = ws.getCell(keyRow + 1 + i, 1);
    sw.value = text;
    sw.font = { size: 9, color: { argb: REL_FONT[k] } };
    if (REL_FILL[k]) sw.fill = fill(REL_FILL[k]);
  });

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + rows.length, column: 3 } };
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 /* A4 */ };
  ws.pageSetup.printTitlesRow = '3:3';

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
