import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { ErrorScreen } from '../components/ErrorScreen';
import { LoadingScreen } from '../components/LoadingScreen';
import { Project } from '../data/project';
import { Requirement } from '../data/requirements';
import { Priority, Task, TaskStatus } from '../data/tasks';
import { TaskRequirement } from '../data/taskRequirements';
import { TaskDependency } from '../data/taskDependencies';
import { TeamId } from '../data/team';
import { useAuth } from './AuthProvider';
import { deriveProjectState, ProjectState } from './projectState';
import { computeSchedule, ProjectSchedule } from './projectSchedule';
import {
  createTask,
  deleteTask,
  fetchProjectData,
  persistMemberHoursPerDay,
  persistTaskAssignee,
  persistTaskStatus,
  setTaskRequirementLinks,
  updateProjectDueDate,
  updateRequirementLabel,
  updateTaskFields,
} from './projectQueries';

export type NewTaskFields = {
  title: string;
  sectionRef: string;
  assigneeId: TeamId;
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
  projectState: ProjectState;
  schedule: ProjectSchedule;
  setTaskStatus: (taskId: string, status: TaskStatus) => void;
  reassignTask: (taskId: string, memberId: TeamId) => void;
  updateMemberHoursPerDay: (memberId: TeamId, hoursPerDay: number) => void;
  addTask: (fields: NewTaskFields) => Promise<{ error: string | null }>;
  updateTask: (taskId: string, edits: TaskEdits) => Promise<{ error: string | null }>;
  removeTask: (taskId: string) => void;
  renameRequirement: (requirementId: string, label: string) => void;
  updateDueDate: (dueDate: string) => void;
  /** Re-fetches from Supabase — used both by the error screen's retry and after replacing the project (e.g. from a new brief). */
  refetch: () => void;
};

const ProjectContext = createContext<ProjectRepository | null>(null);

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      project: Project;
      tasks: Task[];
      requirements: Requirement[];
      taskRequirements: TaskRequirement[];
      taskDependencies: TaskDependency[];
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
          // Shouldn't happen — the signup trigger seeds a project in the
          // same transaction — but a stale account from before that
          // migration existed could hit this.
          setState({ status: 'error', message: "We couldn't find your project. Try signing out and back in." });
          return;
        }
        setState({
          status: 'ready',
          project: data.project,
          tasks: data.tasks,
          requirements: data.requirements,
          taskRequirements: data.taskRequirements,
          taskDependencies: data.taskDependencies,
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

  return (
    <ProjectProviderReady
      project={state.project}
      initialTasks={state.tasks}
      requirements={state.requirements}
      taskRequirements={state.taskRequirements}
      taskDependencies={state.taskDependencies}
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
  refetch,
  children,
}: {
  project: Project;
  initialTasks: Task[];
  requirements: Requirement[];
  taskRequirements: TaskRequirement[];
  taskDependencies: TaskDependency[];
  refetch: () => void;
  children: ReactNode;
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [project, setProject] = useState<Project>(initialProject);
  const [requirements, setRequirements] = useState<Requirement[]>(initialRequirements);
  const [taskRequirements, setTaskRequirements] = useState<TaskRequirement[]>(initialTaskRequirements);

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

  function reassignTask(taskId: string, memberId: TeamId) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, assigneeId: memberId } : t)));
    void persistTaskAssignee(taskId, memberId);
  }

  function updateMemberHoursPerDay(memberId: TeamId, hoursPerDay: number) {
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

  const value: ProjectRepository = {
    project,
    tasks,
    requirements,
    taskRequirements,
    taskDependencies,
    projectState,
    schedule,
    setTaskStatus,
    reassignTask,
    updateMemberHoursPerDay,
    addTask,
    updateTask,
    removeTask,
    renameRequirement,
    updateDueDate,
    refetch,
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectRepository {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProject() must be called within a ProjectProvider');
  }
  return ctx;
}
