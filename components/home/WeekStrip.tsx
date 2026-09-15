import { StyleSheet, Text, View } from 'react-native';
import { colors, type } from '../../theme';

type Props = {
  today: Date;
};

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Monday-first: this week's 7 dates, today's index among them. */
function weekDates(today: Date): Date[] {
  const mondayOffset = (today.getDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0, ...
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
}

/**
 * A quiet week-at-a-glance strip — where you are in the week, nothing
 * more. No per-day data is plotted here (tasks only carry a display label
 * like "Due tomorrow", not a real calendar date, so there's nothing true
 * to show per day yet); the pills are deliberately not pressable so the
 * UI never implies a drill-down that doesn't exist.
 */
export function WeekStrip({ today }: Props) {
  const dates = weekDates(today);

  return (
    <View style={styles.section}>
      <Text style={[type.metadata, styles.label]}>THIS WEEK</Text>
      <View style={styles.row}>
        {dates.map((date, i) => {
          const isToday = date.toDateString() === today.toDateString();
          return (
            <View key={i} style={[styles.pill, isToday && styles.pillActive]}>
              <Text style={[type.tinyLabel, isToday ? styles.letterActive : styles.letter]}>{DAY_LETTERS[i]}</Text>
              <Text style={[type.button, isToday ? styles.numActive : styles.num]}>{date.getDate()}</Text>
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
  label: {
    color: colors.muted,
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flex: 1,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
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
});
