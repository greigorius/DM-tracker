// Printable Timeline: the item-level table on A4 landscape, light theme, for
// the PDF export and the weekly client report. Rendered into <body> and only
// visible when printing.

import { Fragment } from 'react';
import { createPortal } from 'react-dom';
import { fmtDay, reportBic } from './format.js';

const GRADE = {
  A: { background: '#CDEBD9', color: '#134D2C' }, Approved: { background: '#CDEBD9', color: '#134D2C' },
  B: { background: '#FBE3BF', color: '#6B3E00' },
  C: { background: '#F8D3CF', color: '#7A1A13' }, Rejected: { background: '#F8D3CF', color: '#7A1A13' },
  NA: { background: '#E7E8EA', color: '#33363B' },
};

function Sub({ c, today }) {
  if (!c) return <span className="tr-none">—</span>;
  return (
    <>
      <span className={c.kind === 'plan' ? (c.late ? 'tr-late tr-plan' : 'tr-plan') : ''}>{c.reissue ? 'R ' : ''}{fmtDay(c.date, today)}</span>
      {c.kind === 'act' && c.total > c.issued && <span className="tr-sub">{c.issued}/{c.total} issued</span>}
      {c.late > 0 && <span className="tr-sub tr-late">{c.late} days late</span>}
    </>
  );
}

function Ret({ c, today }) {
  if (!c) return <span className="tr-none">—</span>;
  if (c.kind === 'act') return <span>{c.grade && <span className="tr-grade" style={GRADE[c.grade]}>{c.grade}</span>}{fmtDay(c.date, today)}</span>;
  if (c.kind === 'plan') return <span className="tr-plan">{fmtDay(c.date, today)}</span>;
  return (
    <>
      <span>Awaiting</span>
      {c.total > 1 && <span className="tr-sub">{c.back}/{c.total} back</span>}
      {c.late > 0 ? <span className="tr-sub tr-late">{c.late} days late</span> : c.date && <span className="tr-sub tr-plan">due {fmtDay(c.date, today)}</span>}
    </>
  );
}

const CSS = `
.timeline-print { display: none; }
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  html, body { background: #fff !important; }
  body > #root { display: none !important; }
  .timeline-print { display: block; color: #17181A; font-family: 'DM Sans', system-ui, sans-serif; }
  .timeline-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
.timeline-print .tr-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; padding-bottom: 8px; border-bottom: 2px solid #17181A; margin-bottom: 10px; }
.timeline-print .tr-kicker { font-family: 'DM Mono', monospace; font-size: 8pt; letter-spacing: 0.14em; text-transform: uppercase; color: #4A4E55; }
.timeline-print h1 { margin: 2px 0 0; font-size: 18pt; font-weight: 600; }
.timeline-print .tr-meta { display: grid; grid-template-columns: auto auto; column-gap: 12px; row-gap: 2px; font-size: 9pt; }
.timeline-print .tr-meta span:nth-child(odd) { color: #4A4E55; }
.timeline-print table { width: 100%; border-collapse: collapse; font-size: 8pt; }
.timeline-print thead { display: table-header-group; }
.timeline-print tr { page-break-inside: avoid; break-inside: avoid; }
.timeline-print th { background: #F1F2F4; text-align: left; font-weight: 400; padding: 4px 6px; border-bottom: 1px solid #C9CCD1; font-family: 'DM Mono', monospace; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.05em; color: #33363B; }
.timeline-print th.tr-stage { font-size: 8.5pt; text-transform: none; letter-spacing: 0; color: #17181A; }
.timeline-print td { padding: 5px 6px; border-bottom: 1px solid #E1E3E6; vertical-align: top; font-family: 'DM Mono', monospace; }
.timeline-print td.tr-item { font-family: 'DM Sans', sans-serif; font-weight: 500; font-size: 8.5pt; }
.timeline-print .tr-edge { border-left: 1px solid #C9CCD1; }
.timeline-print .tr-group td { background: #F7F7F8; font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 9pt; }
.timeline-print .tr-sub { display: block; font-size: 7pt; color: #4A4E55; }
.timeline-print .tr-plan { color: #5A5E66; font-style: italic; }
.timeline-print .tr-late { color: #B3261E; font-style: normal; font-weight: 500; }
.timeline-print .tr-none { color: #A3A7AE; }
.timeline-print .tr-grade { display: inline-block; padding: 0 4px; margin-right: 4px; font-weight: 500; }
.timeline-print .tr-foot { display: flex; justify-content: space-between; gap: 12px; margin-top: 8px; padding-top: 6px; border-top: 1px solid #C9CCD1; font-family: 'DM Mono', monospace; font-size: 7pt; color: #4A4E55; }
`;

export function TimelineReport({ rows, stages, today, projectTitle, clientName, projects, clientOf }) {
  const groups = projects
    ? [...new Set(rows.map(r => r.projectId))].map(pid => ({ pid, title: projects.get(pid)?.title || 'No project', rows: rows.filter(r => r.projectId === pid) }))
    : [{ pid: null, title: null, rows }];
  const asAt = new Date(`${today}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const cols = 3 + stages.length * 2;

  return createPortal(
    <div className="timeline-print" aria-hidden="true">
      <style>{CSS}</style>
      <div className="tr-head">
        <div>
          <div className="tr-kicker">Weekly client report · Drawing programme</div>
          <h1>Drawing programme</h1>
        </div>
        <div className="tr-meta">
          <span>Project</span><span>{projectTitle}</span>
          <span>As at</span><span>{asAt}</span>
          {clientName && <><span>From</span><span>{clientName}</span></>}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th colSpan={3} />
            {stages.map(s => <th key={s.key} colSpan={2} className="tr-stage tr-edge">{s.key === 'con' ? 'A4.5 / PRD' : s.code} · {s.name}</th>)}
          </tr>
          <tr>
            <th style={{ width: '22%' }}>Item</th>
            <th style={{ width: '17%' }}>Drawings</th>
            <th style={{ width: '9%' }}>With</th>
            {stages.map(s => (
              <Fragment key={s.key}>
                <th className="tr-edge">Submitted</th>
                <th>Comments / status</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map(g => (
            <Fragment key={g.pid || 'one'}>
              {g.title && <tr className="tr-group"><td colSpan={cols}>{g.title}</td></tr>}
              {g.rows.map(r => (
                <tr key={r.id}>
                  <td className="tr-item">{r.title}</td>
                  <td>{r.first}<span className="tr-sub">{r.count} drawing{r.count === 1 ? '' : 's'}</span></td>
                  <td style={{ fontFamily: "'DM Sans', sans-serif" }}>{reportBic(r.bic, clientName || clientOf?.(r.projectId))}</td>
                  {stages.map(s => (
                    <Fragment key={s.key}>
                      <td className="tr-edge"><Sub c={r.stages[s.key].sub} today={today} /></td>
                      <td>
                        <Ret c={r.stages[s.key].ret} today={today} />
                        {s.key === 'con' && r.stages.con.sub?.kind === 'act' && <span className="tr-sub">{r.prd ? 'PRD' : 'A4.5'}</span>}
                      </td>
                    </Fragment>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      <div className="tr-foot">
        <span>Actual dates upright · planned dates in italics · late in red · A/B/C grade · R = reissue pending</span>
        <span>Item dates are the earliest submission and latest return across that item's drawings</span>
      </div>
    </div>,
    document.body,
  );
}
