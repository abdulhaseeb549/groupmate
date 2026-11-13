import { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from '@expo-google-fonts/manrope';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoadingScreen } from './components/LoadingScreen';
import { PushNotificationRegistrar } from './components/PushNotificationRegistrar';
import { PreviewGate } from './dev/PreviewGate';
import { isSupabaseConfigured } from './lib/supabase';
import { AuthScreen } from './screens/AuthScreen';
import { ChatTab } from './screens/ChatTab';
import { HomeScreen } from './screens/HomeScreen';
import { NewProjectScreen } from './screens/NewProjectScreen';
import { JoinProjectFlow } from './screens/OnboardingScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { ResetPasswordScreen } from './screens/ResetPasswordScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SetupNeededScreen } from './screens/SetupNeededScreen';
import { StudyScreen } from './screens/StudyScreen';
import { AuthProvider, useAuth } from './state/AuthProvider';
import { NavigationProvider, useNavigation } from './state/NavigationProvider';
import { ProjectProvider, useProject } from './state/ProjectRepository';
import { DeadlinesProvider } from './state/deadlines';
import { AddDeadlineFlow } from './components/deadlines/AddDeadlineFlow';
import { useIncomingPasswordRecovery } from './utils/passwordRecovery';
import { useIncomingInviteCode } from './utils/inviteLink';
import { useHardwareBackHandler } from './utils/hardwareBack';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  colors,
  displayFonts,
} from './theme';

// Flip to true in a dev build to render the real screens against fixtures
// (dev/PreviewGate) instead of signing in — for checking layout and type on
// screens that sit behind a project. __DEV__ is false in release builds, so
// the branch below is dead code there regardless of this flag.
const DEV_PREVIEW = false;

function AppShell() {
  if (__DEV__ && DEV_PREVIEW) {
    return <PreviewGate />;
  }

  const { session } = useAuth();
  const recovery = useIncomingPasswordRecovery();

  // Checked before the normal session split: tapping a reset-password
  // email link usually establishes a real session, but landing straight
  // in Home with it would skip the one thing that link was for, and
  // landing on the sign-in form would strand someone who just proved
  // account ownership via email.
  if (recovery.state !== 'idle') {
    return <ResetPasswordScreen status={recovery} onDone={recovery.reset} />;
  }

  // undefined = the first getSession() call hasn't resolved yet.
  if (session === undefined) {
    return <LoadingScreen />;
  }

  if (session === null) {
    return <AuthScreen />;
  }

  return (
    <NavigationProvider>
      <DeadlinesProvider userId={session.user.id}>
        <ProjectProvider>
          <PushNotificationRegistrar userId={session.user.id} />
          <ProjectTabs />
          <AddDeadlineFlow />
        </ProjectProvider>
      </DeadlinesProvider>
    </NavigationProvider>
  );
}

/** Swaps in NewProjectScreen or SettingsScreen over the whole tab area — NewProjectScreen needs useProject() to refetch after replacing the project. */
function ProjectTabs() {
  const { newProjectOpen, joinProjectOpen, openJoinProject, settingsOpen, activeTab, setActiveTab } = useNavigation();

  // An invite link tapped by someone who already has a project opens the
  // join screen with the code filled in (before, it did nothing here).
  const incomingCode = useIncomingInviteCode();
  const handledCodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!incomingCode || handledCodeRef.current === incomingCode) return;
    handledCodeRef.current = incomingCode;
    openJoinProject(incomingCode);
  }, [incomingCode, openJoinProject]);

  if (joinProjectOpen) {
    return <JoinProjectScreen />;
  }

  if (newProjectOpen) {
    return <NewProjectScreen />;
  }

  if (settingsOpen) {
    return <SettingsScreen />;
  }

  return (
    <>
      {activeTab === 'home' && <HomeScreen activeTab={activeTab} onSelectTab={setActiveTab} />}
      {activeTab === 'projects' && <ProjectsScreen activeTab={activeTab} onSelectTab={setActiveTab} />}
      {activeTab === 'chat' && <ChatTab activeTab={activeTab} onSelectTab={setActiveTab} />}
      {activeTab === 'study' && <StudyScreen activeTab={activeTab} onSelectTab={setActiveTab} />}
    </>
  );
}

/** Join another project with a teammate's code, then land in it. */
function JoinProjectScreen() {
  const { joinProjectCode, closeJoinProject, setActiveTab } = useNavigation();
  const { switchProject, refetch } = useProject();
  useHardwareBackHandler(closeJoinProject);

  return (
    <JoinProjectFlow
      onBack={closeJoinProject}
      initialCode={joinProjectCode ?? undefined}
      onDone={(projectId) => {
        closeJoinProject();
        setActiveTab('home');
        if (projectId) switchProject(projectId);
        else refetch();
      }}
    />
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    ...displayFonts,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <SafeAreaProvider>
      {isSupabaseConfigured ? (
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      ) : (
        <SetupNeededScreen />
      )}
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
