import { Member } from '../data/member';
import { Task } from '../data/tasks';
import { TaskDependency } from '../data/taskDependencies';
import { computeSchedule, ProjectSchedule } from './projectSchedule';

const DEFAULT_EFFORT_HOURS = 2;
// How soon counts as "near-term" for the crunch signal below — short on
// purpose, this is meant to catch "due any minute" not "due eventually."
const CRUNCH_WINDOW_DAYS = 3;

export type MemberLoad = {
  /** Remaining effort across this person's not-done tasks. */
  loadHours: number;
  /** hoursPerDay × calendar days left until the due date. */
  capacityHours: number;
  /** loadHours / capacityHours — >1 means more committed than they realistically have time for. */
  loadPct: number;
};

export type RebalanceImpact = 'low' | 'medium' | 'high';

export type RebalanceSuggestion = {
  taskId: string;
  taskTitle: string;
  fromMember: string;
  toMember: string;
  effortHours: number;
  /** One-line payoff, in the reader's terms — not "lowest workload." */
  reason: string;
  /** How much this move is actually worth doing — resolving project risk always counts as high. */
  impact: RebalanceImpact;
  before: { fromHours: number; toHours: number; fromPct: number; toPct: number };
  after: { fromHours: number; toHours: number; fromPct: number; toPct: number };
  /** Whether this move makes the project's overall critical-path risk better, same, or worse. */
  projectRiskBefore: boolean;
  projectRiskAfter: boolean;
  /**
   * Distinct from loadPct: a whole-cycle ratio can look fine while someone's
   * actual next few days are slammed (or the reverse — badly split isn't the
   * same as badly loaded). Read against each person's CURRENT real
   * assignment, not the hypothetical move, so it describes their real
   * situation rather than simulating a second thing this move doesn't
   * change either way.
   */
  fromNearTermCrunch: boolean;
  toNearTermCrunch: boolean;
};

function daysUntil(isoDate: string, today: Date): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(1, Math.round((new Date(y, m - 1, d).getTime() - start.getTime()) / 86_400_000));
}

/** Real load — remaining effort against remaining capacity — not a task count. Matches what the rebalancing engine below actually reasons about, so the numbers a suggestion shows are the numbers that produced it. */
export function computeMemberLoad(
  tasks: Task[],
  memberIds: string[],
  memberHoursPerDay: Record<string, number>,
  dueDate: string,
  today: Date
): Record<string, MemberLoad> {
  const days = daysUntil(dueDate, today);
  const result: Record<string, MemberLoad> = {};
  for (const id of memberIds) {
    const loadHours = tasks
      .filter((t) => t.assigneeId === id && t.status !== 'completed')
      .reduce((sum, t) => sum + (t.effortHours ?? DEFAULT_EFFORT_HOURS), 0);
    const capacityHours = (memberHoursPerDay[id] ?? 2) * days;
    result[id] = { loadHours, capacityHours, loadPct: capacityHours > 0 ? loadHours / capacityHours : 0 };
  }
  return result;
}

function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/**
 * A second, independent signal from loadPct — not a replacement for it.
 * loadPct is hours over the WHOLE remaining cycle, so "8h spread over 2
 * weeks" and "8h all due tomorrow" read identically. This instead asks: of
 * a person's outstanding work, how much of it needs to START within the
 * next CRUNCH_WINDOW_DAYS (per the real backward-scheduled dates, so a task
 * that should already be underway counts too), against how many hours they
 * actually have in that same short window. Informational only — this never
 * feeds the accept/reject decision in generateRebalanceSuggestions, only
 * what a suggestion card discloses about the people it names.
 */
export function computeNearTermCrunch(
  tasks: Task[],
  memberIds: string[],
  schedule: ProjectSchedule,
  memberHoursPerDay: Record<string, number>,
  today: Date
): Record<string, boolean> {
  const windowEnd = addDays(atMidnight(today), CRUNCH_WINDOW_DAYS);
  const result: Record<string, boolean> = {};
  for (const id of memberIds) {
    const nearTermHours = tasks
      .filter((t) => t.assigneeId === id && t.status !== 'completed')
      .filter((t) => {
        const s = schedule.byTaskId[t.id];
        return s && s.latestStart < windowEnd;
      })
      .reduce((sum, t) => sum + (t.effortHours ?? DEFAULT_EFFORT_HOURS), 0);
    const nearTermCapacity = (memberHoursPerDay[id] ?? 2) * CRUNCH_WINDOW_DAYS;
    result[id] = nearTermCapacity > 0 && nearTermHours / nearTermCapacity > 1;
  }
  return result;
}

/**
 * Proposes moving specific not-yet-started tasks off overloaded teammates
 * onto someone with real room — validated by actually recomputing the
 * schedule and load for each hypothetical move (reusing computeSchedule,
 * not a separate model of it), not by picking whoever has the fewest
 * tasks. In-progress work is never proposed: someone's already partway
 * through it, and handing that off mid-stream is disruptive in a way a
 * lightweight suggestion shouldn't casually recommend. A move only
 * surfaces if it demonstrably helps: the overloaded person's load drops,
 * the destination has real room and doesn't end up over capacity itself
 * (moving someone's overload onto a previously-fine teammate isn't a fix,
 * it's just relocating the problem), and the project's overall schedule
 * risk doesn't get worse.
 */
export function generateRebalanceSuggestions(
  tasks: Task[],
  dependencies: TaskDependency[],
  memberIds: string[],
  membersById: Record<string, Member>,
  memberHoursPerDay: Record<string, number>,
  dueDate: string,
  today: Date,
  maxSuggestions = 2
): RebalanceSuggestion[] {
  const currentLoad = computeMemberLoad(tasks, memberIds, memberHoursPerDay, dueDate, today);
  const currentSchedule = computeSchedule(tasks, dependencies, memberHoursPerDay, dueDate, today);
  const nearTermCrunch = computeNearTermCrunch(tasks, memberIds, currentSchedule, memberHoursPerDay, today);
  const overloaded = memberIds
    .filter((id) => currentLoad[id].loadPct > 1)
    .sort((a, b) => currentLoad[b].loadPct - currentLoad[a].loadPct);

  const candidates: RebalanceSuggestion[] = [];

  for (const fromMember of overloaded) {
    const movableTasks = tasks
      .filter((t) => t.assigneeId === fromMember && t.status === 'not_started')
      // Try the highest-effort task first — moving one big piece helps more than several small ones.
      .sort((a, b) => (b.effortHours ?? DEFAULT_EFFORT_HOURS) - (a.effortHours ?? DEFAULT_EFFORT_HOURS));

    for (const task of movableTasks) {
      let best: RebalanceSuggestion | null = null;

      for (const toMember of memberIds) {
        if (toMember === fromMember) continue;

        const hypotheticalTasks = tasks.map((t) => (t.id === task.id ? { ...t, assigneeId: toMember } : t));
        const hypotheticalLoad = computeMemberLoad(hypotheticalTasks, memberIds, memberHoursPerDay, dueDate, today);
        const hypotheticalSchedule = computeSchedule(hypotheticalTasks, dependencies, memberHoursPerDay, dueDate, today);

        const fromAfter = hypotheticalLoad[fromMember].loadPct;
        const toAfter = hypotheticalLoad[toMember].loadPct;
        const fromBefore = currentLoad[fromMember].loadPct;

        // Only a real improvement: the overloaded person actually drops, the
        // destination has room and stays at or under capacity (never hand an
        // overload to someone by pushing them over 100% themselves), and the
        // move doesn't newly put the whole project at risk.
        const improves =
          fromAfter < fromBefore - 0.02 &&
          toAfter <= 1 &&
          !(hypotheticalSchedule.projectAtRisk && !currentSchedule.projectAtRisk);
        if (!improves) continue;

        // Prefer the destination left least strained after the move.
        if (!best || toAfter < hypotheticalLoad[best.toMember].loadPct) {
          best = {
            taskId: task.id,
            taskTitle: task.title,
            fromMember,
            toMember,
            effortHours: task.effortHours ?? DEFAULT_EFFORT_HOURS,
            reason: '',
            impact: 'low',
            before: {
              fromHours: currentLoad[fromMember].loadHours,
              toHours: currentLoad[toMember].loadHours,
              fromPct: fromBefore,
              toPct: currentLoad[toMember].loadPct,
            },
            after: {
              fromHours: hypotheticalLoad[fromMember].loadHours,
              toHours: hypotheticalLoad[toMember].loadHours,
              fromPct: fromAfter,
              toPct: toAfter,
            },
            projectRiskBefore: currentSchedule.projectAtRisk,
            projectRiskAfter: hypotheticalSchedule.projectAtRisk,
            fromNearTermCrunch: nearTermCrunch[fromMember],
            toNearTermCrunch: nearTermCrunch[toMember],
          };
        }
      }

      if (best) {
        const resolvesRisk = currentSchedule.projectAtRisk && !best.projectRiskAfter;
        const pctDrop = best.before.fromPct - best.after.fromPct;
        const impact: RebalanceImpact = resolvesRisk || pctDrop >= 0.5 ? 'high' : pctDrop >= 0.2 ? 'medium' : 'low';

        candidates.push({
          ...best,
          impact,
          reason: `Frees ${formatHours(best.effortHours)} from ${membersById[fromMember].name}'s overloaded window.`,
        });
        break; // one suggestion per overloaded person per pass is plenty to act on
      }
    }
  }

  return candidates
    .sort((a, b) => b.before.fromPct - b.after.fromPct - (a.before.fromPct - a.after.fromPct))
    .slice(0, maxSuggestions);
}

function formatHours(hours: number): string {
  return `${Number(hours.toFixed(1))}h`;
}
