import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../Avatar';
import { weekDates } from '../home/WeekStrip';
import { Icon } from '../Icon';
import { TaskDetailModal } from '../TaskDetailModal';
import { Task } from '../../data/tasks';
import { useProject } from '../../state/ProjectRepository';
import { ProjectSchedule } from '../../state/projectSchedule';
import { colors, radius, type } from '../../theme';
import { formatDueDate, formatShortDate } from '../../utils/dates';

type Props = {
  tasks: Task[];
  schedule: ProjectSchedule;
  dueDate: string;
  today: Date;
};

const DOT = 20;
// Dot centre, measured from the card's left edge: card padding + half a dot.
const SPINE_LEFT = 16 + DOT / 2 - 0.75;

type Group = { label: string; tasks: Task[] };

/**
 * Checkpoints, not a fabricated Gantt chart: every dot here is a real task
 * that at least one other task actually depends on, placed at the real
 * date the backward-scheduling algorithm computed from effort hours +
 * capacity + the dependency graph — never an invented per-task deadline.
 * A task with no dependents isn't a checkpoint and doesn't appear.
 *
 * Grouped by the week each one has to finish in, so the page answers "what is
 * this week?" before it answers anything else. Every row opens the same
 * TaskDetailModal every other task list in the app uses — a screen telling
 * you a task is behind schedule with no way to act on it was the whole
 * complaint.
 */
export function ProjectTimeline({ tasks, schedule, dueDate, today }: Props) {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const { membersById } = useProject();
  const checkpoints = tasks
    .filter((t) => schedule.byTaskId[t.id]?.isCheckpoint)
    .sort((a, b) => schedule.byTaskId[a.id].latestFinish.getTime() - schedule.byTaskId[b.id].latestFinish.getTime());

  if (checkpoints.length === 0) {
    return (
      <View style={styles.card}>
        <View style={styles.emptyRow}>
          <Icon name="documentAlert" size={18} color={colors.faint} strokeWidth={1.8} />
          <Text style={[type.caption, styles.emptyText]}>
            Checkpoints show up once tasks depend on each other — this project doesn't have any dependencies yet.
          </Text>
        </View>
      </View>
    );
  }

  const week = weekDates(today);
  const weekEnd = new Date(week[6].getFullYear(), week[6].getMonth(), week[6].getDate() + 1).getTime();
  const nextWeekEnd = weekEnd + 7 * 24 * 60 * 60 * 1000;
  const groups: Group[] = [];
  for (const task of checkpoints) {
    const finish = schedule.byTaskId[task.id].latestFinish.getTime();
    // Anything already past its date belongs to this week: it is the thing to do now.
    const label = finish < weekEnd ? 'This week' : finish < nextWeekEnd ? 'Next week' : 'Later';
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.tasks.push(task);
    else groups.push({ label, tasks: [task] });
  }

  return (
    <>
      <View style={styles.shadow}>
        <View style={styles.card}>
          <View style={styles.spine} />
          {groups.map((group) => (
            <View key={group.label}>
              <Text style={[type.metadata, styles.groupLabel]}>{group.label.toUpperCase()}</Text>
              {group.tasks.map((task) => {
                const s = schedule.byTaskId[task.id];
                const met = task.status === 'completed';
                const atRisk = s.atRisk;
                const assignee = task.assigneeId ? membersById[task.assigneeId] : undefined;
                return (
                  <Pressable
                    key={task.id}
                    onPress={() => setOpenTaskId(task.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${task.title}`}
                    style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
                  >
                    <View style={[styles.dot, met && styles.dotMet, atRisk && !met && styles.dotRisk]}>
                      {met ? <Icon name="check" size={11} color={colors.onInk} strokeWidth={3.2} /> : null}
                    </View>
                    <View style={styles.stepBody}>
                      <Text style={[type.taskTitle, met ? styles.stepDone : styles.stepLabel]} numberOfLines={2}>
                        {task.title}
                      </Text>
                      <Text
                        style={[type.caption, atRisk && !met ? styles.stepRisk : !assignee && !met ? styles.stepRisk : styles.stepMeta]}
                      >
                        {met
                          ? 'Done'
                          : atRisk
                            ? 'Behind schedule'
                            : !assignee
                              ? 'Nobody yet'
                              : `By ${formatShortDate(s.latestFinish, today)}${
                                  s.blocks.length > 0 ? ` · unblocks ${s.blocks.length}` : ''
                                }`}
                      </Text>
                    </View>
                    {assignee ? (
                      <Avatar initials={assignee.initials} bg={assignee.bg} fg={assignee.fg} size={30} />
                    ) : (
                      <View style={styles.nobody}>
                        <Icon name="plus" size={12} color={colors.faint} strokeWidth={2} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}

          <View style={styles.endRow}>
            <View style={styles.flag}>
              <Icon name="flag" size={11} color={colors.onInk} strokeWidth={2} fill={colors.onInk} />
            </View>
            <Text style={[type.button, styles.endLabel]}>Due {formatDueDate(dueDate, today)}</Text>
          </View>
        </View>
      </View>

      <TaskDetailModal taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    shadowColor: '#1C1633',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.06)',
  },
  spine: {
    position: 'absolute',
    left: SPINE_LEFT,
    top: 44,
    bottom: 40,
    width: 1.5,
    backgroundColor: colors.border,
  },
  groupLabel: {
    color: colors.muted,
    letterSpacing: 0.6,
    paddingTop: 12,
    paddingBottom: 2,
    paddingLeft: 34,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    minHeight: 44,
  },
  stepPressed: {
    opacity: 0.6,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotMet: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  // Amber, not red: this is one checkpoint past its own safe-start window,
  // not the project itself missing its deadline — that stronger, rarer
  // signal already has its own banner above this card.
  dotRisk: {
    borderColor: colors.amber,
  },
  stepBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  stepLabel: {
    color: colors.ink,
  },
  stepDone: {
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  stepMeta: {
    color: colors.muted,
  },
  stepRisk: {
    color: colors.yellowText,
    fontFamily: type.body.fontFamily,
  },
  nobody: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C9C5D3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  flag: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endLabel: {
    color: colors.ink,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 8,
  },
  emptyText: {
    flex: 1,
    color: colors.muted,
  },
});
