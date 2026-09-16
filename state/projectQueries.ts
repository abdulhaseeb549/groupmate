import { supabase } from '../lib/supabase';
import { Project } from '../data/project';
import { Priority, Task, TaskStatus } from '../data/tasks';
import { Requirement } from '../data/requirements';
import { TaskRequirement } from '../data/taskRequirements';
import { TaskDependency } from '../data/taskDependencies';
import { Member } from '../data/member';

type ProjectRow = {
  id: string;
  name: string;
  team: string;
  course: string;
  due_date: string;
  member_hours_per_day: Record<string, number> | null;
  invite_code: string;
};

type TaskRow = {
  id: string;
  title: string;
  section_ref: string;
  assignee_id: string | null;
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

type MemberRow = {
  user_id: string;
  role: 'owner' | 'member';
};

type ProfileRow = {
  id: string;
  full_name: string;
  initials: string;
  avatar_bg: string;
  avatar_fg: string;
};

export type ProjectData = {
  /** Null only if a signed-in user somehow has no seeded project yet — see the migration's seed_demo_project(). */
  project: Project | null;
  tasks: Task[];
  requirements: Requirement[];
  taskRequirements: TaskRequirement[];
  taskDependencies: TaskDependency[];
  members: Member[];
};

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    team: row.team,
    course: row.course,
    dueDate: row.due_date,
    // Every read site falls back to a default on its own when a given
    // member has no entry yet, so this is passed through as-is rather than
    // pre-filled against a fixed roster that no longer exists.
    memberHoursPerDay: row.member_hours_per_day ?? {},
    inviteCode: row.invite_code,
  };
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    sectionRef: row.section_ref,
    assigneeId: row.assignee_id,
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

/** Everything Home/Projects need for the signed-in user's one project. */
export async function fetchProjectData(userId: string): Promise<ProjectData> {
  // Looked up via project_members, not projects.owner_id: since migration
  // 0011, a user can be a member of a project they didn't create (joined
  // via invite code) and owns no project row at all — owner_id would find
  // nothing for them.
  const { data: membershipRow, error: membershipError } = await supabase
    .from('project_members')
    .select('project_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membershipRow) {
    return { project: null, tasks: [], requirements: [], taskRequirements: [], taskDependencies: [], members: [] };
  }

  const { data: projectRow, error: projectError } = await supabase
    .from('projects')
    .select('id, name, team, course, due_date, member_hours_per_day, invite_code')
    .eq('id', membershipRow.project_id)
    .maybeSingle();
  if (projectError) throw projectError;
  if (!projectRow) {
    return { project: null, tasks: [], requirements: [], taskRequirements: [], taskDependencies: [], members: [] };
  }

  const [taskResult, requirementResult, memberResult] = await Promise.all([
    supabase
      .from('tasks')
      .select(
        'id, title, section_ref, assignee_id, status, completed_at, priority, due_label, due_urgent, metadata, guidance, outline, effort_hours'
      )
      .eq('project_id', projectRow.id)
      .order('position'),
    supabase.from('requirements').select('id, label').eq('project_id', projectRow.id).order('position'),
    supabase.from('project_members').select('user_id, role').eq('project_id', projectRow.id).order('joined_at'),
  ]);
  if (taskResult.error) throw taskResult.error;
  if (requirementResult.error) throw requirementResult.error;
  if (memberResult.error) throw memberResult.error;

  const taskRows = (taskResult.data ?? []) as TaskRow[];
  const taskIds = taskRows.map((t) => t.id);
  const memberRows = (memberResult.data ?? []) as MemberRow[];

  // project_members.user_id and profiles.id are parallel FKs to auth.users,
  // not to each other, so PostgREST can't embed profiles off project_members
  // in one query — fetched separately and joined here, same as
  // task_requirements/task_dependencies below.
  const [
    { data: linkRows, error: linkError },
    { data: dependencyRows, error: dependencyError },
    { data: profileRows, error: profileError },
  ] = await Promise.all([
    taskIds.length
      ? supabase.from('task_requirements').select('task_id, requirement_id').in('task_id', taskIds)
      : Promise.resolve({ data: [] as TaskRequirementRow[], error: null }),
    taskIds.length
      ? supabase.from('task_dependencies').select('task_id, depends_on_task_id').in('task_id', taskIds)
      : Promise.resolve({ data: [] as TaskDependencyRow[], error: null }),
    memberRows.length
      ? supabase
          .from('profiles')
          .select('id, full_name, initials, avatar_bg, avatar_fg')
          .in(
            'id',
            memberRows.map((m) => m.user_id)
          )
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
  ]);
  if (linkError) throw linkError;
  if (dependencyError) throw dependencyError;
  if (profileError) throw profileError;

  const profileById = new Map((profileRows ?? []).map((p) => [p.id, p as ProfileRow]));
  const members: Member[] = memberRows
    .map((m) => {
      const profile = profileById.get(m.user_id);
      if (!profile) return null;
      return {
        id: profile.id,
        initials: profile.initials,
        name: profile.full_name,
        bg: profile.avatar_bg,
        fg: profile.avatar_fg,
        role: m.role,
      };
    })
    .filter((m): m is Member => m !== null);

  return {
    project: toProject(projectRow),
    tasks: taskRows.map(toTask),
    requirements: (requirementResult.data ?? []).map(toRequirement),
    taskRequirements: (linkRows ?? []).map((l) => ({ taskId: l.task_id, requirementId: l.requirement_id })),
    taskDependencies: (dependencyRows ?? []).map((d) => ({
      taskId: d.task_id,
      dependsOnTaskId: d.depends_on_task_id,
    })),
    members,
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

export async function persistTaskAssignee(taskId: string, assigneeId: string | null): Promise<void> {
  const { error } = await supabase.from('tasks').update({ assignee_id: assigneeId }).eq('id', taskId);
  if (error) throw error;
}

export async function persistMemberHoursPerDay(
  projectId: string,
  memberHoursPerDay: Record<string, number>
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
  assigneeId: string | null;
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

/** Invalidates the project's current invite code and returns the new one — anyone still holding the old code can no longer use it to join. */
export async function regenerateInviteCode(projectId: string): Promise<string> {
  const { data, error } = await supabase.rpc('regenerate_invite_code', { target_project_id: projectId });
  if (error) throw error;
  return data as string;
}

/**
 * Joins the signed-in user to a project by its invite code — the
 * onboarding screen's "Join a project" flow, for an already-authenticated
 * user (see migration 0016's join_project_by_code, the signed-in-user
 * counterpart to handle_new_user's signup-time join branch). Throws with
 * the RPC's own message on a bad code.
 */
export async function joinProjectByCode(code: string): Promise<{ projectName: string }> {
  const { data, error } = await supabase.rpc('join_project_by_code', { code });
  if (error) throw error;
  const projectName = data?.[0]?.project_name as string | undefined;
  if (!projectName) throw new Error('No project uses that code.');
  return { projectName };
}

export type TaskChangeEvent = { type: 'upsert'; task: Task } | { type: 'delete'; taskId: string };

/**
 * Live task updates from other clients — keeps a shared project's task
 * list in sync (someone else claiming or editing a task) without a manual
 * refetch. Requires `tasks` to be in the supabase_realtime publication
 * (migration 0012). Returns an unsubscribe function. Echoes this client's
 * own writes back too (Realtime broadcasts every change to every
 * subscriber, including the one that made it) — harmless, since merging
 * the server row back in is idempotent.
 */
export function subscribeToTaskChanges(projectId: string, onChange: (event: TaskChangeEvent) => void): () => void {
  const channel = supabase
    .channel(`project:${projectId}:tasks`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          onChange({ type: 'delete', taskId: (payload.old as { id: string }).id });
          return;
        }
        onChange({ type: 'upsert', task: toTask(payload.new as TaskRow) });
      }
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * One roster entry, resolved the way fetchProjectData resolves the whole
 * list — project_members for the role, profiles for the identity, joined
 * client-side because the two are parallel FKs to auth.users rather than
 * to each other. Null if either half isn't readable yet.
 */
export async function fetchMember(projectId: string, userId: string): Promise<Member | null> {
  const [{ data: memberRow, error: memberError }, { data: profileRow, error: profileError }] = await Promise.all([
    supabase
      .from('project_members')
      .select('user_id, role')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('id, full_name, initials, avatar_bg, avatar_fg')
      .eq('id', userId)
      .maybeSingle(),
  ]);
  if (memberError) throw memberError;
  if (profileError) throw profileError;
  if (!memberRow || !profileRow) return null;

  const profile = profileRow as ProfileRow;
  return {
    id: profile.id,
    initials: profile.initials,
    name: profile.full_name,
    bg: profile.avatar_bg,
    fg: profile.avatar_fg,
    role: (memberRow as MemberRow).role,
  };
}

/**
 * Live roster updates — the counterpart to subscribeToTaskChanges, added
 * with migration 0017 because its absence was the single cause of two
 * separate-looking bugs: a teammate joining showed up nowhere, and their
 * direct message had no thread to land in (the chat list builds one DM row
 * per known member, so an unknown sender is an unreachable conversation).
 *
 * The INSERT payload carries only project_members' own columns, so the
 * joiner's identity needs a follow-up read. That read is retried once: the
 * membership row and the profiles row become visible to this client
 * independently, and losing a join to a few hundred milliseconds of skew
 * would resurrect the exact bug this subscription exists to fix.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToMemberChanges(
  projectId: string,
  onJoin: (member: Member) => void,
  onLeave?: (userId: string) => void
): () => void {
  async function resolveJoin(userId: string) {
    for (const delayMs of [0, 800]) {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      try {
        const member = await fetchMember(projectId, userId);
        if (member) {
          onJoin(member);
          return;
        }
      } catch {
        // Fall through to the retry; a hard failure just leaves this client
        // on the roster it already has until its next full refetch.
      }
    }
  }

  const channel = supabase
    .channel(`project:${projectId}:members`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'project_members', filter: `project_id=eq.${projectId}` },
      (payload) => {
        void resolveJoin((payload.new as MemberRow).user_id);
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'project_members', filter: `project_id=eq.${projectId}` },
      (payload) => onLeave?.((payload.old as MemberRow).user_id)
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export type ClaimResult = 'claimed' | 'already_claimed';

/**
 * Atomic compare-and-swap: only succeeds if the task is still unclaimed at
 * the moment Postgres applies the UPDATE. .select() (not .single()) turns
 * this into a row-count check instead of an error — PostgREST returns
 * whatever rows the UPDATE actually matched, so an empty array is real
 * information ("someone else already got there"), not a missing-row error.
 * This is what makes claiming safe under a genuine race: two simultaneous
 * claims can't both match the same WHERE, Postgres's row locking serializes
 * them, and only the first sees a matched row.
 */
export async function claimTask(taskId: string, userId: string): Promise<ClaimResult> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ assignee_id: userId })
    .eq('id', taskId)
    .is('assignee_id', null)
    .select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0 ? 'claimed' : 'already_claimed';
}
