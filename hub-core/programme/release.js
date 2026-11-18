// ─────────────────────────────────────────────────────────────────────────────
// DRAWING RELEASE SCHEDULE — one row per item: first drawing number, number of
// drawings, and the ADJUSTED submission date for each stage.
//   done      every drawing (Dwg No. Assigned = Drawing) submitted → actual date
//   progress  some submitted → adjusted forecast for the rest, with n/N
//   forecast  none submitted yet → adjusted forecast
//   reissue   issued before, reissue pending (or superseded by an earlier stage's
//             reissue) → the reissue (Adj) date
//   na        stage skipped (No Client Approval items have no S4 / S5)
// Shared by the Release tab and its Excel export.
// ─────────────────────────────────────────────────────────────────────────────
import { toDate, constrLabel } from './schedule.js';

export const RELEASE_STAGES = [
  { key: 's4',  label: 'S4 Submission',  mdsKey: 'sub1ActDate', adj: c => c.sub1A, ncaSkip: true },
  { key: 's5',  label: 'S5 Submission',  mdsKey: 'sub2ActDate', adj: c => c.sub2A, ncaSkip: true },
  { key: 'c01', label: 'A4.5 / PRD Submission', mdsKey: 'subCActDate', adj: c => c.subCA },
];

export function releaseStage(row, c, stage) {
  if (stage.ncaSkip && row.noClientApproval) return { state: 'na', date: null };
  const ss = c?.stages?.[stage.key];
  if (ss?.state === 'pending' || ss?.state === 'required' || ss?.state === 'superseded') return { state: 'reissue', date: toDate(ss.date), locked: ss.locked };
  const prog   = row.mdsProgress?.[stage.mdsKey] || null;
  const actual = toDate(row[stage.mdsKey]);
  if (actual) return { state: 'done', date: actual, done: prog?.done ?? null, n: prog?.n ?? null };
  const date = toDate(stage.adj(c)) || null;
  if (prog && prog.done > 0 && prog.done < prog.n) return { state: 'progress', date, done: prog.done, n: prog.n };
  return { state: date ? 'forecast' : 'none', date };
}

export function releaseRow(row, c) {
  return {
    name: row.name,
    constrType: constrLabel(row.noClientApproval),
    dwgFirst: row.mdsDwgFirst || null,
    dwgCount: row.mdsDwgCount ?? 0,
    stages: Object.fromEntries(RELEASE_STAGES.map(st => [st.key, releaseStage(row, c, st)])),
  };
}
