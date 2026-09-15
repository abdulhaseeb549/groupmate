import { StyleSheet, Text, View } from 'react-native';
import { Icon } from '../Icon';
import { Task } from '../../data/tasks';
import { ProjectSchedule } from '../../state/projectSchedule';
import { colors, type } from '../../theme';
import { formatDueDate, formatShortDate } from '../../utils/dates';

type Props = {
  tasks: Task[];
  schedule: ProjectSchedule;
  dueDate: string;
  today: Date;
};

const DOT = 18;

/**
 * Checkpoints, not a fabricated Gantt chart: every dot here is a real task
 * that at least one other task actually depends on, placed at the real
 * date the backward-scheduling algorithm computed from effort hours +
 * capacity + the dependency graph — never an invented per-task deadline.
 * A task with no dependents isn't a checkpoint and doesn't appear.
 */
export function ProjectTimeline({ tasks, schedule, dueDate, today }: Props) {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
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

  return (
    <View style={styles.card}>
      <Text style={[type.metadata, styles.endpoint]}>TODAY</Text>

      <View style={styles.stepsWrap}>
        <View style={styles.spine} />
        {checkpoints.map((task) => {
          const s = schedule.byTaskId[task.id];
          const met = task.done;
          const atRisk = s.atRisk;
          return (
            <View key={task.id} style={styles.step}>
              <View style={[styles.dot, met && styles.dotMet, atRisk && styles.dotRisk]}>
                {met ? <Icon name="check" size={10} color={colors.onInk} strokeWidth={3} /> : null}
              </View>
              <View style={styles.stepBody}>
                <Text style={[type.body, styles.stepLabel]} numberOfLines={2}>
                  {task.title}
                </Text>
                <Text style={[type.caption, atRisk ? styles.stepRisk : styles.stepStatus]}>
                  {met
                    ? 'Done'
                    : atRisk
                      ? `Should already be underway to stay on track`
                      : `By ${formatShortDate(s.latestFinish, today)}`}
                  {s.blocks.length > 0 ? ` · unblocks ${s.blocks.join(', ')}` : ''}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <Text style={[type.metadata, styles.endpoint]}>DUE {formatDueDate(dueDate, today).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 16,
    gap: 10,
  },
  endpoint: {
    color: colors.faint,
    letterSpacing: 0.5,
  },
  stepsWrap: {
    position: 'relative',
  },
  spine: {
    position: 'absolute',
    left: DOT / 2 - 1,
    top: DOT / 2,
    bottom: DOT / 2,
    width: 2,
    backgroundColor: colors.border,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotMet: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  dotRisk: {
    backgroundColor: colors.red,
    borderColor: colors.red,
  },
  stepBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
    marginTop: -1,
  },
  stepLabel: {
    color: colors.ink,
  },
  stepStatus: {
    color: colors.muted,
  },
  stepRisk: {
    color: colors.redText,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  emptyText: {
    flex: 1,
    color: colors.muted,
  },
});
