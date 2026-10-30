// Date and grade formatting shared by the Timeline page, report and exports.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "16 Sep", with the year added when it differs from today's.
export function fmtDay(iso, today) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const base = `${d} ${MONTHS[Number(m) - 1]}`;
  return today && today.slice(0, 4) !== y ? `${base} ${y.slice(2)}` : base;
}

export const gradeTone = g => (g === 'A' || g === 'Approved' ? 'ok' : g === 'B' ? 'accent' : g === 'C' || g === 'Rejected' ? 'danger' : 'muted');

// Ball in court as the client sees it: anything with the DM or a DT sits with
// the client company the DM represents (never "Axiom").
export const reportBic = (bic, clientName) => (bic === 'DM' || bic === 'DT' ? clientName || 'Client team' : bic || '—');

export function printReport() {
  window.print();
}
