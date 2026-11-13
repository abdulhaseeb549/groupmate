import { useRef, useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, CardDivider } from '../Card';
import { Icon } from '../Icon';
import { DueItem, duePill, dueTone } from '../../state/today';
import { colors, layout, type } from '../../theme';

type Props = {
  items: DueItem[];
  today: Date;
  onComplete: (item: DueItem) => void;
  onAdd: () => void;
};

const PILL = {
  late: { bg: colors.redSoft, fg: colors.redText },
  soon: { bg: colors.yellowSoft, fg: colors.yellowText },
  later: { bg: 'rgba(21,21,26,0.05)', fg: colors.muted },
} as const;

/**
 * Board PToday "Due soon": deadlines and your own group tasks, one list,
 * most urgent first. Ticking a row finishes it (a task is marked complete,
 * a deadline is ticked off for you).
 */
export function DueSoon({ items, today, onComplete, onAdd }: Props) {
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.lead} accessibilityRole="header">
          Due soon
        </Text>
        <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel="Add a deadline" style={styles.link} hitSlop={6}>
          <Icon name="plus" size={16} color={colors.purple} strokeWidth={2.2} />
          <Text style={styles.linkText}>Add</Text>
        </Pressable>
      </View>
      <Card>
        {items.length === 0 ? (
          <Pressable onPress={onAdd} accessibilityRole="button" style={styles.empty}>
            <View style={styles.emptyTile}>
              <Icon name="check" size={18} color={colors.mintText} strokeWidth={2.4} />
            </View>
            <View style={styles.body}>
              <Text style={styles.t}>Nothing due in the next few days</Text>
              <Text style={styles.m}>Got a date in a WhatsApp message? Add it here.</Text>
            </View>
          </Pressable>
        ) : (
          items.map((item, i) => (
            <View key={item.key}>
              {i > 0 ? <CardDivider inset={DIVIDER_INSET} /> : null}
              <DueRow item={item} today={today} onComplete={() => onComplete(item)} />
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

const DIVIDER_INSET = 16 + layout.checkboxSize + 12;

function DueRow({ item, today, onComplete }: { item: DueItem; today: Date; onComplete: () => void }) {
  const [ticked, setTicked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tone = PILL[dueTone(item.days)];

  function tick() {
    if (ticked) return;
    setTicked(true);
    // A beat so the tick registers before the row leaves the list.
    timer.current = setTimeout(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      onComplete();
    }, 260);
  }

  return (
    <View style={styles.row}>
      <Pressable
        onPress={tick}
        hitSlop={12}
        accessibilityRole="checkbox"
        aria-checked={ticked}
        accessibilityLabel={`Mark ${item.title} as done`}
        style={[styles.check, ticked && styles.checkOn]}
      >
        {ticked ? <Icon name="check" size={13} color={colors.onInk} strokeWidth={2.6} /> : null}
      </Pressable>
      <View style={styles.body}>
        <Text style={[styles.t, ticked && styles.tDone]} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.subRow}>
          {item.dot ? (
            <View style={[styles.dot, { backgroundColor: item.dot }]} />
          ) : (
            <Icon name="team" size={13} color={colors.muted} strokeWidth={2} />
          )}
          <Text style={styles.m} numberOfLines={1}>
            {item.sub}
          </Text>
        </View>
      </View>
      <View style={[styles.pill, { backgroundColor: tone.bg }]}>
        <Text style={[styles.pillText, { color: tone.fg }]}>{duePill(item, today)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lead: {
    fontFamily: type.sectionHeading.fontFamily,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.2,
    color: colors.ink,
  },
  link: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkText: {
    fontFamily: type.button.fontFamily,
    fontSize: 14,
    color: colors.purple,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  check: {
    width: layout.checkboxSize,
    height: layout.checkboxSize,
    borderRadius: layout.checkboxSize / 2,
    borderWidth: 1.5,
    borderColor: colors.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkOn: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  t: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  tDone: {
    color: colors.faint,
    textDecorationLine: 'line-through',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  m: {
    flexShrink: 1,
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  pill: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 12,
    justifyContent: 'center',
  },
  pillText: {
    fontFamily: type.badge.fontFamily,
    fontSize: 12,
  },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  emptyTile: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
