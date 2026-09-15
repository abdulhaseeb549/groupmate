import { Task } from '../data/tasks';
import { TaskDependency } from '../data/taskDependencies';
import { TEAM, TeamId, TEAM_ORDER } from '../data/team';
import { computeSchedule } from './projectSchedule';

const DEFAULT_EFFORT_HOURS = 2;

export type MemberLoad = {
  /** Remaining effort across this person's not-done tasks. */
  loadHours: number;
  /** hoursPerDay × calendar days left until the due date. */
  capacityHours: number;
  /** loadHours / capacityHours — >1 means more committed than they realistically have time for. */
  loadPct: number;
};

export type RebalanceSuggestion = {
  taskId: string;
  taskTitle: string;
  fromMember: TeamId;
  toMember: TeamId;
  effortHours: number;
  /** Why this specific move, in the reader's terms — not "lowest workload." */
  reason: string;
  before: { from: number; to: number };
  after: { from: number; to: number };
  /** Whether this move makes the project's overall critical-path risk better, same, or worse. */
  projectRiskBefore: boolean;
  projectRiskAfter: boolean;
};

function daysUntil(isoDate: string, today: Date): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(1, Math.round((new Date(y, m - 1, d).getTime() - start.getTime()) / 86_400_000));
}

/** Real load — remaining effort against remaining capacity — not a task count. Matches what the rebalancing engine below actually reasons about, so the numbers a suggestion shows are the numbers that produced it. */
export function computeMemberLoad(
  tasks: Task[],
  memberHoursPerDay: Record<TeamId, number>,
  dueDate: string,
  today: Date
): Record<TeamId, MemberLoad> {
  const days = daysUntil(dueDate, today);
  const result = {} as Record<TeamId, MemberLoad>;
  for (const id of TEAM_ORDER) {
    const loadHours = tasks
      .filter((t) => t.assigneeId === id && !t.done)
      .reduce((sum, t) => sum + (t.effortHours ?? DEFAULT_EFFORT_HOURS), 0);
    const capacityHours = (memberHoursPerDay[id] ?? 2) * days;
    result[id] = { loadHours, capacityHours, loadPct: capacityHours > 0 ? loadHours / capacityHours : 0 };
  }
  return result;
}

/**
 * Proposes moving specific not-done tasks off overloaded teammates onto
 * someone with real room — validated by actually recomputing the schedule
 * and load for each hypothetical move (reusing computeSchedule, not a
 * separate model of it), not by picking whoever has the fewest tasks.
 * A move only surfaces if it demonstrably helps: the overloaded person's
 * load drops, the destination doesn't end up worse off than the source
 * was, and the project's overall schedule risk doesn't get worse.
 */
export function generateRebalanceSuggestions(
  tasks: Task[],
  dependencies: TaskDependency[],
  memberHoursPerDay: Record<TeamId, number>,
  dueDate: string,
  today: Date,
  maxSuggestions = 2
): RebalanceSuggestion[] {
  const currentLoad = computeMemberLoad(tasks, memberHoursPerDay, dueDate, today);
  const currentSchedule = computeSchedule(tasks, dependencies, memberHoursPerDay, dueDate, today);
  const overloaded = TEAM_ORDER.filter((id) => currentLoad[id].loadPct > 1).sort(
    (a, b) => currentLoad[b].loadPct - currentLoad[a].loadPct
  );

  const candidates: RebalanceSuggestion[] = [];

  for (const fromMember of overloaded) {
    const movableTasks = tasks
      .filter((t) => t.assigneeId === fromMember && !t.done)
      // Try the highest-effort task first — moving one big piece helps more than several small ones.
      .sort((a, b) => (b.effortHours ?? DEFAULT_EFFORT_HOURS) - (a.effortHours ?? DEFAULT_EFFORT_HOURS));

    for (const task of movableTasks) {
      let best: RebalanceSuggestion | null = null;

      for (const toMember of TEAM_ORDER) {
        if (toMember === fromMember) continue;

        const hypotheticalTasks = tasks.map((t) => (t.id === task.id ? { ...t, assigneeId: toMember } : t));
        const hypotheticalLoad = computeMemberLoad(hypotheticalTasks, memberHoursPerDay, dueDate, today);
        const hypotheticalSchedule = computeSchedule(hypotheticalTasks, dependencies, memberHoursPerDay, dueDate, today);

        const fromAfter = hypotheticalLoad[fromMember].loadPct;
        const toAfter = hypotheticalLoad[toMember].loadPct;
        const fromBefore = currentLoad[fromMember].loadPct;

        // Only a real improvement: the overloaded person actually drops, the
        // destination doesn't end up more strained than the source started
        // at, and the move doesn't newly put the whole project at risk.
        const improves =
          fromAfter < fromBefore - 0.02 &&
          toAfter <= Math.max(fromBefore, 1) &&
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
            before: { from: fromBefore, to: currentLoad[toMember].loadPct },
            after: { from: fromAfter, to: toAfter },
            projectRiskBefore: currentSchedule.projectAtRisk,
            projectRiskAfter: hypotheticalSchedule.projectAtRisk,
          };
        }
      }

      if (best) {
        candidates.push({
          ...best,
          reason: `${TEAM[fromMember].name} is overloaded — ${TEAM[best.toMember].name} has real room this cycle.`,
        });
        break; // one suggestion per overloaded person per pass is plenty to act on
      }
    }
  }

  return candidates
    .sort((a, b) => b.before.from - b.after.from - (a.before.from - a.after.from))
    .slice(0, maxSuggestions);
}
