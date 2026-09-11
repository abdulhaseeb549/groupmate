import { supabase } from '../lib/supabase';
import { Project } from '../data/project';
import { Priority, Task } from '../data/tasks';
import { Requirement } from '../data/requirements';
import { TaskRequirement } from '../data/taskRequirements';
import { TaskDependency } from '../data/taskDependencies';
import { TeamId } from '../data/team';

type ProjectRow = {
  id: string;
  name: string;
  team: string;
  course: string;
  due_date: string;
};

type TaskRow = {
  id: string;
  title: string;
  section_ref: string;
  assignee_id: string;
  done: boolean;
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

function toProject(row: ProjectRow): Project {
  return { id: row.id, name: row.name, team: row.team, course: row.course, dueDate: row.due_date };
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    sectionRef: row.section_ref,
    // A data/team.ts TeamId — safe to assume, since only the seed function
    // (controlled by us) writes this column until teammates are real accounts.
    assigneeId: row.assignee_id as TeamId,
    done: row.done,
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
    .select('id, name, team, course, due_date')
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
        'id, title, section_ref, assignee_id, done, priority, due_label, due_urgent, metadata, guidance, outline, effort_hours'
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

export async function persistTaskDone(taskId: string, done: boolean): Promise<void> {
  const { error } = await supabase.from('tasks').update({ done }).eq('id', taskId);
  if (error) throw error;
}

export async function persistTaskAssignee(taskId: string, assigneeId: TeamId): Promise<void> {
  const { error } = await supabase.from('tasks').update({ assignee_id: assigneeId }).eq('id', taskId);
  if (error) throw error;
}
