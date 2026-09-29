// Dates are stored as local 'YYYY-MM-DD' strings. All arithmetic goes through UTC
// midnight to avoid DST surprises.

const DAY_MS = 86400000;

export function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO() {
  return toISO(new Date());
}

function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso, n) {
  return fromUTC(toUTC(iso) + n * DAY_MS);
}

export function diffDays(a, b) {
  // a - b in days
  return Math.round((toUTC(a) - toUTC(b)) / DAY_MS);
}

// ISO weekday: 1 = Monday ... 7 = Sunday
export function weekday(iso) {
  const wd = new Date(toUTC(iso)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function mondayOf(iso) {
  return addDays(iso, 1 - weekday(iso));
}

export function inRange(iso, from, to) {
  return iso >= from && iso <= to;
}

const WEEKDAYS_IT = ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const MONTHS_IT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

export function weekdayName(n) {
  return WEEKDAYS_IT[n];
}

export function formatDateIT(iso, withWeekday = false) {
  const [y, m, d] = iso.split('-').map(Number);
  const base = `${d} ${MONTHS_IT[m - 1]} ${y}`;
  return withWeekday ? `${weekdayName(weekday(iso))} ${base}` : base;
}

export function shortDateIT(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_IT[m - 1]}`;
}
