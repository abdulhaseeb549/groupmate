import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { ErrorScreen } from '../components/ErrorScreen';
import { LoadingScreen } from '../components/LoadingScreen';
import { MemberJoinedToast } from '../components/MemberJoinedToast';
import { Member } from '../data/member';
import { Project } from '../data/project';
import { Requirement } from '../data/requirements';
import { Priority, Task, TaskStatus } from '../data/tasks';
import { TaskRequirement } from '../data/taskRequirements';
import { TaskDependency } from '../data/taskDependencies';
import { NoProjectShell } from '../screens/NoProjectShell';
import { useAuth } from './AuthProvider';
import { ChatUnreadProvider } from './chatUnread';
import { useNavigation } from './NavigationProvider';
import { deriveProjectState, ProjectState } from './projectState';
import { computeSchedule, ProjectSchedule } from './projectSchedule';
import {
  claimTask as claimTaskQuery,
  createTask,
  deleteTask,
  fetchProjectData,
  persistMemberHoursPerDay,
  persistTaskAssignee,
  persistTaskStatus,
  regenerateInviteCode,
  setTaskRequirementLinks,
  subscribeToMemberChanges,
  subscribeToTaskChanges,
  updateProjectDueDate,
  updateRequirementLabel,
  updateTaskFields,
} from './projectQueries';

export type NewTaskFields = {
  title: string;
  sectionRef: string;
  assigneeId: string | null;
  priority: Priority;
  effortHours: number;
  dueLabel?: string;
  requirementIds: string[];
};

export type TaskEdits = {
  title: string;
  sectionRef: string;
  priority: Priority;
  effortHours: number;
  dueLabel?: string;
  requirementIds: string[];
};

type ProjectRepository = {
  project: Project;
  tasks: Task[];
  requirements: Requirement[];
  taskRequirements: TaskRequirement[];
  taskDependencies: TaskDependency[];
  members: Member[];
  membersById: Record<string, Member>;
  projectState: ProjectState;
  schedule: ProjectSchedule;
  setTaskStatus: (taskId: string, status: TaskStatus) => void;
  reassignTask: (taskId: string, memberId: string | null) => void;
  /** Atomic first-claim-wins on an unclaimed task — distinct from reassignTask, which never checks capacity or current assignee. */
  claimTask: (taskId: string) => Promise<{ error: string | null }>;
  updateMemberHoursPerDay: (memberId: string, hoursPerDay: number) => void;
  addTask: (fields: NewTaskFields) => Promise<{ error: string | null }>;
  updateTask: (taskId: string, edits: TaskEdits) => Promise<{ error: string | null }>;
  removeTask: (taskId: string) => void;
  renameRequirement: (requirementId: string, label: string) => void;
  updateDueDate: (dueDate: string) => void;
  regenerateInviteCode: () => Promise<{ error: string | null }>;
  /** Re-fetches from Supabase — used both by the error screen's retry and after replacing the project (e.g. from a new brief). */
  refetch: () => void;
};

const ProjectContext = createContext<ProjectRepository | null>(null);

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'no_project' }
  | {
      status: 'ready';
      project: Project;
      tasks: Task[];
      requirements: Requirement[];
      taskRequirements: TaskRequirement[];
      taskDependencies: TaskDependency[];
      members: Member[];
    };

/**
 * Owns the signed-in user's project data. Fetches it from Supabase once a
 * session exists, then hands off to ProjectProviderReady, which is the one
 * place allowed to hold it as mutable state and persist changes back —
 * everything else goes through `useProject()`.
 */
export function ProjectProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setState({ status: 'loading' });

    fetchProjectData(userId)
      .then((data) => {
        if (cancelled) return;
        if (!data.project) {
          // The normal steady-state for a fresh signup with no invite code
          // (see migration 0016) — signup no longer auto-seeds a project,
          // so this is a real "nothing yet", not a broken account.
          setState({ status: 'no_project' });
          return;
        }
        setState({
          status: 'ready',
          project: data.project,
          tasks: data.tasks,
          requirements: data.requirements,
          taskRequirements: data.taskRequirements,
          taskDependencies: data.taskDependencies,
          members: data.members,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Could not load your project.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, [userId, retryCount]);

  const refetch = () => setRetryCount((n) => n + 1);

  if (state.status === 'loading') {
    return <LoadingScreen />;
  }
  if (state.status === 'error') {
    return <ErrorScreen message={state.message} onRetry={refetch} />;
  }
  if (state.status === 'no_project') {
    return <NoProjectShell onDone={refetch} />;
  }

  return (
    <ProjectProviderReady
      project={state.project}
      initialTasks={state.tasks}
      requirements={state.requirements}
      taskRequirements={state.taskRequirements}
      taskDependencies={state.taskDependencies}
      members={state.members}
      refetch={refetch}
    >
      {children}
    </ProjectProviderReady>
  );
}

function ProjectProviderReady({
  project: initialProject,
  initialTasks,
  requirements: initialRequirements,
  taskRequirements: initialTaskRequirements,
  taskDependencies,
  members: initialMembers,
  refetch,
  children,
}: {
  project: Project;
  initialTasks: Task[];
  requirements: Requirement[];
  taskRequirements: TaskRequirement[];
  taskDependencies: TaskDependency[];
  members: Member[];
  refetch: () => void;
  children: ReactNode;
}) {
  const { session } = useAuth();
  const { goToChat } = useNavigation();
  const userId = session?.user.id;
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [project, setProject] = useState<Project>(initialProject);
  const [requirements, setRequirements] = useState<Requirement[]>(initialRequirements);
  const [taskRequirements, setTaskRequirements] = useState<TaskRequirement[]>(initialTaskRequirements);
  const [members, setMembers] = useState<Member[]>(initialMembers);
  // Who arrived while the app was open. This is the only signal a join
  // produces — without it, someone joining is completely silent.
  const [justJoined, setJustJoined] = useState<Member | null>(null);

  const membersById = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m])) as Record<string, Member>,
    [members]
  );

  // Keeps `tasks` live across every screen (not just chat) when a
  // teammate claims, reassigns, or edits a task elsewhere — without this,
  // "someone claimed it" would only ever show up after a manual refetch.
  useEffect(() => {
    const unsubscribe = subscribeToTaskChanges(project.id, (event) => {
      if (event.type === 'delete') {
        setTasks((prev) => prev.filter((t) => t.id !== event.taskId));
        return;
      }
      setTasks((prev) => {
        const exists = prev.some((t) => t.id === event.task.id);
        return exists ? prev.map((t) => (t.id === event.task.id ? event.task : t)) : [...prev, event.task];
      });
    });
    return unsubscribe;
  }, [project.id]);

  // The roster used to be fetched once and never again, which was the one
  // cause behind two different-looking bugs: a teammate joining showed up
  // nowhere, and their direct message was unreachable — ChatListScreen
  // derives a DM row per known member, so a sender missing from this array
  // has no thread to appear in, however readable their message is (0013).
  // Needs project_members in the Realtime publication (migration 0017).
  useEffect(() => {
    const unsubscribe = subscribeToMemberChanges(
      project.id,
      (member) => {
        setMembers((prev) => {
          if (prev.some((m) => m.id === member.id)) return prev;
          // Announce only genuinely new arrivals, so a reconnect that
          // replays an existing row doesn't re-toast someone.
          setJustJoined(member);
          return [...prev, member];
        });
      },
      (departedUserId) => setMembers((prev) => prev.filter((m) => m.id !== departedUserId))
    );
    return unsubscribe;
  }, [project.id]);

  const projectState = useMemo(
    () => deriveProjectState(tasks, requirements, taskRequirements, project, new Date()),
    [tasks, requirements, taskRequirements, project]
  );

  const schedule = useMemo(
    () => computeSchedule(tasks, taskDependencies, project.memberHoursPerDay, project.dueDate, new Date()),
    [tasks, taskDependencies, project]
  );

  function setTaskStatus(taskId: string, status: TaskStatus) {
    const completedAt = status === 'completed' ? new Date().toISOString() : null;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status, completedAt: completedAt ?? undefined } : t)));
    // Fire-and-forget: this prototype has no offline queue yet, so a failed
    // write just leaves the local state out of sync with the database until
    // the next reload, rather than silently reverting mid-interaction.
    void persistTaskStatus(taskId, status, completedAt);
  }

  function reassignTask(taskId: string, memberId: string | null) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, assigneeId: memberId } : t)));
    void persistTaskAssignee(taskId, memberId);
  }

  // A genuinely different shape from every setter above: this can lose a
  // real race (someone else claims the same task first), and that outcome
  // is 200-with-zero-rows, not an exception — so it needs a three-way
  // result instead of firing-and-forgetting an optimistic update.
  async function claimTaskAction(taskId: string): Promise<{ error: string | null }> {
    if (!userId) return { error: 'Not signed in.' };
    try {
      const result = await claimTaskQuery(taskId, userId);
      if (result === 'already_claimed') {
        // Resync this task from the server so the UI shows who actually
        // has it now, instead of leaving a stale "still open" state.
        refetch();
        return { error: 'Someone already claimed this task.' };
      }
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, assigneeId: userId } : t)));
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Could not claim this task.' };
    }
  }

  function updateMemberHoursPerDay(memberId: string, hoursPerDay: number) {
    const next = { ...project.memberHoursPerDay, [memberId]: hoursPerDay };
    setProject((prev) => ({ ...prev, memberHoursPerDay: next }));
    void persistMemberHoursPerDay(project.id, next);
  }

  // Awaited (not fire-and-forget) unlike the setters above: there's no
  // client-side id to add optimistically until the insert actually returns
  // one, so the calling form owns its own loading state instead.
  async function addTask(fields: NewTaskFields): Promise<{ error: string | null }> {
    try {
      const created = await createTask(project.id, {
        title: fields.title,
        sectionRef: fields.sectionRef,
        assigneeId: fields.assigneeId,
        priority: fields.priority,
        effortHours: fields.effortHours,
        dueLabel: fields.dueLabel,
        position: tasks.length + 1,
      });
      if (fields.requirementIds.length > 0) {
        await setTaskRequirementLinks(created.id, fields.requirementIds);
      }
      setTasks((prev) => [...prev, created]);
      setTaskRequirements((prev) => [
        ...prev,
        ...fields.requirementIds.map((requirementId) => ({ taskId: created.id, requirementId })),
      ]);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Could not create this task.' };
    }
  }

  async function updateTask(taskId: string, edits: TaskEdits): Promise<{ error: string | null }> {
    try {
      await updateTaskFields(taskId, {
        title: edits.title,
        sectionRef: edits.sectionRef,
        priority: edits.priority,
        effortHours: edits.effortHours,
        dueLabel: edits.dueLabel,
      });
      await setTaskRequirementLinks(taskId, edits.requirementIds);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                title: edits.title,
                sectionRef: edits.sectionRef,
                priority: edits.priority,
                effortHours: edits.effortHours,
                dueLabel: edits.dueLabel,
              }
            : t
        )
      );
      setTaskRequirements((prev) => [
        ...prev.filter((tr) => tr.taskId !== taskId),
        ...edits.requirementIds.map((requirementId) => ({ taskId, requirementId })),
      ]);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Could not save these changes.' };
    }
  }

  function removeTask(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setTaskRequirements((prev) => prev.filter((tr) => tr.taskId !== taskId));
    void deleteTask(taskId);
  }

  function renameRequirement(requirementId: string, label: string) {
    setRequirements((prev) => prev.map((r) => (r.id === requirementId ? { ...r, label } : r)));
    void updateRequirementLabel(requirementId, label);
  }

  function updateDueDate(dueDate: string) {
    setProject((prev) => ({ ...prev, dueDate }));
    void updateProjectDueDate(project.id, dueDate);
  }

  // Awaited, not optimistic: the new code is server-generated, there's
  // nothing to show locally until the RPC actually returns it.
  async function regenerateInviteCodeAction(): Promise<{ error: string | null }> {
    try {
      const inviteCode = await regenerateInviteCode(project.id);
      setProject((prev) => ({ ...prev, inviteCode }));
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Could not generate a new code.' };
    }
  }

  const value: ProjectRepository = {
    project,
    tasks,
    requirements,
    taskRequirements,
    taskDependencies,
    members,
    membersById,
    projectState,
    schedule,
    setTaskStatus,
    reassignTask,
    claimTask: claimTaskAction,
    updateMemberHoursPerDay,
    addTask,
    updateTask,
    removeTask,
    renameRequirement,
    updateDueDate,
    regenerateInviteCode: regenerateInviteCodeAction,
    refetch,
  };

  return (
    <ProjectContext.Provider value={value}>
      <ChatUnreadProvider projectId={project.id} userId={userId}>
        {/* Wrapping view, not a fragment: the toast positions absolutely and
            needs a full-height parent it can anchor to from any screen. */}
        <View style={{ flex: 1 }}>
          {children}
          <MemberJoinedToast
            member={justJoined}
            onDismiss={() => setJustJoined(null)}
            onOpenChat={(member) => goToChat({ type: 'dm', otherUserId: member.id })}
          />
        </View>
      </ChatUnreadProvider>
    </ProjectContext.Provider>
  );
}

/**
 * The same context without the throw — for components that legitimately
 * render both inside a project and before one exists (the bottom nav and
 * its "+" menu appear on every screen, including the no-project shell).
 */
export function useOptionalProject(): ProjectRepository | null {
  return useContext(ProjectContext);
}

export function useProject(): ProjectRepository {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProject() must be called within a ProjectProvider');
  }
  return ctx;
}
