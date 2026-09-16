import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../Icon';
import { TaskDetailModal } from '../TaskDetailModal';
import { Task } from '../../data/tasks';
import { ProjectSchedule } from '../../state/projectSchedule';
import { colors, radius, type } from '../../theme';
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
 *
 * Every row opens the same TaskDetailModal every other task list in the
 * app uses (owned locally, same as DistributionEditor) — a screen telling
 * you a task is behind schedule with no way to act on it was the whole
 * complaint. "See you're behind" and "do something about it" were two
 * different screens before this.
 */
export function ProjectTimeline({ tasks, schedule, dueDate, today }: Props) {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
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
    <>
      <View style={styles.card}>
        <Text style={[type.metadata, styles.endpoint]}>TODAY</Text>

        <View style={styles.stepsWrap}>
          <View style={styles.spine} />
          {checkpoints.map((task) => {
            const s = schedule.byTaskId[task.id];
            const met = task.status === 'completed';
            const atRisk = s.atRisk;
            return (
              <Pressable
                key={task.id}
                onPress={() => setOpenTaskId(task.id)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${task.title}`}
                style={({ pressed }) => [styles.step, !met && styles.stepPending, pressed && styles.stepPressed]}
              >
                <View style={[styles.dot, met && styles.dotMet, atRisk && styles.dotRisk]}>
                  {met ? <Icon name="check" size={10} color={colors.onInk} strokeWidth={3} /> : null}
                </View>
                <View style={styles.stepBody}>
                  <Text style={[type.body, styles.stepLabel]} numberOfLines={2}>
                    {task.title}
                  </Text>
                  <View style={styles.statusRow}>
                    {met ? (
                      <Text style={[type.caption, styles.stepStatus]}>Done</Text>
                    ) : atRisk ? (
                      <View style={styles.statusItem}>
                        <Icon name="clock" size={12} color={colors.yellowText} strokeWidth={2} />
                        <Text style={[type.caption, styles.stepRisk]}>Behind schedule</Text>
                      </View>
                    ) : (
                      <View style={styles.statusItem}>
                        <Icon name="calendar" size={12} color={colors.muted} strokeWidth={1.8} />
                        <Text style={[type.caption, styles.stepStatus]}>By {formatShortDate(s.latestFinish, today)}</Text>
                      </View>
                    )}
                    {s.blocks.length > 0 ? (
                      <View style={styles.statusItem}>
                        <Icon name="chevronRight" size={12} color={colors.faint} strokeWidth={2} />
                        <Text style={[type.caption, styles.stepStatus]}>
                          Unblocks {s.blocks.length} {s.blocks.length === 1 ? 'task' : 'tasks'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Icon name="chevronRight" size={16} color={colors.faint} strokeWidth={2} />
              </Pressable>
            );
          })}
        </View>

        <Text style={[type.metadata, styles.endpoint]}>DUE {formatDueDate(dueDate, today).toUpperCase()}</Text>
      </View>

      <TaskDetailModal taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
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
  stepPressed: {
    opacity: 0.6,
  },
  // Only the completed checkpoint stays at full strength — everything still
  // ahead recedes, so progress reads as a single dark trail through a faded rest.
  stepPending: {
    opacity: 0.5,
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
    // Sits a hair off — this dot marks a point on the spine, not the row's
    // own vertical centre, and the row grew a second line under the title
    // once status moved from text to an icon+label row.
    marginTop: 2,
  },
  dotMet: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  // Amber, not red: this is one checkpoint past its own safe-start window,
  // not the project itself missing its deadline — that stronger, rarer
  // signal already has its own red banner above this card (ProjectsScreen's
  // scheduleWarning). Every at-risk row painting the same red it does
  // compounded into a wall of red down the whole timeline the moment a
  // project fell behind on more than one thing at once.
  dotRisk: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  stepBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    marginTop: -1,
  },
  stepLabel: {
    color: colors.ink,
  },
  // Icon + short label per fact, wrapping onto its own line rather than one
  // long sentence — "Should already be underway to stay on track · unblocks
  // Research the overview, Develop key equations, +2 more" was the whole
  // complaint: a full paragraph of coloured text repeated under every row.
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepStatus: {
    color: colors.muted,
  },
  stepRisk: {
    color: colors.yellowText,
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
