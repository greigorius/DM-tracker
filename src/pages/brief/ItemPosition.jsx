// Everything the Item Status rule looks at for one item: the item's own trigger
// fields, its RFIs, its variations and its drawings. Fields the Hub can write are
// editable (saved on change); the rest are shown read-only. Worked out in the
// browser from the snapshots with the same rules as the automation
// (hub-core/item-status.js → netlify/functions/_statusRules.js).
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Badge, useToast, cx } from '../../components/ui/index.js';
import { useUpdateRecord } from '../../hooks/hub.js';
import { latestSubmission } from '../../../netlify/functions/_statusRules.js';
import { statusModel, linked, bare, TONE, PAUSE_TYPES, PLAN_KEY } from './statusModel.js';
import { Sel, DateIn, Mini, Check } from './controls.jsx';
import { fmtDay } from './shared.jsx';

export const St = ({ v }) => (v ? <Badge tone={TONE[v] || 'muted'} className="py-1">{v}</Badge> : <span className="font-mono text-[12px] text-muted">blank</span>);
export const Move = ({ from, to }) => (from === to ? <St v={to} /> : <span className="inline-flex items-center gap-2"><St v={from} /><ArrowRight size={13} className="text-muted" aria-hidden="true" /><St v={to} /></span>);
const Ext = ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-text no-underline hover:underline">{children}</a>;
const Lbl = ({ children }) => <span className="font-mono text-[11px] text-muted">{children}</span>;

// ── Saving ─────────────────────────────────────────────────────────────────
function useSave(db) {
  const update = useUpdateRecord(db);
  const qc = useQueryClient();
  const toast = useToast();
  return (id, set) => update.mutate({ id, set }, {
    onSuccess: () => qc.invalidateQueries({ queryKey: PLAN_KEY }),
    onError: e => toast.show(`Not saved: ${e.message}`, { tone: 'danger' }),
  });
}

/** One line, always visible: where the item's RFIs, variations and drawings stand. */
export function PositionSummary({ itemId, d, className }) {
  const m = statusModel(d);
  const it = m.items.get(bare(itemId));
  const l = linked(d, m, itemId);
  const stops = l.openRfis.filter(r => r.stopsWork).length;
  const held = l.openVcs.filter(l.vcHold).length;
  const counts = {};
  for (const x of l.dws) counts[x.status || 'No status'] = (counts[x.status || 'No status'] || 0) + 1;
  const part = (label, text, tone) => <span><span className="text-muted">{label}</span> <span className={tone}>{text}</span></span>;
  return (
    <span className={cx('flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px]', className)}>
      {it && part('Rule', it.locked ? `${it.current || 'blank'} (locked)` : it.proposed === it.current ? it.proposed : `${it.current || 'blank'} → ${it.proposed}`, it.proposed === 'Blocked' ? 'text-danger' : 'text-text-2')}
      {part('RFIs', l.openRfis.length ? `${l.openRfis.length} open${stops ? ` · ${stops} stop work` : ''}` : 'none', stops ? 'text-danger' : 'text-text-2')}
      {part('Variations', l.openVcs.length ? `${l.openVcs.length} open${held ? ` · ${held} holding` : ''}` : 'none', held ? 'text-danger' : 'text-text-2')}
      {part('Drawings', l.dws.length ? Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ') : 'none', 'text-text-2')}
    </span>
  );
}

function Section({ title, empty, children }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="m-0 section-label text-[11px] font-normal">{title}</h4>
      {empty ? <span className="text-[13px] text-muted">None</span> : children}
    </section>
  );
}

function RfiLine({ r, holding, lookups, t }) {
  const save = useSave('rfis');
  return (
    <li className={cx('flex flex-col gap-1 pl-3 border-l-2', holding ? 'border-danger' : 'border-line')}>
      <span className="text-[14px]">
        <Ext href={r.url}>{`RFI-${String(r.number ?? '?').padStart(3, '0')} ${r.title || ''}`}</Ext>{' '}
        {holding && <Badge tone="danger">Holding</Badge>}
        <span className="font-mono text-[12px] text-muted">{[r.tbcBy && `TBC ${r.tbcBy}`, r.raised && `raised ${fmtDay(r.raised)}`, r.due && `due ${fmtDay(r.due)}`].filter(Boolean).map(x => ` · ${x}`).join('')}</span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <Sel label="RFI status" value={r.status} onChange={v => save(r.id, { status: v || null })} blank="No status" options={lookups.rfiStatuses || []} />
        <Check label="Stops work" checked={r.stopsWork} onChange={v => save(r.id, { stopsWork: v })} />
        <Lbl>Responded</Lbl>
        <DateIn label="Date responded" value={r.responded} onChange={v => save(r.id, { responded: v || null })} />
        {!r.responded && <Mini onClick={() => save(r.id, { responded: t })}>Today</Mini>}
      </span>
    </li>
  );
}

function VcLine({ v, holding, lookups, t }) {
  const save = useSave('variations');
  const byType = PAUSE_TYPES.has(v.type);
  const pauses = v.pauseOverride === 'Pauses' || (!v.pauseOverride && byType);
  return (
    <li className={cx('flex flex-col gap-1 pl-3 border-l-2', holding ? 'border-danger' : 'border-line')}>
      <span className="text-[14px]">
        <Ext href={v.url}>{[v.code, v.title].filter(Boolean).join(' ') || 'Untitled variation'}</Ext>{' '}
        {holding ? <Badge tone="danger">Holding</Badge> : <Badge tone={pauses ? 'accent' : 'muted'}>{pauses ? 'Pauses (not active)' : 'Logged only · doesn’t take the item’s ball in court'}</Badge>}
        <span className="font-mono text-[12px] text-muted">{[v.type || 'No type', v.bic && `BIC ${v.bic}`].filter(Boolean).map(x => ` · ${x}`).join('')}</span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <Sel label="Variation status" value={v.status} onChange={x => save(v.id, { status: x || null })} blank="No status" options={lookups.vcStatuses || []} />
        <Sel label="Pause override" value={v.pauseOverride} onChange={x => save(v.id, { pauseOverride: x || null })}
          blank={v.type ? `By type: ${byType ? 'pauses' : 'doesn’t pause'}` : 'By type (no type)'} options={lookups.vcPause || ['Pauses', 'Does not pause']} />
        <Lbl>Sits with</Lbl><Sel label="Variation sits with (TBC by)" value={(v.tbcBy || [])[0] || ''} onChange={x => save(v.id, { tbcBy: x ? [x] : [] })} blank="Sits with…" options={lookups.vcTbcBy || []} />
        <Lbl>Requested</Lbl><DateIn label="Change request date" value={v.requested} onChange={x => save(v.id, { requested: x || null })} />
        <Lbl>Decided</Lbl><DateIn label="Decision date" value={v.decision} onChange={x => save(v.id, { decision: x || null })} />
        {!v.decision && <Mini onClick={() => save(v.id, { decision: t })}>Today</Mini>}
      </span>
    </li>
  );
}

/** The full position, with trigger fields. */
export function ItemPosition({ itemId, d, lookups = {} }) {
  const m = statusModel(d);
  const save = useSave('tasks');
  const t = d.today;
  const row = d.all.tasks.find(x => bare(x.id) === bare(itemId));
  const it = m.items.get(bare(itemId));
  const l = linked(d, m, itemId);
  const ruled = new Map((m.drawingsOf.get(bare(itemId)) || []).map(x => [x.id, x]));
  const closedRfis = l.rfis.length - l.openRfis.length, decidedVcs = l.vcs.length - l.openVcs.length;
  if (!row) return null;
  return (
    <div className="flex flex-col gap-4 py-1">
      <Section title="Item status">
        <span className="flex flex-wrap items-center gap-2 text-[13px]">
          {it && <Move from={it.current} to={it.locked ? it.current : it.proposed} />}
          <span className="text-muted">{it?.reason}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <Lbl>DT started</Lbl><DateIn label="1st DT start (actual)" value={row.dt?.s4StartAct} onChange={v => save(row.id, { s4StartAct: v || null })} />
          <Lbl>WO raised</Lbl><DateIn label="WO raised" value={row.dates?.woRaised} onChange={v => save(row.id, { woRaised: v || null })} />
          {!row.dates?.woRaised && <Mini onClick={() => save(row.id, { woRaised: t })}>Today</Mini>}
          <Check label="Lock Status" checked={row.lockStatus} onChange={v => save(row.id, { lockStatus: v })} />
        </span>
      </Section>
      <Section title={`RFIs${closedRfis ? ` · ${closedRfis} closed not shown` : ''}`} empty={!l.openRfis.length}>
        <ul className="m-0 p-0 list-none flex flex-col gap-2">{l.openRfis.map(r => <RfiLine key={r.id} r={r} holding={l.rfiHold(r)} lookups={lookups} t={t} />)}</ul>
      </Section>
      <Section title={`Variations${decidedVcs ? ` · ${decidedVcs} decided not shown` : ''}`} empty={!l.openVcs.length}>
        <ul className="m-0 p-0 list-none flex flex-col gap-2">{l.openVcs.map(v => <VcLine key={v.id} v={v} holding={l.vcHold(v)} lookups={lookups} t={t} />)}</ul>
      </Section>
      <Section title="Drawings (set by Drawing Flow, read-only here)" empty={!l.dws.length}>
        <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
          {l.dws.map(x => {
            const r = ruled.get(bare(x.id));
            const last = latestSubmission((m.subsOf.get(bare(x.id)) || []).map(s => ({ ...s, created: s.createdAt })));
            return (
              <li key={x.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                <Ext href={x.url}>{x.title || 'No number'}</Ext>
                {r && !x.lockStatus ? <Move from={x.status} to={r.proposed} /> : <St v={x.status} />}
                {x.lockStatus && <Badge tone="muted">Locked</Badge>}
                <span className="font-mono text-[12px] text-muted">
                  {[last ? `last: ${[last.stage, last.status, last.grade].filter(Boolean).join(' ')}${last.blocked ? ' · BLOCKED' : ''}` : 'no submissions',
                    x.c01?.signOff && `C01 signed ${fmtDay(x.c01.signOff)}`, x.prd?.scheduled && `production ${fmtDay(x.prd.scheduled)}`].filter(Boolean).join(' · ')}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
