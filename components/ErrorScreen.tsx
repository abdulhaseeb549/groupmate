import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from './Icon';
import { colors, layout, type } from '../theme';

type Props = {
  title?: string;
  message: string;
  onRetry: () => void;
};

/** Never a blank crash — every fetch that can fail routes here instead. */
export function ErrorScreen({ title = 'Something went wrong', message, onRetry }: Props) {
  return (
    <View style={styles.screen}>
      <View style={styles.icon}>
        <Icon name="documentAlert" size={24} color={colors.red} strokeWidth={1.7} />
      </View>
      <Text style={[type.projectTitle, styles.ink]}>{title}</Text>
      <Text style={[type.body, styles.muted]}>{message}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={[type.button, styles.onInk]}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenPadding,
    gap: 6,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  ink: {
    color: colors.ink,
  },
  muted: {
    color: colors.muted,
    textAlign: 'center',
  },
  onInk: {
    color: colors.onInk,
  },
  pressed: {
    opacity: 0.75,
  },
  button: {
    marginTop: 14,
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
