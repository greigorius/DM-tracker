// UK working-day arithmetic, copied from the Scheduling Tool (lib/schedule.js:
// UK_HOLIDAYS, isWorkday, snapFwd, addWD) so the Hub counts days exactly the
// same way. Works on 'YYYY-MM-DD' strings. Keep in step with the tool.

export const UK_HOLIDAYS = new Set([
  '2024-01-01', '2024-03-29', '2024-04-01', '2024-05-06', '2024-05-27', '2024-08-26', '2024-12-25', '2024-12-26',
  '2025-01-01', '2025-04-18', '2025-04-21', '2025-05-05', '2025-05-26', '2025-08-25', '2025-12-25', '2025-12-26',
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28',
  '2028-01-03', '2028-04-14', '2028-04-17', '2028-05-01', '2028-05-29', '2028-08-28', '2028-12-25', '2028-12-26',
]);

const toUTC = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fromUTC = d => d.toISOString().slice(0, 10);

export function isWorkday(iso) {
  const day = toUTC(iso).getUTCDay();
  return day !== 0 && day !== 6 && !UK_HOLIDAYS.has(iso);
}

// Move forward to the next working day (unchanged if it already is one)
export function snapFwd(iso) {
  if (!iso) return null;
  const d = toUTC(iso);
  while (!isWorkday(fromUTC(d))) d.setUTCDate(d.getUTCDate() + 1);
  return fromUTC(d);
}

// n working days after iso (n may be negative)
export function addWD(iso, n) {
  if (!iso || n == null) return null;
  const d = toUTC(snapFwd(iso));
  let rem = Math.abs(n);
  const dir = n >= 0 ? 1 : -1;
  while (rem > 0) {
    d.setUTCDate(d.getUTCDate() + dir);
    if (isWorkday(fromUTC(d))) rem--;
  }
  return fromUTC(d);
}
