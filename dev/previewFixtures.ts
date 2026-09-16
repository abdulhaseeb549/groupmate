import { Member } from '../data/member';
import { Project } from '../data/project';
import { Requirement } from '../data/requirements';
import { Task } from '../data/tasks';
import { TaskDependency } from '../data/taskDependencies';
import { TaskRequirement } from '../data/taskRequirements';

/**
 * A believable project, for looking at screens without an account.
 *
 * Signing in is the one thing a UI check genuinely cannot do here, so the
 * screens are given a context instead of a session. These are fixtures, not
 * mocks: they are fed through the real deriveProjectState and computeSchedule
 * so what renders is produced by the same code a real project goes through —
 * only the rows are invented. A hand-written ProjectState would let a screen
 * look right against numbers the real engine would never produce.
 *
 * Deliberately not tidy: a mix of done, in-progress and unclaimed work, one
 * task with no assignee, one overdue-ish date and a member who joined later,
 * because a fixture where everything is neat hides exactly the layout
 * problems worth catching.
 */

export const PREVIEW_USER_ID = 'preview-you';

export const previewMembers: Member[] = [
  { id: PREVIEW_USER_ID, initials: 'SK', name: 'Sk Rahman', bg: '#EDE7FF', fg: '#6D4AFF', role: 'owner' },
  { id: 'preview-ayesha', initials: 'AY', name: 'Ayesha Khan', bg: '#E4F6EE', fg: '#147A52', role: 'member' },
  { id: 'preview-bilal', initials: 'BI', name: 'Bilal Ahmed', bg: '#FFF0EF', fg: '#C4403B', role: 'member' },
];

export const previewProject: Project = {
  id: 'preview-project',
  name: 'Renewable Energy Report',
  team: 'Team 4',
  course: 'ENV204',
  // Far enough out that the schedule has room, close enough to be real.
  dueDate: new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10),
  memberHoursPerDay: { [PREVIEW_USER_ID]: 2, 'preview-ayesha': 3, 'preview-bilal': 2 },
  inviteCode: '7F3KQ9LP',
};

export const previewRequirements: Requirement[] = [
  { id: 'req-1', label: 'Executive summary' },
  { id: 'req-2', label: 'Comparison of three energy sources' },
  { id: 'req-3', label: 'Cost analysis over ten years' },
  { id: 'req-4', label: 'At least 6 academic sources' },
  { id: 'req-5', label: 'Presentation deck' },
];

export const previewTasks: Task[] = [
  {
    id: 'task-1',
    title: 'Draft the solar vs wind comparison',
    sectionRef: '§2.1',
    assigneeId: PREVIEW_USER_ID,
    status: 'in_progress',
    priority: 'high',
    dueLabel: 'Today',
    dueUrgent: true,
    metadata: '1,200 words',
    effortHours: 5,
  },
  {
    id: 'task-2',
    title: 'Build the ten-year cost model',
    sectionRef: '§3',
    assigneeId: PREVIEW_USER_ID,
    status: 'not_started',
    priority: 'high',
    dueLabel: 'Thu',
    effortHours: 6,
  },
  {
    id: 'task-3',
    title: 'Write the executive summary',
    sectionRef: '§1',
    assigneeId: PREVIEW_USER_ID,
    status: 'not_started',
    priority: 'medium',
    effortHours: 3,
  },
  {
    id: 'task-4',
    title: 'Collect and cite 6 academic sources',
    sectionRef: '§5',
    assigneeId: 'preview-ayesha',
    status: 'in_progress',
    priority: 'medium',
    metadata: '4 of 6 found',
    effortHours: 4,
  },
  {
    id: 'task-5',
    title: 'Summarise the hydro case study',
    sectionRef: '§2.3',
    assigneeId: 'preview-bilal',
    status: 'completed',
    completedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    priority: 'low',
    effortHours: 2,
  },
  {
    // Unclaimed on purpose — the claim affordance has its own layout.
    id: 'task-6',
    title: 'Design the presentation deck',
    sectionRef: '§6',
    assigneeId: null,
    status: 'not_started',
    priority: 'medium',
    effortHours: 5,
  },
];

export const previewTaskRequirements: TaskRequirement[] = [
  { taskId: 'task-1', requirementId: 'req-2' },
  { taskId: 'task-2', requirementId: 'req-3' },
  { taskId: 'task-3', requirementId: 'req-1' },
  { taskId: 'task-4', requirementId: 'req-4' },
  { taskId: 'task-5', requirementId: 'req-2' },
  { taskId: 'task-6', requirementId: 'req-5' },
];

export const previewTaskDependencies: TaskDependency[] = [
  // The summary can only be written once the comparison and the costing are
  // done — gives the timeline a real checkpoint to draw.
  { taskId: 'task-3', dependsOnTaskId: 'task-1' },
  { taskId: 'task-3', dependsOnTaskId: 'task-2' },
  { taskId: 'task-6', dependsOnTaskId: 'task-1' },
];
