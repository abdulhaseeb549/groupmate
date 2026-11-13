import { ReactNode } from 'react';
import { Platform, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

/**
 * Glass is for things that FLOAT over scrolling content: the tab bar, round
 * header buttons, sticky headers, composers and bottom action bars. Cards
 * stay solid white so text stays sharp.
 *
 * iOS and web blur whatever sits behind a BlurView. Android does not get the
 * blur: on real phones it came out grey and muddy, because an elevation
 * shadow under a see-through view shows THROUGH it, and the Android blur adds
 * its own grey tint. So on Android every glass piece is a solid white pane
 * with a soft shadow and a faint edge: it still floats, and it stays light.
 * GlassScene / GlassTarget stay in the screens so iOS and web keep working.
 */

/** Root of a screen that has glass on it. Renders a plain flex:1 View. */
export function GlassScene({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.scene, style]}>{children}</View>;
}

/** The scrolling content that glass sits above. Fills the scene. */
export function GlassTarget({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.target, style]}>{children}</View>;
}

// Frosted-white wash drawn on top of the blur (iOS and web).
const WASH_BLURRED = 0.58;
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
  /** Inside a <Modal>. Kept for callers; glass looks the same there. */
  inModal?: boolean;
};

export function Glass({ children, style, radius, intensity = 60, wash }: GlassProps) {
  if (Platform.OS === 'android') {
    // Solid white: see the note at the top of this file.
    return <View style={[styles.solid, { borderRadius: radius }, style]}>{children}</View>;
  }
  const washColor = `rgba(255,255,255,${wash ?? WASH_BLURRED})`;

  return (
    <View style={[styles.shadow, { borderRadius: radius }, style]}>
      <View style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: radius }]}>
      <BlurView intensity={intensity} tint="light" style={StyleSheet.absoluteFill} />
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
      style={({ pressed }) => [{ width: size, height: size, transform: [{ scale: pressed ? 0.94 : 1 }] }, style]}
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
  // Android: opaque, so the elevation shadow sits outside the pane only.
  solid: {
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.06)',
    elevation: 4,
    shadowColor: '#1C1633',
  },
  edge: {
    borderWidth: 0.5,
    borderColor: EDGE,
  },
});
