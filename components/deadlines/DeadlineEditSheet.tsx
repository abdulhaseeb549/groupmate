import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientButton } from '../GradientButton';
import { Sheet } from '../Sheet';
import { addDaysYmd, DraftDeadline, formatClock, formatDay, fromYmd, KIND_LABEL, KINDS, ymd } from '../../state/deadlines';
import { colors, type } from '../../theme';

type Props = {
  draft: DraftDeadline | null;
  today: Date;
  onChange: (patch: Partial<DraftDeadline>) => void;
  onClose: () => void;
};

const TIMES = ['09:00', '10:00', '12:00', '14:00', '17:00', '23:59'];
const DAYS_AHEAD = 45;
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Fix one found deadline: the day (a strip of the next weeks), an optional
 * time, the subject and the kind. No date-picker dependency: a strip of
 * days is faster to tap than a calendar for "this week / next week", which
 * is nearly every college deadline.
 */
export function DeadlineEditSheet({ draft, today, onChange, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const start = ymd(today);
  const days = useMemo(() => {
    const list = Array.from({ length: DAYS_AHEAD }, (_, i) => addDaysYmd(start, i));
    // A day the AI found further out (or in the past week) stays pickable.
    if (draft?.dueOn && !list.includes(draft.dueOn)) list.unshift(draft.dueOn);
    return list;
  }, [start, draft?.dueOn]);

  const times = draft?.dueTime && !TIMES.includes(draft.dueTime) ? [...TIMES, draft.dueTime].sort() : TIMES;

  return (
    <Sheet visible={draft !== null} onClose={onClose}>
      {draft ? (
        <View style={{ paddingBottom: Math.max(insets.bottom, 0) + 24 }}>
          <View style={styles.head}>
            <Text style={styles.h2} accessibilityRole="header">
              When is it due?
            </Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
            // Opens on the chosen day, with one day of context to its left.
            contentOffset={{ x: Math.max(0, (draft.dueOn ? days.indexOf(draft.dueOn) : 0) - 1) * 66, y: 0 }}
          >
            {days.map((d) => {
              const on = d === draft.dueOn;
              const date = fromYmd(d);
              const near = formatDay(d, today);
              const label = near === 'Today' || near === 'Tomorrow' ? near : near.slice(0, 3);
              return (
                <Pressable
                  key={d}
                  onPress={() => onChange({ dueOn: d })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={formatDay(d, today, true)}
                  style={[styles.day, on && styles.dayOn]}
                >
                  <Text style={[styles.dayTop, on && styles.onText]}>{label}</Text>
                  <Text style={[styles.dayNum, on && styles.onText]}>{date.getDate()}</Text>
                  <Text style={[styles.dayTop, on && styles.onText]}>{MONTH[date.getMonth()]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.section}>
            <Text style={styles.label}>Time</Text>
            <View style={styles.wrap}>
              <Choice label="Any time" on={!draft.dueTime} onPress={() => onChange({ dueTime: null })} />
              {times.map((t) => (
                <Choice key={t} label={formatClock(t)} on={draft.dueTime === t} onPress={() => onChange({ dueTime: t })} />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Subject</Text>
            <TextInput
              value={draft.course ?? ''}
              onChangeText={(t) => onChange({ course: t ? t : null })}
              placeholder="DBMS, Maths…"
              placeholderTextColor={colors.faint}
              style={styles.input}
              maxLength={80}
              accessibilityLabel="Subject"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Type</Text>
            <View style={styles.wrap}>
              {KINDS.map((k) => (
                <Choice key={k} label={KIND_LABEL[k]} on={draft.kind === k} onPress={() => onChange({ kind: k })} />
              ))}
            </View>
          </View>

          <View style={styles.done}>
            <GradientButton label={draft.dueOn ? 'Done' : 'Pick a day'} onPress={onClose} disabled={!draft.dueOn} />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

function Choice({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.choice, on && styles.choiceOn]}
    >
      <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: {
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  h2: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.6,
    color: colors.ink,
  },
  strip: {
    paddingHorizontal: 20,
    gap: 8,
  },
  day: {
    width: 58,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(21,21,26,0.05)',
    alignItems: 'center',
    gap: 2,
  },
  dayOn: {
    backgroundColor: colors.purple,
  },
  dayTop: {
    fontFamily: type.metadata.fontFamily,
    fontSize: 11,
    lineHeight: 14,
    color: colors.muted,
  },
  dayNum: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 22,
    lineHeight: 26,
    color: colors.ink,
  },
  onText: {
    color: '#FFFFFF',
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 8,
  },
  label: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  choice: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(21,21,26,0.05)',
    justifyContent: 'center',
  },
  choiceOn: {
    backgroundColor: colors.purpleSoft,
  },
  choiceText: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 13,
    color: colors.ink,
  },
  choiceTextOn: {
    fontFamily: type.button.fontFamily,
    color: colors.purple,
  },
  input: {
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(21,21,26,0.04)',
    paddingHorizontal: 14,
    fontFamily: type.body.fontFamily,
    fontSize: 15,
    color: colors.ink,
  },
  done: {
    paddingHorizontal: 20,
    paddingTop: 22,
  },
});
