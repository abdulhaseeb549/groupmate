import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QuickAction } from './QuickAction';
import { useNavigation } from '../state/NavigationProvider';
import { colors, layout } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * The bottom-nav "+" opens this — cards float directly on a blurred
 * backdrop (no sheet/card chrome around them) and pop in from roughly
 * where the button sits, rather than sliding up as a generic sheet.
 */
export function CreateMenu({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { openNewProject, goToNewQuiz } = useNavigation();

  function handleNewProject() {
    openNewProject();
    handleClose();
  }

  function handleNewQuiz() {
    goToNewQuiz();
    handleClose();
  }
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(0.6);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.back(1.4)),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  function handleClose() {
    Animated.parallel([
      Animated.timing(scale, { toValue: 0.6, duration: 140, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
    ]).start(() => onClose());
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={handleClose}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      </Pressable>

      <Animated.View
        style={[
          styles.row,
          {
            bottom: Math.max(insets.bottom, 12) + 16 + layout.navHeight + 16,
            opacity,
            transform: [{ scale }],
            pointerEvents: 'box-none',
          },
        ]}
      >
        <QuickAction
          label="New"
          bg={colors.purpleSoft}
          shadowColor={colors.purple}
          onPress={handleNewProject}
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path
                d="M12 16V4M7.5 8.5 12 4l4.5 4.5M4.5 15v3A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5v-3"
                stroke={colors.purple}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          }
        />
        <QuickAction
          label="Study"
          bg={colors.yellowSoft}
          shadowColor={colors.yellowText}
          onPress={handleNewQuiz}
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path
                d="M2.5 9.5 12 5l9.5 4.5-9.5 4.5zM6 11.7V16c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.3M21.5 9.5v6"
                stroke={colors.yellowText}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          }
        />
        <QuickAction
          label="Invite"
          bg={colors.mint}
          shadowColor={colors.mintText}
          onPress={handleClose}
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path
                d="M9 12.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2zM2.8 19c.7-3.3 3.2-5 6.2-5s5.5 1.7 6.2 5M16.3 6.3a3.3 3.3 0 0 1 0 6M19 19c-.3-2.6-1.3-4-2.9-4.7"
                stroke={colors.mintText}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          }
        />
        <QuickAction
          label="More"
          bg={colors.border}
          shadowColor="#3C3255"
          onPress={handleClose}
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill={colors.muted}>
              <Circle cx={5} cy={12} r={1.8} />
              <Circle cx={12} cy={12} r={1.8} />
              <Circle cx={19} cy={12} r={1.8} />
            </Svg>
          }
        />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    flexDirection: 'row',
    gap: layout.quickActionGap,
  },
});
