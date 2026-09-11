import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from './Icon';
import { colors, type } from '../theme';

type Props = {
  title: string;
  /** One quiet line under the title saying why the section matters. */
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function SectionHeader({ title, subtitle, actionLabel, onAction }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={[type.sectionHeading, styles.title]} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={[type.subtitle, styles.subtitle]}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={[type.button, styles.actionText]}>{actionLabel}</Text>
          <Icon name="chevronRight" size={16} color={colors.purple} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 28,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.ink,
  },
  subtitle: {
    color: colors.muted,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionText: {
    color: colors.purple,
  },
  pressed: {
    opacity: 0.55,
  },
});
