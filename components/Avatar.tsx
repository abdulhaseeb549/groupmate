import { StyleSheet, Text, View } from 'react-native';
import { Icon } from './Icon';
import { colors, type } from '../theme';

type Props = {
  initials: string;
  bg: string;
  fg: string;
  size?: number;
  borderColor?: string;
  style?: object;
};

export function Avatar({ initials, bg, fg, size = 36, borderColor, style }: Props) {
  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          borderColor: borderColor ?? colors.surface,
          borderWidth: borderColor ? 2 : 0,
        },
        style,
      ]}
    >
      <Text style={[type.avatarInitials, { color: fg, fontSize: size <= 30 ? 10 : 13 }]}>
        {initials}
      </Text>
    </View>
  );
}

/** Stands in for a real member's Avatar wherever a task can have no assignee yet. */
export function UnclaimedAvatar({ size = 36, borderColor }: { size?: number; borderColor?: string }) {
  return (
    <View
      style={[
        styles.base,
        styles.unclaimed,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: borderColor ?? colors.border,
        },
      ]}
    >
      <Icon name="users" size={size * 0.5} color={colors.muted} strokeWidth={1.6} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  unclaimed: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
});
