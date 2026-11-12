import { createContext, ReactNode, RefObject, useContext, useRef } from 'react';
import { Platform, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurTargetView, BlurView } from 'expo-blur';

/**
 * Glass is for things that FLOAT over scrolling content: the tab bar, round
 * header buttons, sticky headers, composers and bottom action bars. Cards
 * stay solid white so text stays sharp.
 *
 * iOS and web blur whatever sits behind a BlurView on their own. Android
 * needs to be told what to blur: wrap the scrolling content in <GlassTarget>
 * and put the <Glass> pieces next to it (not inside it), all under one
 * <GlassScene>. On Android 12+ that is a real blur; on older versions (or a
 * screen with no GlassScene) Glass falls back to frosted white, which still
 * reads as a floating pane.
 */

const TargetContext = createContext<RefObject<View | null> | null>(null);

/** Root of a screen that has glass on it. Renders a plain flex:1 View. */
export function GlassScene({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const targetRef = useRef<View | null>(null);
  return (
    <TargetContext.Provider value={targetRef}>
      <View style={[styles.scene, style]}>{children}</View>
    </TargetContext.Provider>
  );
}

/** The scrolling content that glass sits above. Fills the scene. */
export function GlassTarget({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const targetRef = useContext(TargetContext);
  if (Platform.OS !== 'android' || !targetRef) {
    return <View style={[styles.target, style]}>{children}</View>;
  }
  return (
    <BlurTargetView ref={targetRef} style={[styles.target, style]}>
      {children}
    </BlurTargetView>
  );
}

// Frosted-white wash drawn on top of the blur. Without a real blur (older
// Android) it is nearly opaque so text behind never shows through.
const WASH_BLURRED = 'rgba(255,255,255,0.58)';
const WASH_FALLBACK = 'rgba(255,255,255,0.88)';
const EDGE = 'rgba(255,255,255,0.85)';

type GlassProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Corner radius. Round things pass half their size. */
  radius: number;
  /** Blur strength, 1-100. */
  intensity?: number;
  /** Heavier wash, for glass that sits over text (chat header). */
  wash?: number;
  /** True inside a <Modal>: it is its own window, so Android has nothing to blur and gets frosted white. */
  inModal?: boolean;
};

export function Glass({ children, style, radius, intensity = 60, wash, inModal = false }: GlassProps) {
  const targetRef = useContext(TargetContext);
  const isAndroid = Platform.OS === 'android';
  const hasRealBlur = !isAndroid || (!inModal && targetRef !== null && Number(Platform.Version) >= 31);
  const washColor = wash !== undefined ? `rgba(255,255,255,${wash})` : hasRealBlur ? WASH_BLURRED : WASH_FALLBACK;

  return (
    <View style={[styles.shadow, { borderRadius: radius }, style]}>
      <View style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: radius }]}>
      {hasRealBlur ? (
        <BlurView
          intensity={intensity}
          tint="light"
          blurTarget={isAndroid ? (targetRef ?? undefined) : undefined}
          blurMethod={isAndroid ? 'dimezisBlurViewSdk31Plus' : undefined}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: washColor }]} />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.edge, { borderRadius: radius }]}
      />
      </View>
      {children}
    </View>
  );
}

/** A 44px round glass button for screen headers (back, close, bell, edit). */
export function GlassButton({
  children,
  onPress,
  label,
  size = 44,
  style,
}: {
  children: ReactNode;
  onPress: () => void;
  label: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [{ width: size, height: size, opacity: pressed ? 0.7 : 1 }, style]}
    >
      <Glass radius={size / 2} style={{ width: size, height: size }}>
        <View style={styles.center}>{children}</View>
      </Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  scene: { flex: 1 },
  target: { flex: 1 },
  // Shadow on an outer view and the blur clipped on an inner one: overflow
  // hidden would otherwise cut the iOS shadow off.
  shadow: {
    shadowColor: '#1C1633',
    shadowOpacity: 0.13,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    backgroundColor: 'transparent',
  },
  clip: { overflow: 'hidden' },
  edge: {
    borderWidth: 0.5,
    borderColor: EDGE,
  },
});
