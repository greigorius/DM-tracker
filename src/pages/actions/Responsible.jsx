// Who is responsible, driven by Ball in Court:
//   DT / DM / Document Control → a person from the Team DB with that role (Person)
//   Supplier, Contractor, Consultant, Architect, Client → a company from the
//     Suppliers DB (+ New company…) and an optional contact name
//   Project Team, Production, Site → a contact name
// Changing Ball in Court clears whichever of Person / Company no longer fits.
import { useState } from 'react';
import { CompanySelect } from './CompanySelect.jsx';
import { cx } from '../../components/ui/index.js';
import { partyFor } from './party.js';

const ctl = 'w-full min-h-9 px-2 bg-surface border border-line-strong font-mono text-[12px] outline-none focus:border-accent';

function ContactText({ value, onSave, placeholder }) {
  const [v, setV] = useState(value || '');
  const commit = () => { const t = v.trim(); if (t !== (value || '')) onSave(t || null); };
  return <input type="text" aria-label="Contact" placeholder={placeholder} value={v} onChange={e => setV(e.target.value)} onBlur={commit}
    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} className={cx(ctl, 'text-text')} />;
}

/**
 * The responsible-party control for one action.
 * row: { bic, personId | personIds, companyId | companyIds, contact }
 * save(set): writes A&I fields (dtId = Person, companyId, contact)
 */
export function Responsible({ row, team, suppliers, save, compact }) {
  const p = partyFor(row.bic);
  const personId = row.personIds?.[0] ?? row.personId ?? '';
  const companyId = row.companyIds?.[0] ?? row.companyId ?? '';
  if (!row.bic) return <span className="font-mono text-[12px] text-muted">Set ball in court</span>;
  if (p.kind === 'person') {
    const opts = team.filter(t => !t.archived && p.roles.includes(t.role)).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    return (
      <select aria-label="Responsible person" value={personId} onChange={e => save({ dtId: e.target.value || null })} className={cx(ctl, 'cursor-pointer', personId ? 'text-text' : 'text-muted')}>
        <option value="">{`Which ${row.bic}…`}</option>
        {personId && !opts.some(o => o.id === personId) && <option value={personId}>{team.find(t => t.id === personId)?.title || 'Someone else'}</option>}
        {opts.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
      </select>
    );
  }
  if (p.kind === 'company') {
    return (
      <span className="flex flex-col gap-1 min-w-0">
        <CompanySelect value={companyId} suppliers={suppliers} onChange={v => save({ companyId: v || null })} />
        {!compact && <ContactText key={`${row.id}:${row.contact}`} value={row.contact} placeholder="Contact (optional)" onSave={v => save({ contact: v })} />}
      </span>
    );
  }
  return <ContactText key={`${row.id}:${row.contact}`} value={row.contact} placeholder={`Who in ${row.bic}?`} onSave={v => save({ contact: v })} />;
}
