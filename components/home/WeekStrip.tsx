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
 * tappable-looking day that does nothing is worse than a plain one — which
 * is also why no day carries a card of its own. Seven bordered, filled
 * boxes in a row read as seven objects competing with the real cards above
 * and below; the strip is one object, so only today is marked.
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
              style={styles.day}
              accessible
              accessibilityLabel={`${date.toDateString()}${count > 0 ? `, ${count} due` : ''}${isToday ? ', today' : ''}`}
            >
              <Text style={[type.tinyLabel, styles.letter]}>{DAY_LETTERS[i]}</Text>
              <View style={[styles.number, isToday && styles.numberToday]}>
                <Text style={[type.projectTitle, isToday ? styles.numToday : styles.num]}>{date.getDate()}</Text>
              </View>
              <View style={styles.dotSlot}>
                {count > 0 ? <View style={styles.dot} /> : null}
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
  },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  letter: {
    color: colors.faint,
  },
  // The number leads, not the letter: at 14px against an 11px label there
  // was no hierarchy and the row read as one flat texture.
  number: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The brand colour, which is also the platform convention for today (iOS
  // Calendar marks it with the tint, not with black). The earlier objection
  // to purple here was really an objection to its area: the old version
  // filled a 66px box, and a saturated block that size for a fact about the
  // calendar did outweigh everything around it. At 34px it reads as a mark
  // rather than a surface, and ink at this contrast was simply heavier than
  // the one thing it is pointing at deserves.
  numberToday: {
    backgroundColor: colors.purple,
  },
  num: {
    color: colors.ink,
  },
  numToday: {
    color: colors.onInk,
  },
  // Fixed-height slot so a day with a deadline dot doesn't sit taller than one without.
  dotSlot: {
    height: 6,
    justifyContent: 'center',
  },
  // Amber, the palette's "needs attention" — a deadline is a status, and
  // this is the one thing in the strip actually worth looking at.
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.amber,
  },
});
