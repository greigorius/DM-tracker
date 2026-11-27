// Register views: the field catalogue model, filter operators, grouping and
// export shared by every register page (Drawings, RFIs, Variations, Finishes).
//
// A field:  { key, label, type, get(r, ctx), render?, csv?, width?, filter?: false, group?: false }
//   type: 'text' | 'select' | 'date' | 'number' | 'bool'
//   get() returns the raw value used for filters, sorting, grouping and export
//   (select fields may return an array: "is any of" matches any element).
// A view:   { id, name, project, statusMode, statuses, q, columns, filters, match, sort, group }

export const OPS = {
  text: [['contains', 'contains'], ['not_contains', 'does not contain'], ['is', 'is'], ['is_not', 'is not'], ['empty', 'is empty'], ['not_empty', 'is not empty']],
  select: [['any', 'is any of'], ['none', 'is none of'], ['empty', 'is empty'], ['not_empty', 'is not empty']],
  date: [['on', 'is on'], ['before', 'is before'], ['after', 'is after'], ['on_or_before', 'is on or before'], ['on_or_after', 'is on or after'],
    ['between', 'is between'], ['last_n', 'in the last … days'], ['next_n', 'in the next … days'], ['past', 'is before today'], ['future', 'is today or later'],
    ['this_week', 'is this week'], ['empty', 'is empty'], ['not_empty', 'is not empty']],
  number: [['eq', '='], ['ne', '≠'], ['gt', '>'], ['lt', '<'], ['gte', '≥'], ['lte', '≤'], ['empty', 'is empty'], ['not_empty', 'is not empty']],
  bool: [['true', 'is ticked'], ['false', 'is not ticked']],
};
export const NO_VALUE = new Set(['empty', 'not_empty', 'past', 'future', 'this_week', 'true', 'false']);
export const defaultOp = type => OPS[type]?.[0]?.[0] || 'contains';

const isEmpty = v => v == null || v === '' || (Array.isArray(v) && v.length === 0);
const asText = v => (v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v));
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekBounds = today => {
  const d = new Date(`${today}T12:00:00Z`); const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  return [addDays(today, -dow), addDays(today, 6 - dow)];
};

export function testRule(field, rule, r, ctx, today) {
  if (!field) return true;
  const v = field.get(r, ctx);
  const { op, value } = rule;
  if (op === 'empty') return isEmpty(v);
  if (op === 'not_empty') return !isEmpty(v);
  switch (field.type) {
    case 'bool': return op === 'true' ? !!v : !v;
    case 'number': {
      if (value === '' || value == null) return true;
      if (v == null || v === '') return false;
      const a = Number(v), b = Number(value);
      return { eq: a === b, ne: a !== b, gt: a > b, lt: a < b, gte: a >= b, lte: a <= b }[op] ?? true;
    }
    case 'date': {
      const d = v ? String(v).slice(0, 10) : '';
      if (op === 'past') return !!d && d < today;
      if (op === 'future') return !!d && d >= today;
      if (op === 'this_week') { const [a, b] = weekBounds(today); return !!d && d >= a && d <= b; }
      if (op === 'last_n' || op === 'next_n') {
        const n = Number(value); if (!Number.isFinite(n)) return true; if (!d) return false;
        return op === 'last_n' ? d >= addDays(today, -n) && d <= today : d >= today && d <= addDays(today, n);
      }
      if (op === 'between') {
        const [a, b] = Array.isArray(value) ? value : [];
        if (!a && !b) return true; if (!d) return false;
        return (!a || d >= a) && (!b || d <= b);
      }
      if (!value) return true;
      if (!d) return false;
      return { on: d === value, before: d < value, after: d > value, on_or_before: d <= value, on_or_after: d >= value }[op] ?? true;
    }
    case 'select': {
      const want = Array.isArray(value) ? value : value ? [value] : [];
      if (!want.length) return true;
      const have = Array.isArray(v) ? v.map(String) : isEmpty(v) ? [] : [String(v)];
      const hit = have.some(x => want.includes(x));
      return op === 'none' ? !hit : hit;
    }
    default: {
      if (value === '' || value == null) return true;
      const s = asText(v).toLowerCase(), w = String(value).toLowerCase();
      return { contains: s.includes(w), not_contains: !s.includes(w), is: s === w, is_not: s !== w }[op] ?? true;
    }
  }
}

export function matchesView(view, fieldsByKey, r, ctx, today) {
  const rules = (view.filters || []).filter(f => fieldsByKey.has(f.field));
  if (!rules.length) return true;
  const test = f => testRule(fieldsByKey.get(f.field), f, r, ctx, today);
  return view.match === 'any' ? rules.some(test) : rules.every(test);
}

// Values a select field takes in the current rows (for the "is any of" picker)
export function optionsFor(field, rows, ctx) {
  if (Array.isArray(field.options)) return field.options;
  const set = new Set();
  for (const r of rows) { const v = field.get(r, ctx); for (const x of Array.isArray(v) ? v : [v]) if (!isEmpty(x)) set.add(String(x)); }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
export function groupKeyOf(field, r, ctx) {
  const v = field.get(r, ctx);
  if (isEmpty(v)) return null;
  if (field.type === 'date') return String(v).slice(0, 7);
  if (field.type === 'bool') return v ? 'Yes' : 'No';
  return Array.isArray(v) ? String(v[0]) : String(v);
}
export function groupLabelOf(field, k) {
  if (k == null || k === '—') return `No ${field.label.toLowerCase()}`;
  if (field.type === 'date') return MONTH.format(new Date(`${k}-01T12:00:00Z`));
  return field.groupLabel ? field.groupLabel(k) : k;
}

export const fmtDate = d => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : null);

// Plain export value for a field
export function exportValue(field, r, ctx) {
  if (field.csv) return field.csv(r, ctx);
  const v = field.get(r, ctx);
  if (field.type === 'bool') return v ? 'Yes' : '';
  if (field.type === 'date') return v ? String(v).slice(0, 10) : '';
  return v == null ? '' : Array.isArray(v) ? v.join('; ') : v;
}

export function sortValueOf(field) {
  return field.sortValue || ((r, ctx) => { const v = field.get(r, ctx); return Array.isArray(v) ? v[0] : typeof v === 'boolean' ? (v ? 1 : 0) : v; });
}

// Human summary of a rule, for chips
export function ruleText(field, rule) {
  if (!field) return 'Unknown field';
  const op = (OPS[field.type] || OPS.text).find(([k]) => k === rule.op)?.[1] || rule.op;
  if (NO_VALUE.has(rule.op)) return `${field.label} ${op}`;
  let v = rule.value;
  if (rule.op === 'between') v = (Array.isArray(v) ? v : []).map(x => fmtDate(x) || '…').join(' – ');
  else if (rule.op === 'last_n' || rule.op === 'next_n') return `${field.label} in the ${rule.op === 'last_n' ? 'last' : 'next'} ${v || '…'} days`;
  else if (field.type === 'date') v = fmtDate(v) || '…';
  else if (Array.isArray(v)) v = v.length ? v.join(', ') : '…';
  return `${field.label} ${op} ${v ?? '…'}`;
}

// ── Excel export of a view ──────────────────────────────────────────────────
export async function exportXlsx({ fileName, sheet = 'Register', title, fields, groups, ctx, groupField }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Axiom DL Hub';
  const ws = wb.addWorksheet(sheet.slice(0, 31), { views: [{ state: 'frozen', ySplit: title ? 3 : 1 }] });
  const cols = groupField ? [{ label: groupField.label, width: 24, type: 'text' }, ...fields] : fields;
  let r0 = 1;
  if (title) {
    ws.getCell(1, 1).value = title; ws.getCell(1, 1).font = { bold: true, size: 13 };
    ws.getCell(2, 1).value = `Exported ${new Date().toLocaleString('en-GB')}`; ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF666666' } };
    r0 = 3;
  }
  const head = ws.getRow(r0);
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B2B2B' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    ws.getColumn(i + 1).width = Math.max(10, Math.min(60, Math.round((c.width || 140) / 7)));
  });
  head.height = 28;
  let n = r0;
  for (const g of groups) {
    for (const r of g.rows) {
      n++;
      const row = ws.getRow(n);
      cols.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        if (groupField && i === 0) { cell.value = g.label || ''; return; }
        const v = exportValue(c, r, ctx);
        if (c.type === 'date' && v && /^\d{4}-\d{2}-\d{2}$/.test(v)) { cell.value = new Date(`${v}T12:00:00Z`); cell.numFmt = 'dd/mm/yyyy'; }
        else if (c.type === 'number' && v !== '' && v != null && Number.isFinite(Number(v))) cell.value = Number(v);
        else cell.value = v === '' || v == null ? null : String(v);
        cell.alignment = { vertical: 'top', wrapText: true };
      });
    }
  }
  ws.autoFilter = { from: { row: r0, column: 1 }, to: { row: Math.max(n, r0), column: cols.length } };
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportViewCsv({ fileName, fields, groups, ctx, groupField }) {
  const cell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const cols = groupField ? [groupField, ...fields] : fields;
  const lines = [cols.map(c => cell(c.label)).join(',')];
  for (const g of groups) for (const r of g.rows) lines.push(cols.map((c, i) => cell(groupField && i === 0 ? g.label : exportValue(c, r, ctx))).join(','));
  const url = URL.createObjectURL(new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
