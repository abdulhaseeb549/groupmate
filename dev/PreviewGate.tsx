import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { NavTab } from '../components/BottomNav';
import { ChatTab } from '../screens/ChatTab';
import { HomeScreen } from '../screens/HomeScreen';
import { ProjectsScreen } from '../screens/ProjectsScreen';
import { StudyScreen } from '../screens/StudyScreen';
import { AuthContext } from '../state/AuthProvider';
import { NavigationProvider, useNavigation } from '../state/NavigationProvider';
import { ProjectContext } from '../state/ProjectRepository';
import { computeSchedule } from '../state/projectSchedule';
import { deriveProjectState } from '../state/projectState';
import {
  PREVIEW_USER_ID,
  previewMembers,
  previewProject,
  previewRequirements,
  previewTaskDependencies,
  previewTaskRequirements,
  previewTasks,
} from './previewFixtures';

/**
 * Renders the real screens against fixtures, with no network and no session.
 *
 * Exists because the one check this project genuinely could not do was
 * "look at a screen that requires an account" — and the alternative on offer
 * was handing over a password, which is not a thing to do with a password.
 * This covers what that would have covered for layout and typography: the
 * hero, the chat list, the activity sheet, anything behind a project.
 *
 * What it deliberately does not cover: anything that has to actually happen.
 * Realtime delivery, RLS, whether a write lands — those need a real session
 * and a real device, and a fixture that pretended otherwise would be worse
 * than no fixture, because it would look like proof.
 *
 * Reached only through DEV_PREVIEW in App.tsx, which is __DEV__-gated, so
 * none of this is reachable in a release build.
 */
export function PreviewGate() {
  return (
    <AuthContext.Provider value={FAKE_AUTH}>
      <NavigationProvider>
        <FakeProject />
      </NavigationProvider>
    </AuthContext.Provider>
  );
}

const FAKE_AUTH: any = {
  session: { user: { id: PREVIEW_USER_ID, email: 'preview@groupmate.local' } },
  profile: {
    id: PREVIEW_USER_ID,
    fullName: 'Sk Rahman',
    initials: 'SK',
    avatarBg: '#EDE7FF',
    avatarFg: '#6D4AFF',
  },
  signUp: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  signInWithGoogle: async () => ({ error: null }),
  signOut: async () => {},
};

function FakeProject() {
  const [tasks, setTasks] = useState(previewTasks);
  const today = useMemo(() => new Date(), []);

  // The real derivations, not hand-written state: a screen that looks right
  // against numbers the engine would never produce has proved nothing.
  const projectState = useMemo(
    () => deriveProjectState(tasks, previewRequirements, previewTaskRequirements, previewProject, today),
    [tasks, today]
  );
  const schedule = useMemo(
    () =>
      computeSchedule(
        tasks,
        previewTaskDependencies,
        previewProject.memberHoursPerDay,
        previewProject.dueDate,
        today
      ),
    [tasks, today]
  );

  const value: any = {
    project: previewProject,
    tasks,
    requirements: previewRequirements,
    taskRequirements: previewTaskRequirements,
    taskDependencies: previewTaskDependencies,
    members: previewMembers,
    membersById: Object.fromEntries(previewMembers.map((m) => [m.id, m])),
    projectState,
    schedule,
    // Local-only so the UI still responds to interaction; nothing persists.
    setTaskStatus: (taskId: string, status: any) =>
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t))),
    reassignTask: (taskId: string, memberId: string | null) =>
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, assigneeId: memberId } : t))),
    claimTask: async (taskId: string) => {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, assigneeId: PREVIEW_USER_ID } : t)));
      return { error: null };
    },
    updateMemberHoursPerDay: () => {},
    addTask: async () => ({ error: null }),
    updateTask: async () => ({ error: null }),
    removeTask: (taskId: string) => setTasks((prev) => prev.filter((t) => t.id !== taskId)),
    renameRequirement: () => {},
    updateDueDate: () => {},
    regenerateInviteCode: async () => ({ error: null }),
    refetch: () => {},
    projects: [
      {
        id: previewProject.id,
        name: previewProject.name,
        course: previewProject.course,
        dueDate: previewProject.dueDate,
        role: 'owner' as const,
        memberCount: previewMembers.length,
      },
      {
        id: 'preview-other',
        name: 'Marketing Case Study',
        course: 'BUS110',
        dueDate: previewProject.dueDate,
        role: 'member' as const,
        memberCount: 4,
      },
    ],
    switchProject: () => {},
  };

  return (
    <ProjectContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        <Tabs />
      </View>
    </ProjectContext.Provider>
  );
}

/** Mirrors App.tsx's ProjectTabs, minus the new-project flow it has no data for. */
function Tabs() {
  const { activeTab, setActiveTab } = useNavigation();
  const props = { activeTab, onSelectTab: setActiveTab as (t: NavTab) => void };

  if (activeTab === 'projects') return <ProjectsScreen {...props} />;
  if (activeTab === 'chat') return <ChatTab {...props} />;
  if (activeTab === 'study') return <StudyScreen {...props} />;
  return <HomeScreen {...props} />;
}

