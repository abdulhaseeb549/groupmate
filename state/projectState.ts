import { Project } from '../data/project';
import { Task } from '../data/tasks';
import { Requirement } from '../data/requirements';
import { TaskRequirement } from '../data/taskRequirements';

export type RequirementStatus = 'not_started' | 'in_progress' | 'met';

export type RequirementState = {
  requirement: Requirement;
  status: RequirementStatus;
  linkedTasks: Task[];
  /** Linked tasks not yet done — what's actually holding this requirement back. */
  blockingTasks: Task[];
};

export type ProjectHealth = 'on_track' | 'at_risk' | 'ready';

export type ProjectState = {
  taskProgress: { done: number; total: number; pct: number };
  requirementProgress: { met: number; total: number; pct: number };
  requirementStates: RequirementState[];
  submissionReadiness: 'not_ready' | 'ready';
  /** Inverse of requirementStates.blockingTasks, keyed by task id — for screens (Projects) that render task-first rather than requirement-first. */
  blockingRequirementsByTask: Record<string, Requirement[]>;
  /** Calendar days until the project is due; negative once overdue. */
  daysRemaining: number;
  health: ProjectHealth;
};

const DAY_MS = 86_400_000;
// Inside this window, any unmet requirement flips the project to "at risk".
const AT_RISK_DAYS = 7;

/**
 * Single source of truth for project-level numbers. Every screen that
 * shows progress should read from here rather than computing (or
 * hardcoding) its own — otherwise screens drift out of sync with each
 * other as the underlying tasks/requirements change.
 *
 * A requirement's status is derived, never stored: it's only as done as
 * the tasks linked to it. No linked tasks, or none of them done yet,
 * reads as not started; some but not all done reads as in progress;
 * all done reads as met. Recalculation is just calling this again after
 * `tasks` changes — there's no separate event/notification step yet.
 */
export function deriveProjectState(
  tasks: Task[],
  requirements: Requirement[],
  taskRequirements: TaskRequirement[],
  project: Project,
  today: Date
): ProjectState {
  const doneTasks = tasks.filter((t) => t.status === 'completed').length;

  const requirementStates: RequirementState[] = requirements.map((requirement) => {
    const linkedTaskIds = taskRequirements
      .filter((tr) => tr.requirementId === requirement.id)
      .map((tr) => tr.taskId);
    const linkedTasks = tasks.filter((t) => linkedTaskIds.includes(t.id));
    const blockingTasks = linkedTasks.filter((t) => t.status !== 'completed');
    const doneLinkedCount = linkedTasks.length - blockingTasks.length;

    const status: RequirementStatus =
      linkedTasks.length === 0 || doneLinkedCount === 0
        ? 'not_started'
        : blockingTasks.length === 0
          ? 'met'
          : 'in_progress';

    return { requirement, status, linkedTasks, blockingTasks };
  });

  const metRequirements = requirementStates.filter((r) => r.status === 'met').length;
  const ready = requirements.length > 0 && metRequirements === requirements.length;
  const daysRemaining = daysUntil(project.dueDate, today);

  const blockingRequirementsByTask: Record<string, Requirement[]> = {};
  for (const state of requirementStates) {
    for (const task of state.blockingTasks) {
      (blockingRequirementsByTask[task.id] ??= []).push(state.requirement);
    }
  }

  return {
    taskProgress: {
      done: doneTasks,
      total: tasks.length,
      pct: tasks.length > 0 ? doneTasks / tasks.length : 0,
    },
    requirementProgress: {
      met: metRequirements,
      total: requirements.length,
      pct: requirements.length > 0 ? metRequirements / requirements.length : 0,
    },
    requirementStates,
    submissionReadiness: ready ? 'ready' : 'not_ready',
    blockingRequirementsByTask,
    daysRemaining,
    health: ready ? 'ready' : daysRemaining <= AT_RISK_DAYS ? 'at_risk' : 'on_track',
  };
}

function daysUntil(isoDate: string, today: Date): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Round, not floor: across a DST change the gap is 23 or 25 hours long.
  return Math.round((new Date(y, m - 1, d).getTime() - start.getTime()) / DAY_MS);
}
