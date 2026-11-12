import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, type } from '../theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Shown before the label (an icon, usually). */
  leading?: ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The one glossy primary action on a screen: 56px, in the thumb zone. The
 * gradient is reserved for these (and the nav "+"), so it always means
 * "the thing to do next".
 */
export function GradientButton({ label, onPress, disabled, loading, leading, accessibilityLabel, style }: Props) {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [styles.shadow, disabled && styles.disabled, pressed && !inactive && styles.pressed, style]}
    >
      <LinearGradient colors={gradients.purpleDeep} start={{ x: 0.25, y: 0 }} end={{ x: 0.75, y: 1 }} style={styles.fill}>
        <LinearGradient colors={gradients.sheen} style={styles.sheen} />
        {loading ? <ActivityIndicator color={colors.onInk} /> : leading}
        <Text style={[type.sectionHeading, styles.label]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

/** White secondary button that sits beside a GradientButton. */
export function SecondaryButton({
  label,
  onPress,
  style,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.secondary, pressed && styles.pressed, style]}
    >
      <View>
        <Text style={[type.button, styles.secondaryLabel]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: {
    height: 56,
    borderRadius: 18,
    shadowColor: '#5836D6',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  fill: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '45%',
  },
  label: {
    color: colors.onInk,
    fontSize: 16,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.88,
  },
  secondary: {
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.1)',
    shadowColor: '#1C1633',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  secondaryLabel: {
    color: colors.ink,
    fontSize: 15,
  },
});
