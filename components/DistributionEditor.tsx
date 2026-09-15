import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from './Avatar';
import { TaskDetailModal } from './TaskDetailModal';
import { TaskStatusDot } from './TaskStatusDot';
import { Icon } from './Icon';
import { Task } from '../data/tasks';
import { TEAM, TEAM_ORDER, TeamId } from '../data/team';
import { useProject } from '../state/ProjectRepository';
import { colors, type } from '../theme';
import { formatShortDate } from '../utils/dates';

type Props = {
  /** Which people's groups to render — defaults to everyone. */
  members?: TeamId[];
};

export function DistributionEditor({ members = TEAM_ORDER }: Props) {
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  // `tasks`/`blockingRequirementsByTask` come from the full project state
  // regardless of the `members` filter, so blocking status stays correct
  // even when only one person's group shows.
  const { tasks, projectState } = useProject();
  const { blockingRequirementsByTask } = projectState;
  const today = useMemo(() => new Date(), []);

  return (
    <View style={styles.container}>
      {members.map((memberId) => {
        const member = TEAM[memberId];
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

      <TaskDetailModal taskId={detailTaskId} onClose={() => setDetailTaskId(null)} />
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
});
