// Excel export of the collapsed Timeline: one row per item, no drawing rows.
// Loaded on demand (ExcelJS is large) and styled to the Hub tokens.

import ExcelJS from 'exceljs';

const T = {
  surface: 'FF16181B', bar: 'FF121316', text: 'FFE8E6E1', text2: 'FFB7BAC0', muted: 'FF9A9DA3',
  line: 'FF3A3E45', danger: 'FFF06A5A', accent: 'FFF2A33A', ok: 'FF5CC08A',
};
const GRADE_FONT = { A: T.ok, Approved: T.ok, B: T.accent, C: T.danger, Rejected: T.danger };

// ISO date → Excel date (UTC midnight so it never shifts a day).
const xlDate = iso => (iso ? new Date(`${iso}T00:00:00Z`) : null);

function subValue(c, na) {
  if (na) return { value: null, note: 'N/A' };
  if (!c) return { value: null };
  return {
    value: xlDate(c.date),
    planned: c.kind === 'plan',
    late: c.late > 0,
    note: [c.reissue && 'Reissue pending', c.total && c.issued < c.total && `${c.issued}/${c.total} issued`, c.late > 0 && `${c.late} days late`, c.kind === 'plan' && !c.date && 'No forecast'].filter(Boolean).join(' · '),
  };
}

function retValue(c, na) {
  if (na) return { value: null, status: 'N/A' };
  if (!c) return { value: null, status: null };
  if (c.kind === 'act') return { value: xlDate(c.date), status: c.grade || 'Returned' };
  return {
    value: xlDate(c.date), planned: true, late: c.late > 0,
    status: [c.awaiting && 'Awaiting', c.awaiting && c.total > 1 && `${c.back}/${c.total} back`, 'Forecast', c.late > 0 && `${c.late} days late`, !c.date && 'No forecast'].filter(Boolean).join(' · '),
  };
}

export async function exportTimelineXlsx({ rows, stages, today, team, projects, filename, grouped }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Axiom DL Hub';
  wb.created = new Date();
  const ws = wb.addWorksheet('Timeline', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });

  const fixed = [
    ...(grouped ? [{ header: 'Project', width: 26 }] : []),
    { header: 'Item Name', width: 44 },
    { header: 'First Drawing', width: 28 },
    { header: 'Drawings', width: 10 },
    { header: 'DT', width: 18 },
    { header: 'Drawn by', width: 22 },
    { header: 'Ball in Court', width: 14 },
  ];
  const perStage = [
    { header: 'Submitted', width: 13 }, { header: 'Submitted note', width: 20 },
    { header: 'Comments / status date', width: 14 }, { header: 'Status', width: 20 },
  ];
  ws.columns = [...fixed, ...stages.flatMap(() => perStage)].map(c => ({ width: c.width }));

  // Header row 1: stage groups merged across their columns. Row 2: column names.
  const r1 = ws.getRow(1);
  const r2 = ws.getRow(2);
  fixed.forEach((c, i) => { r2.getCell(i + 1).value = c.header; });
  stages.forEach((s, si) => {
    const start = fixed.length + si * perStage.length + 1;
    r1.getCell(start).value = `${s.key === 'con' ? 'A4.5 / PRD' : s.code} · ${s.name}`;
    ws.mergeCells(1, start, 1, start + perStage.length - 1);
    perStage.forEach((c, i) => { r2.getCell(start + i).value = c.header; });
  });
  const lastCol = fixed.length + stages.length * perStage.length;
  for (const row of [r1, r2]) {
    row.height = 22;
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: row === r1 ? T.bar : T.surface } };
      cell.font = { name: 'Calibri', size: row === r1 ? 11 : 10, bold: row === r1, color: { argb: row === r1 ? T.text : T.text2 } };
      cell.alignment = { vertical: 'middle' };
      cell.border = { bottom: { style: 'thin', color: { argb: T.line } } };
    }
  }

  for (const r of rows) {
    const vals = [
      ...(grouped ? [projects.get(r.projectId)?.title || ''] : []),
      r.title, r.first, r.count,
      r.dtIds.map(id => team.get(id)).filter(Boolean).join(', '),
      (r.drawnBy || []).map(id => team.get(id)).filter(Boolean).join(', '),
      r.bic || '',
    ];
    const styles = [];
    for (const s of stages) {
      const sub = subValue(r.stages[s.key].sub, r.stages[s.key].na);
      const ret = retValue(r.stages[s.key].ret, r.stages[s.key].na);
      vals.push(sub.value, sub.note || null, ret.value, ret.status || (s.key === 'con' && r.stages.con.sub ? (r.prd ? 'PRD' : 'A4.5') : null));
      styles.push(sub, null, ret, ret);
    }
    const row = ws.addRow(vals);
    row.alignment = { vertical: 'top', wrapText: true };
    styles.forEach((st, i) => {
      const cell = row.getCell(fixed.length + i + 1);
      if (cell.value instanceof Date) cell.numFmt = 'dd mmm yyyy';
      if (!st) { cell.font = { color: { argb: 'FF5A5E66' }, size: 10 }; return; }
      const isStatus = (i % perStage.length) === 3;
      const color = isStatus && GRADE_FONT[cell.value] ? GRADE_FONT[cell.value] : st.late ? T.danger : st.planned ? 'FF6B6F76' : undefined;
      cell.font = { italic: !!st.planned && !isStatus, bold: isStatus && !!GRADE_FONT[cell.value], ...(color && { color: { argb: color } }) };
    });
  }

  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: lastCol } };
  ws.headerFooter.oddFooter = `&L&8Axiom DL Hub · Timeline · exported ${today}&R&8Page &P of &N`;
  ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:2' };

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
