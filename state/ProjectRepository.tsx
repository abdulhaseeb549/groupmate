import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { ErrorScreen } from '../components/ErrorScreen';
import { LoadingScreen } from '../components/LoadingScreen';
import { Project } from '../data/project';
import { Requirement } from '../data/requirements';
import { Task } from '../data/tasks';
import { TaskRequirement } from '../data/taskRequirements';
import { TaskDependency } from '../data/taskDependencies';
import { TeamId } from '../data/team';
import { useAuth } from './AuthProvider';
import { deriveProjectState, ProjectState } from './projectState';
import { computeSchedule, ProjectSchedule } from './projectSchedule';
import {
  fetchProjectData,
  persistMemberHoursPerDay,
  persistTaskAssignee,
  persistTaskDone,
} from './projectQueries';

type ProjectRepository = {
  project: Project;
  tasks: Task[];
  requirements: Requirement[];
  taskDependencies: TaskDependency[];
  projectState: ProjectState;
  schedule: ProjectSchedule;
  toggleTaskDone: (taskId: string) => void;
  reassignTask: (taskId: string, memberId: TeamId) => void;
  updateMemberHoursPerDay: (memberId: TeamId, hoursPerDay: number) => void;
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
  requirements,
  taskRequirements,
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

  const projectState = useMemo(
    () => deriveProjectState(tasks, requirements, taskRequirements, project, new Date()),
    [tasks, requirements, taskRequirements, project]
  );

  const schedule = useMemo(
    () => computeSchedule(tasks, taskDependencies, project.memberHoursPerDay, project.dueDate, new Date()),
    [tasks, taskDependencies, project]
  );

  function toggleTaskDone(taskId: string) {
    const current = tasks.find((t) => t.id === taskId);
    if (!current) return;
    const nextDone = !current.done;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, done: nextDone } : t)));
    // Fire-and-forget: this prototype has no offline queue yet, so a failed
    // write just leaves the local state out of sync with the database until
    // the next reload, rather than silently reverting mid-interaction.
    void persistTaskDone(taskId, nextDone);
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

  const value: ProjectRepository = {
    project,
    tasks,
    requirements,
    taskDependencies,
    projectState,
    schedule,
    toggleTaskDone,
    reassignTask,
    updateMemberHoursPerDay,
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
