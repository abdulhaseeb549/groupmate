import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../Icon';
import { Task } from '../../data/tasks';
import { CURRENT_USER_ID, TEAM } from '../../data/team';
import { RequirementState } from '../../state/projectState';
import { colors, layout, type } from '../../theme';

type Props = {
  state: RequirementState;
  onPress: () => void;
};

export function AttentionRow({ state, onPress }: Props) {
  const { requirement, status, linkedTasks, blockingTasks } = state;
  const notStarted = status === 'not_started';
  const doneCount = linkedTasks.length - blockingTasks.length;
  const progress =
    linkedTasks.length === 0
      ? 'No task linked yet'
      : notStarted
        ? 'Not started'
        : `${doneCount} of ${linkedTasks.length} tasks done`;
  const owners = waitingOn(blockingTasks);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${requirement.label}. ${progress}.${owners ? ` Waiting on ${owners.label}.` : ''}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.tile, { backgroundColor: notStarted ? colors.redSoft : colors.yellowSoft }]}>
        <Icon name="documentAlert" size={20} color={notStarted ? colors.red : colors.amber} />
      </View>
      <View style={styles.text}>
        <Text style={[type.taskTitle, styles.title]} numberOfLines={1}>
          {requirement.label}
        </Text>
        <Text style={[type.caption, styles.muted]} numberOfLines={2}>
          {progress}
          {owners ? (
            <>
              {' · '}
              <Text style={owners.includesYou ? styles.you : undefined}>Waiting on {owners.label}</Text>
            </>
          ) : null}
        </Text>
      </View>
      <Icon name="chevronRight" size={18} color={colors.faint} strokeWidth={2} />
    </Pressable>
  );
}

/** "you", "Zara", "you and Bilal", "Zara, Bilal and Ayesha" — the current user always first. */
function waitingOn(tasks: Task[]) {
  if (tasks.length === 0) return null;
  const ids = Array.from(new Set(tasks.map((t) => t.assigneeId))).sort(
    (a, b) => Number(b === CURRENT_USER_ID) - Number(a === CURRENT_USER_ID)
  );
  const names = ids.map((id) => (id === CURRENT_USER_ID ? 'you' : TEAM[id].name));
  const label =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return { label, includesYou: ids[0] === CURRENT_USER_ID };
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  tile: {
    width: layout.iconTile,
    height: layout.iconTile,
    borderRadius: layout.iconTileRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    color: colors.ink,
  },
  muted: {
    color: colors.muted,
  },
  you: {
    color: colors.purple,
    fontFamily: type.metadata.fontFamily,
  },
});
