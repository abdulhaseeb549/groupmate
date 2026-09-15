import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, UnclaimedAvatar } from './Avatar';
import { TaskDetailModal } from './TaskDetailModal';
import { TaskFormModal } from './TaskFormModal';
import { TaskStatusDot } from './TaskStatusDot';
import { Icon } from './Icon';
import { Task } from '../data/tasks';
import { useProject } from '../state/ProjectRepository';
import { colors, type } from '../theme';
import { formatShortDate } from '../utils/dates';

type Props = {
  /** Which people's groups to render — defaults to everyone. */
  members?: string[];
  /** Whether to also show the unclaimed-tasks group — off for a single-person filter like "My tasks", since an unclaimed task is never "yours". Defaults to on. */
  includeUnclaimed?: boolean;
};

export function DistributionEditor({ members, includeUnclaimed = true }: Props) {
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  // `tasks`/`blockingRequirementsByTask` come from the full project state
  // regardless of the `members` filter, so blocking status stays correct
  // even when only one person's group shows.
  const { tasks, projectState, members: allMembers, membersById } = useProject();
  const { blockingRequirementsByTask } = projectState;
  const today = useMemo(() => new Date(), []);
  const memberIds = members ?? allMembers.map((m) => m.id);
  const unclaimedTasks = tasks.filter((t) => t.assigneeId === null);

  return (
    <View style={styles.container}>
      {includeUnclaimed && unclaimedTasks.length > 0 ? (
        <View style={styles.group}>
          <View style={styles.groupHeader}>
            <UnclaimedAvatar size={30} />
            <Text style={[type.button, styles.groupName]}>Unclaimed</Text>
            <View style={styles.countPill}>
              <Text style={[type.metadata, { color: colors.ink }]}>
                {unclaimedTasks.length} {unclaimedTasks.length === 1 ? 'task' : 'tasks'}
              </Text>
            </View>
          </View>

          <View style={styles.taskList}>
            {unclaimedTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                today={today}
                blockingLabels={(blockingRequirementsByTask[t.id] ?? []).map((r) => r.label)}
                onPress={() => setDetailTaskId(t.id)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {memberIds.map((memberId) => {
        const member = membersById[memberId];
        if (!member) return null;
        const memberTasks = tasks.filter((t) => t.assigneeId === memberId);
        return (
          <View key={memberId} style={styles.group}>
            <View style={styles.groupHeader}>
              <Avatar {...member} size={30} />
              <Text style={[type.button, styles.groupName]}>{member.name}</Text>
              <View style={styles.countPill}>
                <Text style={[type.metadata, { color: colors.ink }]}>
                  {memberTasks.length} {memberTasks.length === 1 ? 'task' : 'tasks'}
                </Text>
              </View>
            </View>

            <View style={styles.taskList}>
              {memberTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  today={today}
                  blockingLabels={(blockingRequirementsByTask[t.id] ?? []).map((r) => r.label)}
                  onPress={() => setDetailTaskId(t.id)}
                />
              ))}
            </View>
          </View>
        );
      })}

      <Pressable
        style={styles.addRow}
        onPress={() => setAddingTask(true)}
        accessibilityRole="button"
        accessibilityLabel="Add task"
      >
        <View style={styles.addIcon}>
          <Icon name="plus" size={14} color={colors.purple} strokeWidth={2.4} />
        </View>
        <Text style={[type.body, styles.addLabel]}>Add task</Text>
      </Pressable>

      <TaskDetailModal taskId={detailTaskId} onClose={() => setDetailTaskId(null)} />
      <TaskFormModal
        visible={addingTask}
        defaultAssignee={memberIds.length === 1 ? memberIds[0] : undefined}
        onClose={() => setAddingTask(false)}
      />
    </View>
  );
}

function TaskRow({
  task,
  today,
  blockingLabels,
  onPress,
}: {
  task: Task;
  today: Date;
  blockingLabels: string[];
  onPress: () => void;
}) {
  const completed = task.status === 'completed';
  const meta = completed
    ? `Completed ${task.completedAt ? formatShortDate(new Date(task.completedAt), today) : ''}`
    : [
        task.effortHours ? `${Number(task.effortHours.toFixed(1))}h` : null,
        task.dueLabel ? `Due ${task.dueLabel}` : null,
        blockingLabels.length > 0 ? `Blocks ${blockingLabels.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

  return (
    <Pressable
      style={styles.taskRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}, ${completed ? 'completed' : 'open task'}`}
    >
      <TaskStatusDot status={task.status} size={20} />
      <View style={styles.taskBody}>
        <Text
          style={[type.body, styles.taskTitle, completed && styles.taskTitleDone]}
          numberOfLines={1}
        >
          {task.title}
        </Text>
        {meta ? (
          <Text style={[type.statLabel, styles.taskMeta]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Icon name="chevronRight" size={14} color={colors.faint} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  group: {
    gap: 9,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  groupName: {
    color: colors.ink,
    flex: 1,
  },
  countPill: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskList: {
    gap: 2,
    paddingLeft: 40,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingVertical: 6,
  },
  taskBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  taskTitle: {
    color: colors.ink,
  },
  taskTitleDone: {
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  taskMeta: {
    color: colors.muted,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingVertical: 6,
  },
  addIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: {
    color: colors.purple,
  },
});
