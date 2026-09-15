import { Task } from '../data/tasks';
import { TaskDependency } from '../data/taskDependencies';
import { TeamId } from '../data/team';

export type TaskSchedule = {
  taskId: string;
  durationDays: number;
  earliestStart: Date;
  earliestFinish: Date;
  /** Latest the task can start and still let everything downstream finish by the due date. */
  latestStart: Date;
  latestFinish: Date;
  /** True once another task depends on this one — a real gate, not a fixed weekly check-in. */
  isCheckpoint: boolean;
  /** Titles of tasks that can't start until this one is done. */
  blocks: string[];
  /** Not done, and the safe window to start has already passed. */
  atRisk: boolean;
};

export type ProjectSchedule = {
  byTaskId: Record<string, TaskSchedule>;
  /** True if the critical path can't finish by the due date even starting everything today. */
  projectAtRisk: boolean;
};

const DAY_MS = 86_400_000;
const DEFAULT_EFFORT_HOURS = 2;
const DEFAULT_HOURS_PER_DAY = 2;

function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseLocalDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + Math.round(days) * DAY_MS);
}

/**
 * Backward-scheduling over the real task-dependency graph: turns each
 * task's effort_hours + the assignee's hours/day into a duration, then a
 * forward pass (earliest dates, from today) and a backward pass (latest
 * safe dates, from the due date) give every task a real date range and a
 * genuine at-risk flag — never an invented per-task deadline. A cycle in
 * the dependency graph (shouldn't happen, but AI-generated edges aren't
 * guaranteed acyclic) breaks at whichever edge closes the loop rather
 * than throwing, consistent with how this app treats untrusted AI output
 * everywhere else.
 */
export function computeSchedule(
  tasks: Task[],
  dependencies: TaskDependency[],
  memberHoursPerDay: Record<TeamId, number>,
  dueDate: string,
  today: Date
): ProjectSchedule {
  const start = atMidnight(today);
  const due = parseLocalDate(dueDate);
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const dependsOn = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  for (const t of tasks) {
    dependsOn.set(t.id, []);
    dependents.set(t.id, []);
  }
  for (const dep of dependencies) {
    if (!taskById.has(dep.taskId) || !taskById.has(dep.dependsOnTaskId) || dep.taskId === dep.dependsOnTaskId) continue;
    dependsOn.get(dep.taskId)!.push(dep.dependsOnTaskId);
    dependents.get(dep.dependsOnTaskId)!.push(dep.taskId);
  }

  const duration = new Map<string, number>();
  for (const t of tasks) {
    const hours = t.effortHours ?? DEFAULT_EFFORT_HOURS;
    const perDay = memberHoursPerDay[t.assigneeId] ?? DEFAULT_HOURS_PER_DAY;
    duration.set(t.id, Math.max(hours / Math.max(perDay, 0.5), 0.5));
  }

  // Kahn's algorithm for a topological order; any nodes left over after the
  // queue drains sit inside a cycle — append them in their original order
  // so every task still gets scheduled instead of vanishing from the graph.
  const inDegree = new Map<string, number>();
  for (const t of tasks) inDegree.set(t.id, dependsOn.get(t.id)!.length);
  const queue = tasks.filter((t) => inDegree.get(t.id) === 0).map((t) => t.id);
  const order: string[] = [];
  const remaining = new Set(inDegree.keys());
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (!remaining.has(id)) continue;
    order.push(id);
    remaining.delete(id);
    for (const dependentId of dependents.get(id) ?? []) {
      const next = (inDegree.get(dependentId) ?? 0) - 1;
      inDegree.set(dependentId, next);
      if (next === 0) queue.push(dependentId);
    }
  }
  for (const t of tasks) {
    if (remaining.has(t.id)) order.push(t.id);
  }

  const earliestStart = new Map<string, Date>();
  const earliestFinish = new Map<string, Date>();
  for (const id of order) {
    const deps = dependsOn.get(id) ?? [];
    const es = deps.length === 0 ? start : deps.reduce((latest, depId) => {
      const finish = earliestFinish.get(depId) ?? start;
      return finish > latest ? finish : latest;
    }, start);
    earliestStart.set(id, es);
    earliestFinish.set(id, addDays(es, duration.get(id)!));
  }

  const latestStart = new Map<string, Date>();
  const latestFinish = new Map<string, Date>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const deps = dependents.get(id) ?? [];
    const lf = deps.length === 0 ? due : deps.reduce((earliest, depId) => {
      const s = latestStart.get(depId) ?? due;
      return s < earliest ? s : earliest;
    }, due);
    latestFinish.set(id, lf);
    latestStart.set(id, addDays(lf, -duration.get(id)!));
  }

  const byTaskId: Record<string, TaskSchedule> = {};
  let projectAtRisk = false;
  for (const t of tasks) {
    const ef = earliestFinish.get(t.id)!;
    if (ef > due) projectAtRisk = true;
    const blockedIds = dependents.get(t.id) ?? [];
    byTaskId[t.id] = {
      taskId: t.id,
      durationDays: duration.get(t.id)!,
      earliestStart: earliestStart.get(t.id)!,
      earliestFinish: ef,
      latestStart: latestStart.get(t.id)!,
      latestFinish: latestFinish.get(t.id)!,
      isCheckpoint: blockedIds.length > 0,
      blocks: blockedIds.map((id) => taskById.get(id)?.title).filter((title): title is string => Boolean(title)),
      atRisk: t.status !== 'completed' && start > latestStart.get(t.id)!,
    };
  }

  return { byTaskId, projectAtRisk };
}
