// Ball in Court → what kind of responsible party it takes (see Responsible.jsx).
//   DT / DM / Document Control  → a person with that role (required to file)
//   Supplier                    → a company from the Suppliers DB (required)
//   Contractor / Consultant / Architect / Client → company optional
//   Project Team / Production / Site            → contact name optional
const OPTIONAL_COMPANY_BICS = new Set(['Contractor', 'Consultant', 'Architect', 'Client']);
const ROLE_OF = { DT: ['DT'], DM: ['DM'], 'Document Control': ['DC'] };

export function partyFor(bic) {
  if (bic === 'Supplier') return { kind: 'company', required: true };
  if (OPTIONAL_COMPANY_BICS.has(bic)) return { kind: 'company', required: false };
  if (ROLE_OF[bic]) return { kind: 'person', roles: ROLE_OF[bic], required: true };
  return { kind: 'contact', required: false };
}

/** The `set` for a Ball in Court change on an A&I action. */
export function bicSet(row, bic, team) {
  const set = { bic: bic || null };
  const p = partyFor(bic);
  const personId = row.personIds?.[0] ?? row.personId ?? null;
  const companyId = row.companyIds?.[0] ?? row.companyId ?? null;
  if (personId) {
    const role = team.find(t => t.id === personId)?.role;
    if (p.kind !== 'person' || !p.roles.includes(role)) set.dtId = null;
  }
  if (companyId && p.kind !== 'company') set.companyId = null;
  return set;
}
