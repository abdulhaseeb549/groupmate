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
import { ProjectsScreen } from './screens/ProjectsScreen';
import { SetupNeededScreen } from './screens/SetupNeededScreen';
import { StudyScreen } from './screens/StudyScreen';
import { AuthProvider, useAuth } from './state/AuthProvider';
import { NavigationProvider, useNavigation } from './state/NavigationProvider';
import { ProjectProvider } from './state/ProjectRepository';
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

  // undefined = the first getSession() call hasn't resolved yet.
  if (session === undefined) {
    return <LoadingScreen />;
  }

  if (session === null) {
    return <AuthScreen />;
  }

  return (
    <NavigationProvider>
      <ProjectProvider>
        <PushNotificationRegistrar userId={session.user.id} />
        <ProjectTabs />
      </ProjectProvider>
    </NavigationProvider>
  );
}

/** Swaps in NewProjectScreen over the whole tab area — it needs useProject() to refetch after replacing the project. */
function ProjectTabs() {
  const { newProjectOpen, activeTab, setActiveTab } = useNavigation();

  if (newProjectOpen) {
    return <NewProjectScreen />;
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
