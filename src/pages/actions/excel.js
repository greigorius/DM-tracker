// Excel round trip for the Actions tracker (spec §10.4).
//   exportActions(rows, ctx)  → .xlsx of the current view, with a Hub ID and the
//                               last-change time per row
//   readActions(file, ctx)    → the changes made in the sheet, row by row, with
//                               conflicts (changed in the Hub since the export)
// Only chase fields come back: ball in court, company, contact, due, chase by,
// status, next action, closes when and a new note. Item and project are read-only.
import { AI_STATUSES, TASK_STATUSES } from './model.js';

const SHEET = 'Actions';
const COLS = [
  { key: 'id', header: 'Hub ID (do not edit)', width: 12 },
  { key: 'src', header: 'Source', width: 9 },
  { key: 'ref', header: 'Ref', width: 10 },
  { key: 'projectName', header: 'Project', width: 24 },
  { key: 'itemName', header: 'Item', width: 30 },
  { key: 'title', header: 'Action', width: 50, newOnly: true },
  { key: 'bic', header: 'Ball in court', width: 15, edit: 'Action' },
  { key: 'company', header: 'Company', width: 18, edit: 'Action' },
  { key: 'contact', header: 'Contact', width: 16, edit: 'Action' },
  { key: 'person', header: 'Assignee', width: 16 },
  { key: 'raised', header: 'Raised', width: 12, date: true },
  { key: 'due', header: 'Due', width: 12, date: true, edit: 'both' },
  { key: 'chaseBy', header: 'Chase by', width: 12, date: true, edit: 'Action' },
  { key: 'status', header: 'Status', width: 14, edit: 'both' },
  { key: 'nextAction', header: 'Next action', width: 36, edit: 'Action' },
  { key: 'closesWhen', header: 'Closes when', width: 36, edit: 'Action' },
  { key: 'note', header: 'Add a note', width: 30, edit: 'Action' },
  { key: 'editedAt', header: 'Last change in Hub', width: 18 },
  { key: 'url', header: 'Notion', width: 12 },
];
const LABEL = Object.fromEntries(COLS.map(c => [c.key, c.header]));
const EDIT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4D6' } };
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2933' } };
const EDIT_HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB7791F' } };

const toDate = iso => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`) : null);
const pad = n => String(n).padStart(2, '0');
const fromCell = v => {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return fromCell(v.result);
    if (v.richText) return v.richText.map(t => t.text).join('');
    if ('text' in v) return String(v.text);
    if (v.hyperlink) return String(v.hyperlink);
  }
  return v;
};
const asText = v => { const x = fromCell(v); return x instanceof Date ? isoOf(x) : String(x ?? '').trim(); };
function isoOf(d) { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
function asDate(v) {
  const x = fromCell(v);
  if (x instanceof Date) return isoOf(x);
  const s = String(x ?? '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  if (typeof x === 'number') { const d = new Date(Date.UTC(1899, 11, 30) + x * 864e5); return isoOf(d); } // Excel serial
  return null; // unreadable
}

export async function exportActions(rows, { suppliers, bics, fileName }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Axiom DL Hub';
  const ws = wb.addWorksheet(SHEET, { views: [{ state: 'frozen', ySplit: 1, xSplit: 3 }] });
  ws.columns = COLS.map(c => ({ key: c.key, header: c.header, width: c.width }));
  const head = ws.getRow(1);
  head.height = 30;
  COLS.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = c.edit ? EDIT_HEAD_FILL : HEAD_FILL;
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  for (const r of rows) {
    const row = ws.addRow({
      ...r,
      raised: toDate(r.raised), due: toDate(r.due), chaseBy: toDate(r.chaseBy),
      editedAt: r.editedAt || '', note: '', url: r.url ? { text: 'Open', hyperlink: r.url } : '',
      bic: r.bic || '', company: r.company || '', contact: r.contact || '', person: r.person || '',
      nextAction: r.nextAction || '', closesWhen: r.closesWhen || '', itemName: r.itemName || '', projectName: r.projectName || '',
    });
    COLS.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.date) cell.numFmt = 'dd/mm/yyyy';
      if (c.edit === 'both' || (c.edit === 'Action' && r.src === 'Action')) cell.fill = EDIT_FILL;
      cell.alignment = { vertical: 'top', wrapText: ['title', 'nextAction', 'closesWhen', 'note'].includes(c.key) };
    });
    if (r.closed) row.font = { color: { argb: 'FF8A8F98' } };
  }
  // Drop-down lists
  const lists = wb.addWorksheet('Lists', { state: 'veryHidden' });
  const put = (col, vals) => vals.forEach((v, i) => { lists.getCell(i + 1, col).value = v; });
  put(1, bics); put(2, suppliers.map(s => s.title).filter(Boolean).sort()); put(3, [...AI_STATUSES, ...TASK_STATUSES]);
  const ref = (col, n) => `Lists!$${col}$1:$${col}$${Math.max(1, n)}`;
  const colOf = k => COLS.findIndex(c => c.key === k) + 1;
  const last = rows.length + 200; // room for new rows
  for (let r = 2; r <= last; r++) {
    ws.getCell(r, colOf('bic')).dataValidation = { type: 'list', allowBlank: true, formulae: [ref('A', bics.length)] };
    ws.getCell(r, colOf('company')).dataValidation = { type: 'list', allowBlank: true, formulae: [ref('B', suppliers.length)], showErrorMessage: false };
    ws.getCell(r, colOf('status')).dataValidation = { type: 'list', allowBlank: true, formulae: [ref('C', AI_STATUSES.length + TASK_STATUSES.length)] };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLS.length } };
  const notes = wb.addWorksheet('Read me');
  notes.columns = [{ width: 110 }];
  [
    'Edit the amber columns, then upload this file on the Hub’s Actions page (Reconcile Excel).',
    'Ball in court, Company, Contact, Due, Chase by, Status, Next action, Closes when and Add a note come back to the Hub for actions; Due and Status for DT tasks.',
    'Status “Closed” closes an action. “Add a note” is added to the action’s Response Log with today’s date.',
    'To add a new action, fill in a row with no Hub ID: Action text is required; Project and Item are matched by name.',
    'Don’t change the Hub ID or Last change columns: the Hub uses them to spot rows that changed in the Hub since this export.',
  ].forEach((t, i) => { notes.getCell(i + 1, 1).value = t; });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Read an exported sheet back. Returns { changes, creates, problems }.
 *   changes: [{ rec, fields: [{ key, label, from, to }], set, chase, conflict }]
 *   creates: [{ title, projectName, itemName, itemId, body }]
 */
export async function readActions(file, { rows, suppliers, tasks, projects, bics }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet(SHEET) || wb.worksheets[0];
  if (!ws) throw new Error('No worksheet in that file');
  const col = {};
  ws.getRow(1).eachCell((cell, i) => {
    const h = asText(cell.value);
    const c = COLS.find(x => x.header.toLowerCase() === h.toLowerCase());
    if (c) col[c.key] = i;
  });
  if (!col.id || !col.title) throw new Error('This doesn’t look like an Actions export: the Hub ID and Action columns are missing');

  const byId = new Map(rows.map(r => [r.id, r]));
  const supByName = new Map(suppliers.map(s => [(s.title || '').trim().toLowerCase(), s]));
  const bicSet = new Set(bics);
  const changes = [], creates = [], problems = [];
  const get = (row, k) => (col[k] ? row.getCell(col[k]).value : null);

  ws.eachRow((row, n) => {
    if (n === 1) return;
    const id = asText(get(row, 'id'));
    const title = asText(get(row, 'title'));
    if (!id && !title) return;
    const where = `Row ${n}`;

    // New action
    if (!id) {
      const projectName = asText(get(row, 'projectName')), itemName = asText(get(row, 'itemName'));
      const proj = projects.find(p => (p.title || '').toLowerCase() === projectName.toLowerCase());
      const item = itemName && tasks.find(t => !t.archived && (t.title || '').toLowerCase() === itemName.toLowerCase() && (!proj || t.projectId === proj.id));
      const bic = asText(get(row, 'bic')) || 'DM';
      const company = asText(get(row, 'company'));
      const sup = company ? supByName.get(company.toLowerCase()) : null;
      const due = asDate(get(row, 'due'));
      const notes = [];
      if (itemName && !item) notes.push(`item “${itemName}” not found, so it will land in the Triage inbox`);
      if (company && !sup) notes.push(`company “${company}” isn’t in the Suppliers DB, so it’s left blank`);
      if (!bicSet.has(bic)) notes.push(`ball in court “${bic}” isn’t a Hub value; DM used`);
      creates.push({
        where, title, projectName, itemName: item?.title || null, notes,
        body: {
          type: 'Action', text: title, itemId: item?.id || null, bic: bicSet.has(bic) ? bic : 'DM', companyId: sup?.id || null,
          contact: asText(get(row, 'contact')) || null, due: due || null,
          nextAction: asText(get(row, 'nextAction')) || null, closesWhen: asText(get(row, 'closesWhen')) || null,
          chaseStatus: AI_STATUSES.includes(asText(get(row, 'status'))) && asText(get(row, 'status')) !== 'Closed' ? asText(get(row, 'status')) : 'Open',
        },
      });
      return;
    }

    const rec = byId.get(id);
    if (!rec) { problems.push(`${where}: “${title || id}” is no longer in the Hub (closed long ago or deleted), skipped`); return; }
    const fields = [], set = {};
    let chase = null;
    const diff = (key, to, from, apply) => {
      if ((to || '') === (from || '')) return;
      fields.push({ key, label: LABEL[key], from: from || '—', to: to || '—' });
      Object.assign(set, apply);
    };
    const isAction = rec.src === 'Action';

    const due = asDate(get(row, 'due'));
    if (due === null) problems.push(`${where}: Due “${asText(get(row, 'due'))}” isn’t a date, skipped`);
    else diff('due', due, rec.due, isAction ? { due: due || null } : { end: due || null });

    const status = asText(get(row, 'status'));
    if (status && status !== rec.status) {
      if (isAction && AI_STATUSES.includes(status)) {
        diff('status', status, rec.status, status === 'Closed' ? { done: true } : { chaseStatus: status, ...(rec.closed && { done: false }) });
      } else if (!isAction && TASK_STATUSES.includes(status)) {
        diff('status', status, rec.status, { status });
      } else if (status !== 'Moved to Tasks') problems.push(`${where}: status “${status}” isn’t valid for ${isAction ? 'an action' : 'a task'}, skipped`);
    }

    if (isAction) {
      const bic = asText(get(row, 'bic'));
      if (bic && !bicSet.has(bic)) problems.push(`${where}: ball in court “${bic}” isn’t a Hub value, skipped`);
      else diff('bic', bic, rec.bic, { bic: bic || null });
      const company = asText(get(row, 'company'));
      const sup = company ? supByName.get(company.toLowerCase()) : null;
      if (company && !sup) problems.push(`${where}: company “${company}” isn’t in the Suppliers DB, skipped (add it in Notion first)`);
      else diff('company', sup?.title || '', rec.company, { companyId: sup?.id || null });
      diff('contact', asText(get(row, 'contact')), rec.contact, { contact: asText(get(row, 'contact')) || null });
      const chaseBy = asDate(get(row, 'chaseBy'));
      if (chaseBy === null) problems.push(`${where}: Chase by isn’t a date, skipped`);
      else diff('chaseBy', chaseBy, rec.chaseBy, { chaseBy: chaseBy || null });
      diff('nextAction', asText(get(row, 'nextAction')), rec.nextAction, { nextAction: asText(get(row, 'nextAction')) || null });
      diff('closesWhen', asText(get(row, 'closesWhen')), rec.closesWhen, { closesWhen: asText(get(row, 'closesWhen')) || null });
      const note = asText(get(row, 'note'));
      if (note) { chase = note; fields.push({ key: 'note', label: LABEL.note, from: '', to: note }); }
    }
    if (!fields.length) return;
    const exported = asText(get(row, 'editedAt'));
    const conflict = !!(exported && rec.editedAt && rec.editedAt > exported);
    changes.push({ where, rec, fields, set, chase, conflict });
  });
  return { changes, creates, problems };
}
