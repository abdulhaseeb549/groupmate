import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, PanResponder, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Pinned over the bottom of the sheet (a bottom action bar). Content scrolls under it. */
  footer?: ReactNode;
  /** Full-height sheet starting just under the status bar (task detail, forms). Otherwise it hugs its content. */
  full?: boolean;
};

/**
 * The one bottom sheet (KIT .sheet): white, 28 radius, a lavender grab bar.
 *
 * Animated by hand instead of Modal's animationType="slide", which slid the
 * dark backdrop up together with the sheet. Here the backdrop fades while
 * the sheet springs up, and the sheet can be dragged down by its top edge to
 * close. It stays mounted through its exit, so the parent can just flip
 * `visible` off.
 */
export function Sheet({ visible, onClose, children, footer, full = false }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      drag.setValue(0);
      Animated.spring(progress, { toValue: 1, useNativeDriver: true, damping: 22, stiffness: 220, mass: 0.9 }).start();
    } else if (mounted) {
      Animated.timing(progress, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
        ({ finished }) => finished && setMounted(false)
      );
    }
  }, [visible]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 110 || g.vy > 1.1) onCloseRef.current();
        else Animated.spring(drag, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }).start();
      },
      onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
    })
  ).current;

  if (!mounted) return null;

  const top = Math.max(insets.top, 24) + 20;
  const translateY = Animated.add(
    progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }),
    drag
  );

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[styles.scrim, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={[styles.sheet, full ? { top } : { maxHeight: height - top }, { transform: [{ translateY }] }]}
      >
        <View {...pan.panHandlers} style={styles.grabZone}>
          <View style={styles.grab} />
        </View>
        {children}
        {footer ? (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 0) + 28 }]}>
            {/* Content scrolls under the bar; this fade keeps the buttons clean. */}
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255,255,255,0)', '#FFFFFF']}
              locations={[0, 0.35]}
              style={styles.footerFade}
            />
            {footer}
          </View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(21,21,26,0.32)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#1C1633',
    shadowOpacity: 0.14,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: -10 },
    elevation: 16,
    overflow: 'hidden',
  },
  grabZone: {
    height: 21,
    alignItems: 'center',
  },
  grab: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.track,
    marginTop: 8,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  footerFade: {
    ...StyleSheet.absoluteFill,
  },
});
