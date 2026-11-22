// Ball in Court → what kind of responsible party it takes (see Responsible.jsx).
const COMPANY_BICS = new Set(['Supplier', 'Contractor', 'Consultant', 'Architect', 'Client']);
const ROLE_OF = { DT: ['DT'], DM: ['DM'], 'Document Control': ['DC'] };

export function partyFor(bic) {
  if (COMPANY_BICS.has(bic)) return { kind: 'company' };
  if (ROLE_OF[bic]) return { kind: 'person', roles: ROLE_OF[bic] };
  return { kind: 'contact' };
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
