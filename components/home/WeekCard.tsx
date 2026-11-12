import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { WeekStrip, weekDates } from './WeekStrip';
import { colors, radius, type } from '../../theme';

type Props = {
  today: Date;
  /** Seven entries, Monday-first, aligned with weekDates(): how many of your open tasks land on each day. */
  counts: number[];
  /** Your unfinished tasks. */
  openCount: number;
  /** Your tasks finished since Monday. */
  doneThisWeek: number;
  /** Open tasks flagged urgent. */
  urgentCount: number;
  /** Summed effort estimate of your open tasks, in hours. 0 when none are estimated. */
  hours: number;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Past this many, single segments get too thin to read as steps, so the meter
// keeps 12 and fills them in proportion.
const MAX_SEGMENTS = 12;

/**
 * The top of Home: one card that says how your week looks, in a sentence,
 * before it says it in numbers. The sentence comes first because "a steady
 * week" is what you actually want to know when you open the app; the meter
 * and the days are there to back it up, not to be decoded.
 *
 * The lavender wash is the palette's pale purple (context), not the action
 * purple — the only saturated marks in here are the meter's done steps and
 * today's circle, both small.
 */
export function WeekCard({ today, counts, openCount, doneThisWeek, urgentCount, hours }: Props) {
  const { headline, detail } = describeWeek(openCount, doneThisWeek, urgentCount, hours);
  const total = openCount + doneThisWeek;
  const segments = Math.min(total, MAX_SEGMENTS);
  const filled = total <= MAX_SEGMENTS ? doneThisWeek : Math.round((doneThisWeek / total) * MAX_SEGMENTS);

  return (
    <View>
      <View style={styles.shadow}>
        <View style={styles.card}>
          <LinearGradient
            colors={[colors.purpleSoft, colors.surface]}
            start={{ x: 1, y: 0 }}
            end={{ x: 0.35, y: 0.8 }}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.text}>
            <View style={styles.eyebrowRow}>
              <Text style={[type.metadata, styles.eyebrow]}>THIS WEEK</Text>
              <Text style={[type.metadata, styles.muted]}>{weekRange(today)}</Text>
            </View>
            <Text style={[type.hero, styles.heroSize, styles.ink]} accessibilityRole="header">
              {headline}
            </Text>
            <Text style={[type.subtitle, styles.muted]}>{detail}</Text>
          </View>

          {segments > 0 ? (
            <View
              style={styles.meterRow}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={`${doneThisWeek} of ${total} tasks done this week`}
            >
              <View style={styles.meter}>
                {Array.from({ length: segments }, (_, i) => (
                  <View key={i} style={[styles.segment, i < filled && styles.segmentDone]} />
                ))}
              </View>
              <Text style={[type.caption, styles.count]}>
                <Text style={styles.ink}>{doneThisWeek}</Text>
                <Text style={styles.muted}>/{total}</Text>
              </Text>
            </View>
          ) : null}

          <View style={styles.divider} />
          <WeekStrip today={today} counts={counts} showHeader={false} />
        </View>
      </View>

    </View>
  );
}

/** The week in words. Numbers lead; labels stay to a word or two. */
export function describeWeek(open: number, done: number, urgent: number, hours: number) {
  const roundedHours = Math.round(hours);
  const tasks = `${open} ${open === 1 ? 'task' : 'tasks'}`;
  const detail = roundedHours > 0 ? `${tasks} · ${roundedHours} h` : tasks;

  if (open === 0) {
    return {
      headline: 'All caught up',
      detail: done > 0 ? `You finished ${done} this week.` : 'New tasks for you will show up here.',
    };
  }
  if (urgent > 0) {
    return { headline: urgent === 1 ? '1 urgent task' : `${urgent} urgent tasks`, detail };
  }
  if (roundedHours === 0) return { headline: open === 1 ? '1 task to do' : `${open} tasks to do`, detail: 'No time estimates yet' };
  if (roundedHours <= 4) return { headline: 'A light week', detail };
  if (roundedHours <= 12) return { headline: 'A steady week', detail };
  return { headline: 'A full week', detail };
}

function weekRange(today: Date) {
  const days = weekDates(today);
  const first = days[0];
  const last = days[6];
  return first.getMonth() === last.getMonth()
    ? `${first.getDate()}–${last.getDate()} ${MONTHS[last.getMonth()]}`
    : `${first.getDate()} ${MONTHS[first.getMonth()]} – ${last.getDate()} ${MONTHS[last.getMonth()]}`;
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    shadowColor: '#1C1633',
    shadowOpacity: 0.09,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  card: {
    borderRadius: radius.card,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.05)',
    padding: 20,
    gap: 16,
  },
  text: {
    gap: 6,
  },
  heroSize: {
    fontSize: 36,
    lineHeight: 38,
    letterSpacing: -1.1,
  },
  eyebrowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  eyebrow: {
    color: colors.muted,
    letterSpacing: 0.6,
  },
  ink: {
    color: colors.ink,
  },
  muted: {
    color: colors.muted,
  },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  meter: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  count: {
    fontVariant: ['tabular-nums'],
  },
  segment: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.track,
  },
  segmentDone: {
    backgroundColor: colors.purple,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
