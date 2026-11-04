// Team page, DT summary emails and the Triage Team checks. Pure functions over
// snapshot rows (no SDK import), so the browser and the server share them.

import { addDays } from './derive.js';

export const TODO_STATUSES = ['Not Started', 'In Progress', 'Blocked', 'Done'];
export const TEAM_ROLES = ['DT', 'DM', 'DC', 'Outsourced', 'Client', 'Supplier'];
export const EMAIL_WINDOW_DAYS = 14;

// Status is the one completion flag. Rows not yet backfilled fall back to Task Done.
export const todoStatus = r => r.status || (r.done ? 'Done' : 'Not Started');
export const isOpenTodo = r => !r.archived && todoStatus(r) !== 'Done';
export const isDt = t => !t.archived && t.role === 'DT';
export const isOverdue = (r, today) => !!r.end && r.end < today;
export const fmtTodo = r => (r.number != null ? `TD-${String(r.number).padStart(3, '0')}` : '');

// Monday of the week containing `today` (ISO date).
export function weekCommencing(today) {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  return addDays(today, dow === 0 ? -6 : 1 - dow);
}
const longDate = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortDate = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const sumHours = rows => rows.reduce((n, r) => n + (Number.isFinite(r.hours) ? r.hours : 0), 0);
const hasHours = rows => rows.some(r => Number.isFinite(r.hours));
const round1 = n => Math.round(n * 10) / 10;

// In scope for the email: open, and overdue or due within the window.
export const inEmailScope = (r, today, windowEnd) => isOpenTodo(r) && !!r.end && r.end <= windowEnd;

// Group a DT's rows by item: items by earliest end date, tasks by end date.
export function groupByItem(rows, itemsById) {
  const map = new Map();
  for (const r of rows) {
    const k = r.itemIds?.[0] || '—';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  const byEnd = (a, b) => (a.end || '9999').localeCompare(b.end || '9999');
  return [...map.entries()].map(([itemId, rs]) => {
    const sorted = [...rs].sort(byEnd);
    const item = itemsById.get(itemId);
    return { itemId, item, title: item?.title || 'No item', projectId: item?.projectId || null, rows: sorted, first: sorted[0]?.end || '9999' };
  }).sort((a, b) => a.first.localeCompare(b.first) || a.title.localeCompare(b.title, undefined, { numeric: true }));
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS_COLOUR = { 'Not Started': '#666666', 'In Progress': '#1f5fbf', Blocked: '#c0392b', Done: '#2e7d32' };

/**
 * One DT's email. `todos` are all to-do rows; scope is applied here.
 * Returns null when nothing is in scope.
 */
export function buildDtEmail({ dt, todos, itemsById, projectsById, today, windowDays = EMAIL_WINDOW_DAYS }) {
  const windowEnd = addDays(today, windowDays);
  const mine = todos.filter(r => r.personIds?.includes(dt.id) && isOpenTodo(r));
  const rows = mine.filter(r => inEmailScope(r, today, windowEnd));
  const undated = mine.filter(r => !r.end).length;
  if (!rows.length) return { dtId: dt.id, empty: true, undated };

  const groups = groupByItem(rows, itemsById);
  const overdue = rows.filter(r => isOverdue(r, today)).length;
  const est = hasHours(rows) ? round1(sumHours(rows)) : null;
  const first = (dt.title || '').split(/\s+/)[0] || 'there';
  const wc = longDate(weekCommencing(today));
  const subject = `Your to-dos — w/c ${wc}`;

  const th = 'padding:8px;border:1px solid #ddd;text-align:left;font-weight:600;';
  const td = 'padding:8px;border:1px solid #ddd;vertical-align:top;';
  const body = groups.map(g => {
    const proj = projectsById.get(g.projectId);
    const head = `<tr><td colspan="4" style="padding:10px 8px 4px;font-weight:600;border-top:2px solid #e57c00;">${esc(g.title)}${proj ? ` <span style="font-weight:400;color:#888;">· ${esc(proj)}</span>` : ''}</td></tr>`;
    const lines = g.rows.map(r => {
      const late = isOverdue(r, today);
      const s = todoStatus(r);
      return `<tr>
  <td style="${td}">${esc(r.title || 'Untitled')}${fmtTodo(r) ? ` <span style="color:#999;font-size:11px;">${fmtTodo(r)}</span>` : ''}</td>
  <td style="${td}color:${STATUS_COLOUR[s] || '#666'};white-space:nowrap;">${esc(s)}</td>
  <td style="${td}white-space:nowrap;${late ? 'color:#c0392b;font-weight:600;' : ''}">${shortDate(r.end)}${late ? ' · overdue' : ''}</td>
  <td style="${td}text-align:right;white-space:nowrap;">${Number.isFinite(r.hours) ? r.hours : ''}</td>
</tr>`;
    }).join('\n');
    return `${head}\n${lines}`;
  }).join('\n');

  const summary = [
    `<strong>${rows.length}</strong> open`,
    overdue ? `<strong style="color:#c0392b;">${overdue}</strong> overdue` : '0 overdue',
    est != null ? `<strong>${est}</strong> est. hrs` : null,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  const html = `<div style="font-family:sans-serif;font-size:13px;color:#222;">
<p>Hi ${esc(first)},</p>
<p>Here are your open to-dos that are overdue or due by ${shortDate(windowEnd)}, grouped by item.</p>
<p style="padding:8px 10px;background:#f5f0e8;border-left:3px solid #e57c00;">${summary}</p>
<table style="border-collapse:collapse;width:100%;font-size:13px;">
  <thead><tr style="background:#f5f0e8;">
    <th style="${th}">Task</th><th style="${th}">Status</th><th style="${th}">End date</th><th style="${th}text-align:right;">Est. hrs</th>
  </tr></thead>
  <tbody>
${body}
  </tbody>
</table>
${undated ? `<p style="color:#888;">You also have ${undated} open to-do${undated === 1 ? '' : 's'} with no end date, not listed here.</p>` : ''}
<p style="margin-top:16px;font-size:12px;color:#888;">If anything here is done, blocked or wrong, reply and let me know.</p>
</div>`;

  const text = [
    `Hi ${first},`, '',
    `Your open to-dos that are overdue or due by ${shortDate(windowEnd)}:`,
    `${rows.length} open · ${overdue} overdue${est != null ? ` · ${est} est. hrs` : ''}`, '',
    ...groups.flatMap(g => [
      `${g.title}${projectsById.get(g.projectId) ? ` (${projectsById.get(g.projectId)})` : ''}`,
      ...g.rows.map(r => `  - ${r.title || 'Untitled'} | ${todoStatus(r)} | ${shortDate(r.end)}${isOverdue(r, today) ? ' OVERDUE' : ''}${Number.isFinite(r.hours) ? ` | ${r.hours} h` : ''}`),
      '',
    ]),
    undated ? `Also ${undated} open to-do(s) with no end date, not listed.` : '',
  ].join('\n').trim();

  return {
    dtId: dt.id, name: dt.title, to: dt.email || null, subject, html, text, undated,
    meta: { openCount: rows.length, overdueCount: overdue, estHours: est, windowEnd },
  };
}

// ── Triage "Team" checks ────────────────────────────────────────────────────
// severity: error | warning | info. Only errors count towards the nav badge.
export function teamIssues({ todo = [], team = [] }) {
  const open = todo.filter(isOpenTodo);
  const people = team.filter(t => !t.archived);
  return {
    noPerson: open.filter(r => !r.personIds?.length),
    noItem: open.filter(r => !r.itemIds?.length),
    noEnd: open.filter(r => !r.end),
    dtNoEmail: people.filter(t => isDt(t) && !t.email),
    noRole: people.filter(t => !t.role),
    noHours: open.filter(r => !Number.isFinite(r.hours)),
    blockedNoLink: open.filter(r => todoStatus(r) === 'Blocked' && !r.rfiIds?.length && !r.vcIds?.length && !r.actionIds?.length),
  };
}
export function teamErrorCount(issues) {
  return issues.noPerson.length + issues.noItem.length + issues.noEnd.length + issues.dtNoEmail.length;
}
