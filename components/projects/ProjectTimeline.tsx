import { StyleSheet, Text, View } from 'react-native';
import { Icon } from '../Icon';
import { RequirementState } from '../../state/projectState';
import { colors, type } from '../../theme';
import { formatDueDate } from '../../utils/dates';

type Props = {
  requirementStates: RequirementState[];
  dueDate: string;
  today: Date;
};

const DOT = 18;

/** A real-data timeline, not a fabricated Gantt — requirements in their actual order between today and the actual due date, each colored by its real status. No invented per-task dates. */
export function ProjectTimeline({ requirementStates, dueDate, today }: Props) {
  return (
    <View style={styles.card}>
      <Text style={[type.metadata, styles.endpoint]}>TODAY</Text>

      <View style={styles.stepsWrap}>
        <View style={styles.spine} />
        {requirementStates.map((state) => {
          const met = state.status === 'met';
          const inProgress = state.status === 'in_progress';
          return (
            <View key={state.requirement.id} style={styles.step}>
              <View style={[styles.dot, met && styles.dotMet, inProgress && styles.dotProgress]}>
                {met ? <Icon name="check" size={10} color={colors.onInk} strokeWidth={3} /> : null}
              </View>
              <View style={styles.stepBody}>
                <Text style={[type.body, styles.stepLabel]} numberOfLines={2}>
                  {state.requirement.label}
                </Text>
                <Text style={[type.caption, styles.stepStatus]}>{statusText(state)}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <Text style={[type.metadata, styles.endpoint]}>DUE {formatDueDate(dueDate, today).toUpperCase()}</Text>
    </View>
  );
}

function statusText(state: RequirementState): string {
  if (state.status === 'met') return 'Met';
  if (state.linkedTasks.length === 0) return 'No task linked yet';
  if (state.status === 'not_started') return 'Not started';
  const done = state.linkedTasks.length - state.blockingTasks.length;
  return `${done} of ${state.linkedTasks.length} tasks done`;
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
  dotProgress: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
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
});
