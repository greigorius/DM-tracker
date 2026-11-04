// Triage → Team: the data the Team page and DT emails depend on. Each flag is
// fixed inline and written straight back to Notion.
import { useMemo } from 'react';
import { useSnapshots } from '../../hooks/hub.js';
import { FixCard } from './FixCard.jsx';
import { teamIssues, todoStatus, fmtTodo, TEAM_ROLES, TODO_STATUSES } from '../../../hub-core/team.js';
import { fmtDay } from './shared.jsx';

const SEV_TONE = { error: 'danger', warning: 'accent', info: 'muted' };
const SEV_LABEL = { error: 'Error', warning: 'Warning', info: 'Info' };
const SEV_CLASS = { error: 'text-danger', warning: 'text-accent', info: 'text-muted' };

export function useTeamIssues() {
  const { data, isPending } = useSnapshots(['todo', 'team']);
  return useMemo(() => ({ isPending, issues: teamIssues(data) }), [data, isPending]);
}

export function TeamFixes({ d }) {
  const { issues } = useTeamIssues();
  const task = r => `${fmtTodo(r) ? `${fmtTodo(r)} ` : ''}${r.title || 'Untitled'}`;
  const where = r => [d.itemName(r.itemIds), d.personName(r.personIds?.[0]), r.end && `due ${fmtDay(r.end)}`].filter(Boolean).join(' · ');

  const checks = [
    { id: 'noPerson', severity: 'error', title: 'Open to-dos with no person', why: 'They sit with nobody, so they never reach the Team page DT groups or anyone’s email.', db: 'todo', field: 'personId', fix: 'dt', label: task, sub: where },
    { id: 'noItem', severity: 'error', title: 'Open to-dos with no item', why: 'The email groups by item; a to-do with no item has nowhere to go.', db: 'todo', field: 'itemIds', fix: 'item', label: task, sub: where },
    { id: 'noEnd', severity: 'error', title: 'Open to-dos with no end date', why: 'The email covers overdue and the next two weeks by end date, so undated to-dos are left out.', db: 'todo', field: 'end', fix: 'date', label: task, sub: where },
    { id: 'dtNoEmail', severity: 'error', title: 'DTs with no email', why: 'Their summary email can’t be sent.', db: 'team', field: 'email', fix: 'email', label: t => t.title, sub: () => 'Role DT' },
    { id: 'noRole', severity: 'warning', title: 'Team members with no role', why: 'Only Role = DT counts as a DT on the Team page, in pickers and for emails.', db: 'team', field: 'role', fix: 'select', options: TEAM_ROLES, label: t => t.title, sub: t => t.email || 'No email' },
    { id: 'noHours', severity: 'info', title: 'Open to-dos with no estimated hours', why: 'Optional for now — hours feed the DT workload totals. The estimating tool will fill these later.', db: 'todo', field: 'hours', fix: 'number', label: task, sub: where },
    { id: 'blockedNoLink', severity: 'info', title: 'Blocked to-dos with no RFI, variation or action linked', why: 'Optional — linking the blocker in Notion shows why it’s stuck (open the to-do to add the link), or change the status if it’s no longer blocked.', db: 'todo', field: 'status', fix: 'select', options: TODO_STATUSES.filter(s => s !== 'Blocked'), label: task, sub: r => `${todoStatus(r)} · ${where(r)}` },
  ].map(c => ({ ...c, rows: issues[c.id] }));

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 font-mono text-[12px] text-muted max-w-[100ch]">Errors stop a to-do reaching the Team page or a DT email, and are counted on the Triage tab. Warnings and info are worth tidying but don’t block anything.</p>
      {checks.map(c => <FixCard key={c.id} check={{ ...c, tag: SEV_LABEL[c.severity], tagClass: SEV_CLASS[c.severity], tone: SEV_TONE[c.severity] }} d={d} />)}
    </div>
  );
}
