import { supabase } from '../lib/supabase';
import { Project } from '../data/project';
import { Priority, Task, TaskStatus } from '../data/tasks';
import { Requirement } from '../data/requirements';
import { TaskRequirement } from '../data/taskRequirements';
import { TaskDependency } from '../data/taskDependencies';
import { TEAM_ORDER, TeamId } from '../data/team';

type ProjectRow = {
  id: string;
  name: string;
  team: string;
  course: string;
  due_date: string;
  member_hours_per_day: Partial<Record<TeamId, number>> | null;
};

type TaskRow = {
  id: string;
  title: string;
  section_ref: string;
  assignee_id: string;
  status: TaskStatus;
  completed_at: string | null;
  priority: Priority;
  due_label: string | null;
  due_urgent: boolean;
  metadata: string | null;
  guidance: string | null;
  outline: string[] | null;
  effort_hours: number | null;
};

type RequirementRow = {
  id: string;
  label: string;
};

type TaskRequirementRow = {
  task_id: string;
  requirement_id: string;
};

type TaskDependencyRow = {
  task_id: string;
  depends_on_task_id: string;
};

export type ProjectData = {
  /** Null only if a signed-in user somehow has no seeded project yet — see the migration's seed_demo_project(). */
  project: Project | null;
  tasks: Task[];
  requirements: Requirement[];
  taskRequirements: TaskRequirement[];
  taskDependencies: TaskDependency[];
};

const DEFAULT_HOURS_PER_DAY = 2;

function toProject(row: ProjectRow): Project {
  // Defensive per-member fallback: a project row from before this column
  // existed, or a member somehow missing a key, still gets a sane default
  // rather than the scheduler treating them as having zero capacity.
  const memberHoursPerDay = TEAM_ORDER.reduce(
    (acc, id) => {
      acc[id] = row.member_hours_per_day?.[id] ?? DEFAULT_HOURS_PER_DAY;
      return acc;
    },
    {} as Record<TeamId, number>
  );
  return {
    id: row.id,
    name: row.name,
    team: row.team,
    course: row.course,
    dueDate: row.due_date,
    memberHoursPerDay,
  };
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    sectionRef: row.section_ref,
    // A data/team.ts TeamId — safe to assume, since only the seed function
    // (controlled by us) writes this column until teammates are real accounts.
    assigneeId: row.assignee_id as TeamId,
    status: row.status,
    completedAt: row.completed_at ?? undefined,
    priority: row.priority,
    dueLabel: row.due_label ?? undefined,
    dueUrgent: row.due_urgent,
    metadata: row.metadata ?? undefined,
    guidance: row.guidance || undefined,
    outline: row.outline && row.outline.length > 0 ? row.outline : undefined,
    effortHours: row.effort_hours ?? undefined,
  };
}

function toRequirement(row: RequirementRow): Requirement {
  return { id: row.id, label: row.label };
}

/** Everything Home/Projects/Chat need for the signed-in user's one project. */
export async function fetchProjectData(ownerId: string): Promise<ProjectData> {
  const { data: projectRow, error: projectError } = await supabase
    .from('projects')
    .select('id, name, team, course, due_date, member_hours_per_day')
    .eq('owner_id', ownerId)
    .limit(1)
    .maybeSingle();
  if (projectError) throw projectError;
  if (!projectRow) {
    return { project: null, tasks: [], requirements: [], taskRequirements: [], taskDependencies: [] };
  }

  const [taskResult, requirementResult] = await Promise.all([
    supabase
      .from('tasks')
      .select(
        'id, title, section_ref, assignee_id, status, completed_at, priority, due_label, due_urgent, metadata, guidance, outline, effort_hours'
      )
      .eq('project_id', projectRow.id)
      .order('position'),
    supabase.from('requirements').select('id, label').eq('project_id', projectRow.id).order('position'),
  ]);
  if (taskResult.error) throw taskResult.error;
  if (requirementResult.error) throw requirementResult.error;

  const taskRows = (taskResult.data ?? []) as TaskRow[];
  const taskIds = taskRows.map((t) => t.id);

  const [{ data: linkRows, error: linkError }, { data: dependencyRows, error: dependencyError }] = taskIds.length
    ? await Promise.all([
        supabase.from('task_requirements').select('task_id, requirement_id').in('task_id', taskIds),
        supabase.from('task_dependencies').select('task_id, depends_on_task_id').in('task_id', taskIds),
      ])
    : [
        { data: [] as TaskRequirementRow[], error: null },
        { data: [] as TaskDependencyRow[], error: null },
      ];
  if (linkError) throw linkError;
  if (dependencyError) throw dependencyError;

  return {
    project: toProject(projectRow),
    tasks: taskRows.map(toTask),
    requirements: (requirementResult.data ?? []).map(toRequirement),
    taskRequirements: (linkRows ?? []).map((l) => ({ taskId: l.task_id, requirementId: l.requirement_id })),
    taskDependencies: (dependencyRows ?? []).map((d) => ({
      taskId: d.task_id,
      dependsOnTaskId: d.depends_on_task_id,
    })),
  };
}

export async function persistTaskStatus(
  taskId: string,
  status: TaskStatus,
  completedAt: string | null
): Promise<void> {
  const { error } = await supabase.from('tasks').update({ status, completed_at: completedAt }).eq('id', taskId);
  if (error) throw error;
}

export async function persistTaskAssignee(taskId: string, assigneeId: TeamId): Promise<void> {
  const { error } = await supabase.from('tasks').update({ assignee_id: assigneeId }).eq('id', taskId);
  if (error) throw error;
}

export async function persistMemberHoursPerDay(
  projectId: string,
  memberHoursPerDay: Record<TeamId, number>
): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({ member_hours_per_day: memberHoursPerDay })
    .eq('id', projectId);
  if (error) throw error;
}

export type NewTaskInput = {
  title: string;
  sectionRef: string;
  assigneeId: TeamId;
  priority: Priority;
  effortHours: number;
  dueLabel?: string;
  position: number;
};

/** Manually added task — no guidance/outline (those are AI-written), starts not_started. */
export async function createTask(projectId: string, input: NewTaskInput): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      project_id: projectId,
      title: input.title,
      section_ref: input.sectionRef,
      assignee_id: input.assigneeId,
      status: 'not_started',
      priority: input.priority,
      effort_hours: input.effortHours,
      due_label: input.dueLabel || null,
      due_urgent: false,
      position: input.position,
    })
    .select(
      'id, title, section_ref, assignee_id, status, completed_at, priority, due_label, due_urgent, metadata, guidance, outline, effort_hours'
    )
    .single();
  if (error) throw error;
  return toTask(data as TaskRow);
}

export type TaskFieldEdits = {
  title: string;
  sectionRef: string;
  priority: Priority;
  effortHours: number;
  dueLabel?: string;
};

/** The fields a person can hand-correct — never guidance/outline (AI-written) or status/assignee (their own dedicated flows). */
export async function updateTaskFields(taskId: string, edits: TaskFieldEdits): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({
      title: edits.title,
      section_ref: edits.sectionRef,
      priority: edits.priority,
      effort_hours: edits.effortHours,
      due_label: edits.dueLabel || null,
    })
    .eq('id', taskId);
  if (error) throw error;
}

/** task_requirements/task_dependencies rows for this task cascade-delete with it. */
export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) throw error;
}

/** Replaces this task's requirement links wholesale — simpler and safer than diffing adds/removes for a multi-select UI. */
export async function setTaskRequirementLinks(taskId: string, requirementIds: string[]): Promise<void> {
  const { error: deleteError } = await supabase.from('task_requirements').delete().eq('task_id', taskId);
  if (deleteError) throw deleteError;
  if (requirementIds.length === 0) return;
  const { error: insertError } = await supabase
    .from('task_requirements')
    .insert(requirementIds.map((requirementId) => ({ task_id: taskId, requirement_id: requirementId })));
  if (insertError) throw insertError;
}

export async function updateRequirementLabel(requirementId: string, label: string): Promise<void> {
  const { error } = await supabase.from('requirements').update({ label }).eq('id', requirementId);
  if (error) throw error;
}

export async function updateProjectDueDate(projectId: string, dueDate: string): Promise<void> {
  const { error } = await supabase.from('projects').update({ due_date: dueDate }).eq('id', projectId);
  if (error) throw error;
}
