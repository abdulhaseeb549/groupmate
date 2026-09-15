import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { TEAM, TEAM_ORDER } from '../data/team';
import { useProject } from '../state/ProjectRepository';
import { colors, type } from '../theme';

const STEP = 0.5;
const MIN_HOURS = 0.5;
const MAX_HOURS = 8;

/** Formats 2 as "2h", 1.5 as "1.5h" — no trailing zero. */
function formatHours(hours: number): string {
  return `${Number(hours.toFixed(1))}h`;
}

/**
 * Per-teammate daily capacity, the other input (alongside task effort) the
 * Timeline's backward-scheduling algorithm needs. Taps persist immediately —
 * same fire-and-forget pattern as reassigning a task or checking one off,
 * not a separate save step.
 */
export function CapacityEditor() {
  const { project, updateMemberHoursPerDay } = useProject();

  return (
    <View style={styles.container}>
      {TEAM_ORDER.map((memberId) => {
        const member = TEAM[memberId];
        const hours = project.memberHoursPerDay[memberId] ?? 2;
        return (
          <View key={memberId} style={styles.row}>
            <Avatar {...member} size={32} />
            <Text style={[type.taskTitle, styles.name]} numberOfLines={1}>
              {member.name}
            </Text>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => updateMemberHoursPerDay(memberId, Math.max(MIN_HOURS, hours - STEP))}
                disabled={hours <= MIN_HOURS}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Decrease ${member.name}'s hours per day`}
                style={[styles.stepButton, hours <= MIN_HOURS && styles.stepButtonDisabled]}
              >
                <Icon name="minus" size={14} color={colors.ink} strokeWidth={2.4} />
              </Pressable>
              <Text style={[type.button, styles.value]}>{formatHours(hours)}/day</Text>
              <Pressable
                onPress={() => updateMemberHoursPerDay(memberId, Math.min(MAX_HOURS, hours + STEP))}
                disabled={hours >= MAX_HOURS}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Increase ${member.name}'s hours per day`}
                style={[styles.stepButton, hours >= MAX_HOURS && styles.stepButtonDisabled]}
              >
                <Icon name="plus" size={14} color={colors.ink} strokeWidth={2.4} />
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
  },
  name: {
    flex: 1,
    color: colors.ink,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonDisabled: {
    opacity: 0.4,
  },
  value: {
    color: colors.ink,
    minWidth: 62,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
