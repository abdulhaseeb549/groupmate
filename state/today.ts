import { Task } from '../data/tasks';
import { courseColor, daysUntil, Deadline, formatClock, formatDay, KIND_LABEL, ymd } from './deadlines';

/**
 * Board PToday "Due soon": personal deadlines and your own project tasks in
 * one list, most urgent first. A task's day is its pinned due date when it
 * has one, otherwise the schedule's latest safe finish (the real last day
 * it can be done without pushing the project late).
 */

export type DueItem = {
  key: string;
  source: 'deadline' | 'task';
  id: string;
  title: string;
  /** Second line: "Physics · Lab", "Maths · 10:00 AM", or the project name. */
  sub: string;
  /** Course colour dot for deadlines; tasks show a team icon instead. */
  dot: string | null;
  dueOn: string;
  dueTime: string | null;
  days: number;
};

/** Through this many days ahead (Thu → Mon on the board). */
export const DUE_SOON_DAYS = 4;

export function buildDueSoon(input: {
  deadlines: Deadline[];
  myOpenTasks: Task[];
  taskDay: (t: Task) => Date | null;
  projectName: string;
  today: Date;
}): DueItem[] {
  const { deadlines, myOpenTasks, taskDay, projectName, today } = input;
  const items: DueItem[] = [];

  for (const d of deadlines) {
    if (d.doneAt) continue;
    const days = daysUntil(d.dueOn, today);
    if (days > DUE_SOON_DAYS) continue;
    const second = d.dueTime ? formatClock24(d.dueTime) : KIND_LABEL[d.kind];
    items.push({
      key: `d-${d.id}`,
      source: 'deadline',
      id: d.id,
      title: d.title,
      sub: d.course ? `${d.course} · ${second}` : second,
      dot: courseColor(d.course),
      dueOn: d.dueOn,
      dueTime: d.dueTime,
      days,
    });
  }

  for (const t of myOpenTasks) {
    const day = taskDay(t);
    if (!day) continue;
    const dueOn = ymd(day);
    const days = daysUntil(dueOn, today);
    if (days > DUE_SOON_DAYS) continue;
    items.push({ key: `t-${t.id}`, source: 'task', id: t.id, title: t.title, sub: projectName, dot: null, dueOn, dueTime: null, days });
  }

  return items.sort(
    (a, b) => a.days - b.days || (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99') || a.title.localeCompare(b.title)
  );
}

/** "10:00 AM" (board keeps the minutes in the list). */
function formatClock24(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export type DueTone = 'late' | 'soon' | 'later';

export function dueTone(days: number): DueTone {
  if (days <= 0) return 'late'; // late and today are both coral on the board
  if (days === 1) return 'soon';
  return 'later';
}

/** The row's pill: "1 day late", "Today", "Tomorrow", "Mon". */
export function duePill(item: DueItem, today: Date): string {
  if (item.days < 0) {
    const n = -item.days;
    return `${n} day${n === 1 ? '' : 's'} late`;
  }
  return formatDay(item.dueOn, today);
}

/** Week strip dot per day (Monday-first dates): coral by today, amber tomorrow, grey later. */
export function weekDots(dates: Date[], items: DueItem[], today: Date): (string | null)[] {
  return dates.map((date) => {
    const days = daysUntil(ymd(date), today);
    const any = items.some((i) => i.dueOn === ymd(date));
    if (!any) return null;
    if (days <= 0) return '#E95B57';
    if (days === 1) return '#E9A321';
    return '#C9C5D2';
  });
}

// Re-exported for callers that only need the formatter.
export { formatClock };
