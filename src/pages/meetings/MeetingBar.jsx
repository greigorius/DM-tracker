// Start / run / end a meeting (Item Tracker spec §6.2). Shown at the top of
// the Workspace and the Actions tracker.
//   Start  pick project + type → Meetings page created; the Items lens opens on
//          that project with "changed since" = the project's previous meeting
//   Live   bar with the meeting, items discussed and what's been added
//   End    recap (added, closed, discussed) → summary saved, Status Ended
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Copy } from 'lucide-react';
import { Card, Badge, cx, useToast } from '../../components/ui/index.js';
import { useCreateMeeting, useSnapshots } from '../../hooks/hub.js';
import { londonToday } from '../../../hub-core/derive.js';
import { useActiveMeeting } from './useMeeting.js';

const TYPES = ['Design team', 'Client progress', 'Coordination', 'Internal', 'Site', 'Supplier'];
const BTN = 'min-h-9 px-3 inline-flex items-center gap-2 border border-line-strong bg-transparent text-text-2 hover:bg-surface-hi font-mono text-[12px] uppercase tracking-[0.08em] cursor-pointer disabled:opacity-40';
const ctl = 'min-h-9 px-2 bg-ground border border-line-strong text-text text-[13px] outline-none focus:border-accent';
const fmt = iso => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

export function useRecap(meeting) {
  const { data: s } = useSnapshots(['actions', 'rfis', 'variations', 'tasks']);
  return useMemo(() => {
    if (!meeting) return null;
    const items = new Map(s.tasks.map(t => [t.id, t.title]));
    const linked = (rows, ids) => rows.filter(r => !r.archived && ((r.meetingIds || []).includes(meeting.id) || (ids || []).includes(r.id)));
    const added = [
      ...linked(s.actions, meeting.actionIds).map(a => ({ id: a.id, kind: a.type === 'Note' ? 'Note' : 'Action', title: a.title, item: items.get(a.itemIds?.[0]), extra: [a.bic, a.due && `due ${fmt(a.due)}`].filter(Boolean).join(' · '), done: a.done })),
      ...linked(s.rfis, meeting.rfiIds).map(r => ({ id: r.id, kind: 'RFI', title: `RFI-${String(r.number ?? '?').padStart(3, '0')} ${r.title || ''}`, item: items.get(r.itemIds?.[0]), extra: r.tbcBy })),
      ...linked(s.variations, meeting.vcIds).map(v => ({ id: v.id, kind: 'Variation', title: `${v.code || 'VC'} ${v.title || ''}`, item: items.get(v.itemIds?.[0]), extra: v.status })),
    ];
    const discussed = new Set(meeting.itemIds || []);
    const day = meeting.date || (meeting.createdAt || '').slice(0, 10);
    const closed = s.actions.filter(a => !a.archived && a.done && a.closedOn === day && (a.itemIds || []).some(i => discussed.has(i)))
      .map(a => ({ id: a.id, title: a.title, item: items.get(a.itemIds?.[0]) }));
    const text = [
      `${meeting.title}`,
      added.length ? `\nRaised (${added.length}):\n${added.map(x => `- [${x.kind}] ${x.title}${x.item ? ` (${x.item})` : ''}${x.extra ? ` · ${x.extra}` : ''}`).join('\n')}` : '',
      closed.length ? `\nClosed (${closed.length}):\n${closed.map(x => `- ${x.title}${x.item ? ` (${x.item})` : ''}`).join('\n')}` : '',
      discussed.size ? `\nItems discussed (${discussed.size}): ${[...discussed].map(i => items.get(i)).filter(Boolean).join(', ')}` : '',
    ].filter(Boolean).join('\n');
    return { added, closed, discussed: [...discussed].map(i => items.get(i)).filter(Boolean), text };
  }, [meeting, s]);
}

function Recap({ meeting, onClose, onEnd, ending }) {
  const r = useRecap(meeting);
  const [summary, setSummary] = useState(meeting.summary || '');
  const toast = useToast();
  if (!r) return null;
  const copy = () => navigator.clipboard?.writeText(`${r.text}${summary ? `\n\nSummary: ${summary}` : ''}`).then(() => toast.show('Recap copied'), () => toast.show('Could not copy', { tone: 'danger' }));
  return (
    <Card className="p-4 flex flex-col gap-3 border-accent">
      <div className="flex items-start justify-between gap-3">
        <h2 className="m-0 text-[17px] font-semibold">{meeting.title}</h2>
        <button type="button" onClick={onClose} className={BTN}>Close</button>
      </div>
      <div className="grid gap-4 md:grid-cols-3 text-[13px]">
        <div className="flex flex-col gap-1"><span className="section-label text-[11px]">Raised · {r.added.length}</span>
          {r.added.length ? r.added.map(x => <span key={x.id}><Badge tone="muted">{x.kind}</Badge> {x.title} <span className="font-mono text-[11px] text-muted">{[x.item, x.extra].filter(Boolean).join(' · ')}</span></span>) : <span className="text-muted">Nothing raised.</span>}</div>
        <div className="flex flex-col gap-1"><span className="section-label text-[11px]">Closed on discussed items · {r.closed.length}</span>
          {r.closed.length ? r.closed.map(x => <span key={x.id}>{x.title} <span className="font-mono text-[11px] text-muted">{x.item}</span></span>) : <span className="text-muted">Nothing closed.</span>}</div>
        <div className="flex flex-col gap-1"><span className="section-label text-[11px]">Items discussed · {r.discussed.length}</span>
          {r.discussed.length ? <span className="text-text-2">{r.discussed.join(' · ')}</span> : <span className="text-muted">None opened.</span>}</div>
      </div>
      <label className="flex flex-col gap-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Summary
        <textarea rows={3} value={summary} onChange={e => setSummary(e.target.value)} className={cx(ctl, 'py-2 normal-case tracking-normal font-sans text-[14px] resize-y')} placeholder="Short summary for the record and the client report" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className={BTN}><Copy size={13} aria-hidden="true" /> Copy recap</button>
        {onEnd && <button type="button" onClick={() => onEnd(summary)} disabled={ending} className={cx(BTN, 'border-accent text-accent')}>{ending ? 'Ending…' : 'End meeting'}</button>}
      </div>
    </Card>
  );
}

export function MeetingBar({ projectId }) {
  const { meeting, id, setActive, update } = useActiveMeeting();
  const create = useCreateMeeting();
  const { data: s } = useSnapshots(['projects', 'meetings']);
  const nav = useNavigate();
  const toast = useToast();
  const [starting, setStarting] = useState(false);
  const [proj, setProj] = useState(projectId || '');
  const [type, setType] = useState('Design team');
  const [recap, setRecap] = useState(null);
  const live = useMemo(() => s.projects.filter(p => !p.archived && /^in progress$/i.test(p.status || '')).sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true })), [s.projects]);
  const past = useMemo(() => s.meetings.filter(m => !m.archived && m.status === 'Ended').sort((a, b) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt))).slice(0, 12), [s.meetings]);

  const start = () => {
    if (!proj) return;
    const prev = s.meetings.filter(m => !m.archived && (m.projectIds || []).includes(proj)).map(m => m.date || (m.createdAt || '').slice(0, 10)).filter(Boolean).sort().pop();
    create.mutate({ projectId: proj, type, date: londonToday() }, {
      onSuccess: ({ row }) => {
        setActive(row.id); setStarting(false);
        toast.show(`${row.title} started${prev ? ` · showing changes since ${fmt(prev)}` : ''}`);
        nav(`/workspace/items?project=${proj}${prev ? `&since=${prev}` : ''}`);
      },
      onError: e => toast.show(`Meeting not started: ${e.message}`, { tone: 'danger' }),
    });
  };
  const end = summary => update.mutate({ id: meeting.id, set: { status: 'Ended', ...(summary !== (meeting.summary || '') && { summary }) } }, {
    onSuccess: () => { setActive(''); setRecap(null); toast.show('Meeting ended and saved'); },
    onError: e => toast.show(`Not saved: ${e.message}`, { tone: 'danger' }),
  });

  if (meeting || id) {
    const m = meeting;
    return (
      <>
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-surface-hi border border-accent">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" aria-hidden="true" />
          <span className="text-[14px] font-semibold">{m ? m.title : 'Meeting starting…'}</span>
          {m && <span className="font-mono text-[12px] text-muted">{(m.itemIds || []).length} items discussed · quick-adds link to this meeting</span>}
          <span className="ml-auto flex gap-2">
            {m && <button type="button" className={BTN} onClick={() => setRecap(m)}>Recap / end</button>}
            <button type="button" className={BTN} onClick={() => { setActive(''); setRecap(null); }} title="Stop linking to this meeting without ending it">Leave</button>
          </span>
        </div>
        {recap && m && <Recap meeting={m} onClose={() => setRecap(null)} onEnd={end} ending={update.isPending} />}
      </>
    );
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {starting ? (
          <span className="flex flex-wrap items-center gap-2 px-3 py-2 border border-accent">
            <select aria-label="Project" value={proj} onChange={e => setProj(e.target.value)} className={ctl}><option value="">Project…</option>{live.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
            <select aria-label="Meeting type" value={type} onChange={e => setType(e.target.value)} className={ctl}>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
            <button type="button" className={cx(BTN, 'border-accent text-accent')} disabled={!proj || create.isPending} onClick={start}>{create.isPending ? 'Starting…' : 'Start'}</button>
            <button type="button" className={BTN} onClick={() => setStarting(false)}>Cancel</button>
          </span>
        ) : <button type="button" className={BTN} onClick={() => setStarting(true)}><CalendarClock size={14} aria-hidden="true" /> Start meeting</button>}
        {past.length > 0 && (
          <select aria-label="Past meetings" value="" onChange={e => setRecap(past.find(m => m.id === e.target.value) || null)} className={cx(ctl, 'max-w-[280px] text-text-2')}>
            <option value="">Past meetings…</option>
            {past.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        )}
      </div>
      {recap && <Recap meeting={recap} onClose={() => setRecap(null)} />}
    </>
  );
}
