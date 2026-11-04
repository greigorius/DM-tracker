// DT summary emails: render from the snapshot, send through the Make webhook
// (TEAM_EMAIL_WEBHOOK_URL), one POST per DT. No Notion SDK import.

import { getHubStore } from './store.js';
import { readSnapshot } from './sync.js';
import { londonToday } from './derive.js';
import { buildDtEmail, isDt } from './team.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const webhookUrl = () => process.env.TEAM_EMAIL_WEBHOOK_URL || '';

async function loadRows() {
  const store = await getHubStore();
  const [todo, team, tasks, projects] = await Promise.all(['todo', 'team', 'tasks', 'projects'].map(db => readSnapshot(store, db)));
  return { todo: todo.rows, team: team.rows, tasks: tasks.rows, projects: projects.rows };
}

async function render(dtIds) {
  const s = await loadRows();
  const today = londonToday();
  const itemsById = new Map(s.tasks.map(i => [i.id, i]));
  const projectsById = new Map(s.projects.map(p => [p.id, p.title]));
  const wanted = dtIds?.length ? new Set(dtIds) : null;
  const dts = s.team.filter(t => isDt(t) && (!wanted || wanted.has(t.id))).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  const emails = [];
  const skipped = [];
  for (const dt of dts) {
    const e = buildDtEmail({ dt, todos: s.todo, itemsById, projectsById, today });
    if (e.empty) skipped.push({ dtId: dt.id, name: dt.title, undated: e.undated });
    else emails.push(e);
  }
  return { today, emails, skipped };
}

// POST /api/team/email/preview  { dtIds?: string[] }
export async function previewTeamEmails(body = {}) {
  const { today, emails, skipped } = await render(body.dtIds);
  return {
    today,
    configured: !!webhookUrl(),
    windowEnd: emails[0]?.meta.windowEnd || null,
    emails,
    skipped,
    noEmail: emails.filter(e => !e.to).map(e => ({ dtId: e.dtId, name: e.name })),
  };
}

// POST /api/team/email/send  { dtIds: string[] }
// The client sends one DT per call so it can show a result per person.
export async function sendTeamEmails(body = {}) {
  const url = webhookUrl();
  if (!url) throw bad('Webhook not configured: set TEAM_EMAIL_WEBHOOK_URL in .env', 503);
  if (!body.dtIds?.length) throw bad('Choose at least one DT');
  const { emails } = await render(body.dtIds);
  const results = [];
  for (const e of emails) {
    if (!e.to) { results.push({ dtId: e.dtId, name: e.name, ok: false, error: 'No email on their Team row' }); continue; }
    const payload = { to: e.to, toName: e.name, subject: e.subject, html: e.html, text: e.text, sentBy: 'DM', meta: e.meta };
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000) });
      const raw = await res.text();
      let json = null; try { json = JSON.parse(raw); } catch { /* Make may answer "Accepted" */ }
      const ok = res.ok && (json ? json.ok !== false : true);
      results.push({ dtId: e.dtId, name: e.name, to: e.to, ok, status: res.status, error: ok ? null : (json?.error || raw || `HTTP ${res.status}`) });
    } catch (err) {
      results.push({ dtId: e.dtId, name: e.name, to: e.to, ok: false, error: err.name === 'TimeoutError' ? 'Webhook timed out' : err.message });
    }
  }
  const missing = body.dtIds.filter(id => !emails.some(e => e.dtId === id));
  for (const id of missing) results.push({ dtId: id, ok: false, skipped: true, error: 'Nothing in scope' });
  return { results };
}
