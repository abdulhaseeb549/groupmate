import { StyleSheet, Text, View } from 'react-native';
import { colors, type } from '../../theme';

type Props = {
  today: Date;
  /** How many of your unfinished tasks must be done by each day, Monday-first. Seven entries, aligned with weekDates(). */
  counts: number[];
};

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Monday-first: this week's seven dates, starting from the Monday on or before `today`. */
export function weekDates(today: Date): Date[] {
  const mondayOffset = (today.getDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0, ...
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
}

/**
 * Where you are in the week, and which days actually have work landing on
 * them. The counts come from the real backward-scheduling engine
 * (projectSchedule's latestFinish — the last day a task can finish without
 * pushing the project past its due date), not from an invented per-task
 * deadline. Days are not pressable: there's no per-day view to open, and a
 * tappable-looking day that does nothing is worse than a plain one.
 */
export function WeekStrip({ today, counts }: Props) {
  const dates = weekDates(today);
  const total = counts.reduce((sum, n) => sum + n, 0);

  return (
    <View style={styles.section}>
      <View style={styles.labelRow}>
        <Text style={[type.metadata, styles.label]}>THIS WEEK</Text>
        <Text style={[type.caption, styles.muted]}>
          {total === 0 ? 'Nothing due' : `${total} ${total === 1 ? 'task due' : 'tasks due'}`}
        </Text>
      </View>
      <View style={styles.row}>
        {dates.map((date, i) => {
          const isToday = date.toDateString() === today.toDateString();
          const count = counts[i] ?? 0;
          return (
            <View
              key={i}
              style={[styles.pill, isToday && styles.pillActive]}
              accessible
              accessibilityLabel={`${date.toDateString()}${count > 0 ? `, ${count} due` : ''}${isToday ? ', today' : ''}`}
            >
              <Text style={[type.tinyLabel, isToday ? styles.letterActive : styles.letter]}>{DAY_LETTERS[i]}</Text>
              <Text style={[type.button, isToday ? styles.numActive : styles.num]}>{date.getDate()}</Text>
              <View style={styles.dotSlot}>
                {count > 0 ? <View style={[styles.dot, isToday && styles.dotActive]} /> : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    color: colors.muted,
    letterSpacing: 0.4,
  },
  muted: {
    color: colors.muted,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flex: 1,
    height: 66,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.06)',
  },
  pillActive: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  letter: {
    color: colors.faint,
  },
  letterActive: {
    color: 'rgba(255,255,255,0.7)',
  },
  num: {
    color: colors.ink,
  },
  numActive: {
    color: colors.onInk,
  },
  // Fixed-height slot so a day with a deadline dot doesn't sit taller than one without.
  dotSlot: {
    height: 6,
    justifyContent: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.purple,
  },
  dotActive: {
    backgroundColor: colors.onInk,
  },
});
