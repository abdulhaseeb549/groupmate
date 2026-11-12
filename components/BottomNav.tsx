import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreateMenu } from './CreateMenu';
import { Glass } from './Glass';
import { Icon, IconName } from './Icon';
import { colors, gradients, layout, type } from '../theme';

export type NavTab = 'home' | 'projects' | 'chat' | 'study';

const TABS: Record<NavTab, { label: string; icon: IconName }> = {
  home: { label: 'Home', icon: 'home' },
  projects: { label: 'Projects', icon: 'folder' },
  chat: { label: 'Chat', icon: 'chat' },
  study: { label: 'Study', icon: 'book' },
};

const ORDER: NavTab[] = ['home', 'projects', 'chat', 'study'];

/** Distance from the screen's bottom edge to the nav bar. Shared with CreateMenu so the × sits exactly where the + was. */
export function navBottom(insetBottom: number) {
  return Math.max(insetBottom, 12) + 10;
}

function Tab({
  id,
  active,
  badge,
  onPress,
}: {
  id: NavTab;
  active: boolean;
  /** Draws an unread dot on the icon — set for Chat when a message arrived you haven't opened. */
  badge?: boolean;
  onPress: () => void;
}) {
  // Muted rather than faint when inactive: faint fails 4.5:1 as label text.
  const tint = active ? colors.purple : colors.muted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      aria-selected={active}
      accessibilityLabel={badge ? `${TABS[id].label}, new messages` : TABS[id].label}
      style={[styles.tab, active && styles.tabActive]}
    >
      <View>
        <Icon name={TABS[id].icon} size={21} color={tint} strokeWidth={active ? 1.9 : 1.7} />
        {badge ? <View style={styles.badge} /> : null}
      </View>
      <Text numberOfLines={1} style={[active ? type.navigationActive : type.navigation, { color: tint }]}>
        {TABS[id].label}
      </Text>
    </Pressable>
  );
}

/**
 * Four named tabs in one glass capsule, and "+" as its own button beside it,
 * so making something never looks like a fifth page. Render it as a sibling
 * of the scrolling content (under a GlassScene) so content slides beneath.
 */
export function BottomNav({
  active,
  onSelect,
  canInvite = true,
  chatUnread = false,
}: {
  active: NavTab;
  onSelect: (tab: NavTab) => void;
  /** False before a project exists — there is nothing to invite anyone to, and the invite sheet reads the project. */
  canInvite?: boolean;
  /** Unread dot on the Chat tab, so a direct message is noticed from anywhere rather than only when you happen to open Chat. */
  chatUnread?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <View style={[styles.bar, { bottom: navBottom(insets.bottom) }]} pointerEvents="box-none">
      <Glass radius={layout.navHeight / 2} style={styles.capsule}>
        <View accessibilityRole="tablist" style={styles.tabs}>
          {ORDER.map((id) => (
            <Tab
              key={id}
              id={id}
              active={active === id}
              badge={id === 'chat' && chatUnread}
              onPress={() => onSelect(id)}
            />
          ))}
        </View>
      </Glass>

      <Pressable
        onPress={() => setCreateOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Create"
        style={styles.createShadow}
      >
        <LinearGradient
          colors={gradients.purpleDeep}
          start={{ x: 0.25, y: 0 }}
          end={{ x: 0.75, y: 1 }}
          style={styles.createButton}
        >
          <LinearGradient colors={gradients.sheen} style={styles.createSheen} />
          <Icon name="plus" size={24} color={colors.onInk} strokeWidth={2.2} />
        </LinearGradient>
      </Pressable>

      <CreateMenu visible={createOpen} canInvite={canInvite} onClose={() => setCreateOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: layout.navSideMargin,
    right: layout.navSideMargin,
    height: layout.navHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.navGap,
  },
  capsule: {
    flex: 1,
    height: layout.navHeight,
  },
  tabs: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    gap: 2,
  },
  tab: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  // The "lens": a faint purple wash, not a filled pill. Purple stays a mark.
  tabActive: {
    backgroundColor: 'rgba(108,76,232,0.10)',
  },
  // Ringed in white so the dot stays legible where it overlaps the icon's strokes.
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.red,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  createShadow: {
    width: layout.createButtonSize,
    height: layout.createButtonSize,
    borderRadius: layout.createButtonSize / 2,
    shadowColor: '#5836D6',
    shadowOpacity: 0.32,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  createButton: {
    flex: 1,
    borderRadius: layout.createButtonSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  createSheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '45%',
  },
});
