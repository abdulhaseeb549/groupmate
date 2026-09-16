import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNav, NavTab } from '../components/BottomNav';
import { Icon, IconName } from '../components/Icon';
import { useNavigation } from '../state/NavigationProvider';
import { colors, layout, type } from '../theme';
import { OnboardingScreen } from './OnboardingScreen';
import { StudyScreen } from './StudyScreen';

/**
 * The app shell for a signed-in user who has no project yet.
 *
 * This used to be OnboardingScreen rendered bare, with no tab bar at all —
 * so the first thing a new teammate saw was a screen with no navigation,
 * and Study (which needs nothing but your notes) was unreachable and
 * advertised as locked. The tabs exist here for the same reason they exist
 * everywhere else; two of them just have nothing to show yet and say so.
 */
export function NoProjectShell({ onDone }: { onDone: () => void }) {
  const { activeTab, setActiveTab, newProjectOpen, closeNewProject } = useNavigation();

  // The "+" menu's New project action sets newProjectOpen, but
  // NewProjectScreen replaces an *existing* brief and reads useProject() —
  // neither of which applies yet. It maps onto the create flow instead.
  function handleDone() {
    closeNewProject();
    onDone();
  }

  if (newProjectOpen) {
    return <OnboardingScreen onDone={handleDone} startMode="create" onExitMode={closeNewProject} />;
  }

  if (activeTab === 'study') {
    return <StudyScreen activeTab={activeTab} onSelectTab={setActiveTab} />;
  }

  if (activeTab === 'projects' || activeTab === 'chat') {
    return (
      <EmptyTab
        tab={activeTab}
        icon={activeTab === 'projects' ? 'folder' : 'chat'}
        title={activeTab === 'projects' ? 'No project yet' : 'No one to chat with yet'}
        body={
          activeTab === 'projects'
            ? 'Once you add a brief, every requirement in it turns into tasks your team can claim — they land here.'
            : 'Your team chat and a direct message with each teammate open up as soon as you have a project and someone joins it.'
        }
        onSelectTab={setActiveTab}
        onGetStarted={() => setActiveTab('home')}
      />
    );
  }

  return <OnboardingScreen onDone={handleDone} activeTab={activeTab} onSelectTab={setActiveTab} />;
}

/**
 * A tab that exists but has nothing in it yet. Says what will be here and
 * points at the one action that fills it, rather than showing a bare tab
 * bar over an empty page.
 */
function EmptyTab({
  tab,
  icon,
  title,
  body,
  onSelectTab,
  onGetStarted,
}: {
  tab: NavTab;
  icon: IconName;
  title: string;
  body: string;
  onSelectTab: (tab: NavTab) => void;
  onGetStarted: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 40) + 14, paddingBottom: 130 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.center}>
          <View style={styles.iconTile}>
            <Icon name={icon} size={24} color={colors.muted} strokeWidth={1.7} />
          </View>
          <Text style={[type.projectTitle, styles.ink]} accessibilityRole="header">
            {title}
          </Text>
          <Text style={[type.body, styles.muted, styles.body]}>{body}</Text>
          <Pressable
            onPress={onGetStarted}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Text style={[type.button, styles.onInk]}>Start a project</Text>
          </Pressable>
        </View>
      </ScrollView>

      <BottomNav active={tab} onSelect={onSelectTab} canInvite={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: layout.screenPadding,
  },
  center: {
    alignItems: 'center',
    gap: 10,
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  ink: {
    color: colors.ink,
  },
  muted: {
    color: colors.muted,
  },
  onInk: {
    color: colors.onInk,
  },
  body: {
    textAlign: 'center',
    maxWidth: 300,
  },
  button: {
    height: 52,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  pressed: {
    opacity: 0.85,
  },
});
