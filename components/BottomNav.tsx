import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreateMenu } from './CreateMenu';
import { Icon, IconName } from './Icon';
import { colors, gradients, layout, purpleHalo, type } from '../theme';

export type NavTab = 'home' | 'projects' | 'chat' | 'study';

const TABS: Record<NavTab, { label: string; icon: IconName }> = {
  home: { label: 'Home', icon: 'home' },
  projects: { label: 'Projects', icon: 'folder' },
  chat: { label: 'Chat', icon: 'chat' },
  study: { label: 'Study', icon: 'book' },
};

const ORDER: NavTab[] = ['home', 'projects', 'chat', 'study'];

function Tab({ id, active, onPress }: { id: NavTab; active: boolean; onPress: () => void }) {
  // Muted rather than faint when inactive: faint fails 4.5:1 as label text.
  const tint = active ? colors.purple : colors.muted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      aria-selected={active}
      style={styles.tab}
    >
      <View style={[styles.tabContent, active && styles.tabContentActive]}>
        <Icon name={TABS[id].icon} size={20} color={tint} strokeWidth={active ? 1.9 : 1.7} />
        <Text style={[active ? type.navigationActive : type.navigation, { color: tint }]}>
          {TABS[id].label}
        </Text>
      </View>
    </Pressable>
  );
}

export function BottomNav({
  active,
  onSelect,
}: {
  active: NavTab;
  onSelect: (tab: NavTab) => void;
}) {
  const [left, right] = [ORDER.slice(0, 2), ORDER.slice(2)];
  const insets = useSafeAreaInsets();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <View style={[styles.bar, { bottom: Math.max(insets.bottom, 12) + 16 }]}>
      {left.map((id) => (
        <Tab key={id} id={id} active={active === id} onPress={() => onSelect(id)} />
      ))}

      <Pressable
        onPress={() => setCreateOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Create"
        style={styles.createHalo}
      >
        <LinearGradient
          colors={gradients.purpleDeep}
          start={{ x: 0.25, y: 0 }}
          end={{ x: 0.75, y: 1 }}
          style={styles.createButton}
        >
          <LinearGradient colors={gradients.sheen} style={styles.createSheen} />
          <Icon name="plus" size={20} color={colors.onInk} strokeWidth={2.4} />
        </LinearGradient>
      </Pressable>

      {right.map((id) => (
        <Tab key={id} id={id} active={active === id} onPress={() => onSelect(id)} />
      ))}

      <CreateMenu visible={createOpen} onClose={() => setCreateOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: layout.navSideMargin,
    right: layout.navSideMargin,
    height: layout.navHeight,
    borderRadius: layout.navHeight / 2,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    shadowColor: '#2D2350',
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  tab: {
    height: layout.navHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  tabContentActive: {
    backgroundColor: colors.purpleSoft,
  },
  createHalo: {
    width: 58,
    height: 58,
    borderRadius: 29,
    marginTop: -28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: purpleHalo,
    shadowColor: colors.purple,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  createButton: {
    width: layout.createButtonSize,
    height: layout.createButtonSize,
    borderRadius: layout.createButtonSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#1A1330',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  createSheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '58%',
  },
});
