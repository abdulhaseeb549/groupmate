// Spelled out rather than Intl so the output doesn't shift with the device's locale.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "10 Oct" for a YYYY-MM-DD date — the year is added only when it isn't this one. */
export function formatDueDate(isoDate: string, today: Date): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dayMonth = `${d} ${MONTHS[m - 1]}`;
  return y === today.getFullYear() ? dayMonth : `${dayMonth} ${y}`;
}

/** "Friday, 11 September" */
export function formatLongDate(date: Date): string {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS_LONG[date.getMonth()]}`;
}

/** "10 Oct" for a real Date (not an ISO string) — the year is added only when it isn't this one. Local fields throughout, never toISOString, so this can't drift a day off in timezones ahead of UTC. */
export function formatShortDate(date: Date, today: Date): string {
  const dayMonth = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === today.getFullYear() ? dayMonth : `${dayMonth} ${date.getFullYear()}`;
}
