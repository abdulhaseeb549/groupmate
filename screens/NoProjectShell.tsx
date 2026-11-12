import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNav, NavTab } from '../components/BottomNav';
import { FadeIn } from '../components/FadeIn';
import { GlassScene, GlassTarget } from '../components/Glass';
import { Glow } from '../components/Glow';
import { GradientButton } from '../components/GradientButton';
import { Icon } from '../components/Icon';
import { useNavigation } from '../state/NavigationProvider';
import { colors, type } from '../theme';
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
        pageTitle={activeTab === 'projects' ? 'Projects' : 'Chats'}
        title={activeTab === 'projects' ? 'No project yet' : 'No one to chat with yet'}
        body={activeTab === 'projects' ? 'Add a brief. Its tasks land here.' : 'Team chat opens once someone joins.'}
        onSelectTab={setActiveTab}
        onGetStarted={() => setActiveTab('home')}
      />
    );
  }

  return <OnboardingScreen onDone={handleDone} activeTab={activeTab} onSelectTab={setActiveTab} />;
}

/**
 * GNoProject board: a tab that exists but has nothing in it yet. Says what
 * will be here and points at the one action that fills it. The mascot is
 * the Projects empty state only (one per flow); Chat gets a quiet icon.
 */
function EmptyTab({
  tab,
  pageTitle,
  title,
  body,
  onSelectTab,
  onGetStarted,
}: {
  tab: NavTab;
  pageTitle: string;
  title: string;
  body: string;
  onSelectTab: (tab: NavTab) => void;
  onGetStarted: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <GlassScene style={styles.screen}>
      <GlassTarget>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 40) + 14, paddingBottom: 120 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn>
          <Text style={styles.h1} accessibilityRole="header">
            {pageTitle}
          </Text>
        </FadeIn>

        <View style={styles.center}>
          <FadeIn delay={60}>
            <View style={styles.art}>
              {tab === 'projects' ? (
                <>
                  <Glow width={280} height={220} opacity={0.18} style={styles.glow} />
                  <Image
                    source={require('../assets/Mascot-png.png')}
                    style={styles.mascot}
                    resizeMode="contain"
                    accessibilityIgnoresInvertColors
                  />
                </>
              ) : (
                <View style={styles.iconTile}>
                  <Icon name="chat" size={26} color={colors.muted} strokeWidth={1.7} />
                </View>
              )}
            </View>
          </FadeIn>
          <FadeIn delay={120}>
            <View style={styles.text}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.body}>{body}</Text>
            </View>
          </FadeIn>
          <FadeIn delay={180}>
            <GradientButton label="Start a project" onPress={onGetStarted} style={styles.button} />
          </FadeIn>
        </View>
      </ScrollView>
      </GlassTarget>

      <BottomNav active={tab} onSelect={onSelectTab} canInvite={false} />
    </GlassScene>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 20,
  },
  h1: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 32,
    lineHeight: 35,
    letterSpacing: -0.9,
    color: colors.ink,
  },
  // Board: the block's top sits 190 down, i.e. 131 under the 35-high title
  // that starts at 24; it is inset 28 from the screen edges.
  center: {
    marginTop: 131,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 22,
  },
  art: {
    alignSelf: 'stretch',
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -140,
    marginTop: -110,
  },
  // Mascot source is 1.2:1.
  mascot: {
    width: 190,
    height: 158,
  },
  iconTile: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 22px rgba(28,22,51,0.06), 0 0 0 0.5px rgba(17,17,17,0.06)',
  },
  text: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.7,
    color: colors.ink,
    textAlign: 'center',
  },
  body: {
    fontFamily: type.caption.fontFamily,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
  },
  button: {
    width: 220,
  },
});
