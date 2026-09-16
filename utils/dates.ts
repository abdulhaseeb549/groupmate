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

/** "2:34 PM" — local time, 12-hour clock, spelled out rather than Intl so it doesn't shift with device locale. */
export function formatTime(date: Date): string {
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 || 12;
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours12}:${minutes} ${hours24 < 12 ? 'AM' : 'PM'}`;
}

/**
 * Compact "how long ago" for activity rows — the unit a feed wants, where
 * an exact timestamp is noise and the reader only needs to know whether
 * something is from minutes ago or last week.
 *
 * Deliberately stops at weeks: past that, the relative form stops being
 * easier to read than a date, so it hands over to one.
 */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (seconds < 60) return 'now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;

  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w`;

  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
