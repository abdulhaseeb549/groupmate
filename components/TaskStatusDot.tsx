import { StyleSheet, View } from 'react-native';
import { Icon } from './Icon';
import { TaskStatus } from '../data/tasks';
import { colors } from '../theme';

type Props = {
  status: TaskStatus;
  size?: number;
};

/** Same visual language as the Timeline's checkpoint dots — empty ring, amber ring with a filled core, or a solid green check. */
export function TaskStatusDot({ status, size = 20 }: Props) {
  if (status === 'completed') {
    return (
      <View style={[styles.base, { width: size, height: size, borderRadius: size / 2 }, styles.completed]}>
        <Icon name="check" size={size * 0.55} color={colors.onInk} strokeWidth={3} />
      </View>
    );
  }
  if (status === 'in_progress') {
    return (
      <View style={[styles.base, { width: size, height: size, borderRadius: size / 2 }, styles.inProgress]}>
        <View style={{ width: size * 0.4, height: size * 0.4, borderRadius: size * 0.2, backgroundColor: colors.amber }} />
      </View>
    );
  }
  return <View style={[styles.base, { width: size, height: size, borderRadius: size / 2 }, styles.notStarted]} />;
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  notStarted: {
    borderWidth: 1.5,
    borderColor: colors.control,
    backgroundColor: colors.surface,
  },
  inProgress: {
    borderWidth: 1.5,
    borderColor: colors.amber,
    backgroundColor: colors.yellowSoft,
  },
  completed: {
    backgroundColor: colors.green,
  },
});
