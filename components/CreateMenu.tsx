import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navBottom } from './BottomNav';
import { Glass } from './Glass';
import { Icon } from './Icon';
import { InviteModal } from './InviteModal';
import { useNavigation } from '../state/NavigationProvider';
import { useOptionalProject } from '../state/ProjectRepository';
import { colors, layout, type } from '../theme';

type Props = {
  visible: boolean;
  /** False before a project exists: there's nothing to invite anyone to, and InviteModal reads useProject(), which has no value yet. */
  canInvite?: boolean;
  onClose: () => void;
};

type Option = {
  label: string;
  bg: string;
  stroke: string;
  /** SVG path in a 24 grid. */
  path: string;
  onPress: () => void;
};

const MENU_WIDTH = 248;

/**
 * The bottom-nav "+" opens this: three plain choices in a glass panel that
 * grows out of the button, with the page dimmed behind. The "+" turns into a
 * dark "×" in the same spot to close it.
 */
export function CreateMenu({ visible, canInvite = true, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { openNewProject, openJoinProject, goToNewQuiz, openAddDeadline } = useNavigation();
  // Derived, not just trusted from the prop: this menu is nested inside a
  // BottomNav that every screen renders for itself, so one screen
  // forgetting canInvite={false} would otherwise mount InviteModal without
  // a ProjectProvider and crash the tab. Belt and braces on purpose.
  const showInvite = canInvite && useOptionalProject() !== null;
  const [inviteVisible, setInviteVisible] = useState(false);
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(0.7);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  function handleClose() {
    Animated.parallel([
      Animated.timing(scale, { toValue: 0.7, duration: 140, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
    ]).start(() => onClose());
  }

  const options: Option[] = [
    {
      label: 'Add a deadline',
      bg: colors.redSoft,
      stroke: colors.redText,
      path: 'M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5zM8 3v4M16 3v4M4 10.5h16',
      onPress: () => {
        handleClose();
        openAddDeadline();
      },
    },
    {
      label: 'New project',
      bg: colors.purpleSoft,
      stroke: colors.purple,
      path: 'M3.5 8A2.5 2.5 0 0 1 6 5.5h3.4c.6 0 1.1.3 1.5.7l1.2 1.3H18A2.5 2.5 0 0 1 20.5 10v7.5A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5zM12 11v6M9 14h6',
      onPress: () => {
        openNewProject();
        handleClose();
      },
    },
    {
      label: 'Join a project',
      bg: colors.purpleSoft,
      stroke: colors.purple,
      path: 'M10 12.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2zM3.8 19c.7-3.3 3.2-5 6.2-5 1.4 0 2.6.4 3.6 1M15.5 17.5l2 2 4-4.5',
      onPress: () => {
        openJoinProject();
        handleClose();
      },
    },
    {
      label: 'Make a quiz',
      bg: colors.yellowSoft,
      stroke: colors.yellowText,
      path: 'M2.5 9.5 12 5l9.5 4.5-9.5 4.5zM6 11.7V16c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.3M21.5 9.5v6',
      onPress: () => {
        goToNewQuiz();
        handleClose();
      },
    },
  ];
  if (showInvite) {
    options.push({
      label: 'Invite teammates',
      bg: colors.mint,
      stroke: colors.mintText,
      path: 'M9 12.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2zM2.8 19c.7-3.3 3.2-5 6.2-5s5.5 1.7 6.2 5M18.5 8v6M15.5 11h6',
      onPress: () => {
        handleClose();
        setInviteVisible(true);
      },
    });
  }

  const barBottom = navBottom(insets.bottom);

  return (
    <>
      <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          accessibilityLabel="Close menu"
          accessibilityRole="button"
        >
          <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
            <BlurView intensity={14} tint="light" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, styles.dim]} />
          </Animated.View>
        </Pressable>

        <Animated.View
          style={[
            styles.menuWrap,
            {
              bottom: barBottom + layout.createButtonSize + 14,
              opacity,
              transform: [{ scale }],
            },
          ]}
        >
          <Glass radius={26} inModal wash={0.9} style={styles.menu}>
            <View accessibilityRole="menu" style={styles.options}>
              {options.map((o) => (
                <Pressable
                  key={o.label}
                  onPress={o.onPress}
                  accessibilityRole="menuitem"
                  style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                >
                  <View style={[styles.tile, { backgroundColor: o.bg }]}>
                    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                      <Path
                        d={o.path}
                        stroke={o.stroke}
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  </View>
                  <Text style={styles.optionLabel}>{o.label}</Text>
                </Pressable>
              ))}
            </View>
          </Glass>
        </Animated.View>

        {/* Same spot as the "+" underneath, so it reads as the button turning. */}
        <Pressable
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          style={[styles.close, { bottom: barBottom }]}
        >
          <Icon name="close" size={22} color={colors.onInk} strokeWidth={2.2} />
        </Pressable>
      </Modal>

      {showInvite ? <InviteModal visible={inviteVisible} onClose={() => setInviteVisible(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  dim: {
    backgroundColor: 'rgba(250,249,247,0.55)',
  },
  menuWrap: {
    position: 'absolute',
    right: layout.navSideMargin,
    width: MENU_WIDTH,
    // Grow from the bottom-right corner, where the button is.
    transformOrigin: 'right bottom',
  },
  menu: {
    width: MENU_WIDTH,
  },
  options: {
    padding: 6,
  },
  option: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingLeft: 12,
    paddingRight: 18,
    borderRadius: 20,
  },
  pressed: {
    backgroundColor: 'rgba(21,21,26,0.05)',
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: layout.iconTileRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    ...type.body,
    fontSize: 16,
    color: colors.ink,
  },
  close: {
    position: 'absolute',
    right: layout.navSideMargin,
    width: layout.createButtonSize,
    height: layout.createButtonSize,
    borderRadius: layout.createButtonSize / 2,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.ink,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
});
