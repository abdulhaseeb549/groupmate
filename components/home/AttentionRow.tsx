import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../Icon';
import { Member } from '../../data/member';
import { Task } from '../../data/tasks';
import { RequirementState } from '../../state/projectState';
import { useProject } from '../../state/ProjectRepository';
import { colors, layout, type } from '../../theme';

type Props = {
  state: RequirementState;
  /** The signed-in user's id — passed in rather than read via useAuth() here, since the caller already has it. */
  currentUserId: string | undefined;
  onPress: () => void;
};

export function AttentionRow({ state, currentUserId, onPress }: Props) {
  const { membersById } = useProject();
  const { requirement, status, linkedTasks, blockingTasks } = state;
  const notStarted = status === 'not_started';
  const doneCount = linkedTasks.length - blockingTasks.length;
  const progress =
    linkedTasks.length === 0
      ? 'No task linked yet'
      : notStarted
        ? 'Not started'
        : `${doneCount} of ${linkedTasks.length} tasks done`;
  const owners = waitingOn(blockingTasks, currentUserId, membersById);

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

/** "you", "Zara", "you and Bilal", "Zara, Bilal and unclaimed" — the current user always first, any unclaimed blocker always last. */
function waitingOn(tasks: Task[], currentUserId: string | undefined, membersById: Record<string, Member>) {
  if (tasks.length === 0) return null;
  const ids = Array.from(new Set(tasks.map((t) => t.assigneeId)));
  const hasUnclaimed = ids.includes(null);
  const claimedIds = ids
    .filter((id): id is string => id !== null)
    .sort((a, b) => Number(b === currentUserId) - Number(a === currentUserId));
  const names = claimedIds.map((id) => (id === currentUserId ? 'you' : (membersById[id]?.name ?? 'someone')));
  if (hasUnclaimed) names.push('unclaimed');
  if (names.length === 0) return null;
  const label =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return { label, includesYou: claimedIds[0] === currentUserId };
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
