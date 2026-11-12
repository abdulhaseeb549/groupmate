import { useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../Icon';
import { NotePage } from '../../state/studyQuiz';
import { colors, radius, type } from '../../theme';

type Props = {
  pages: NotePage[];
  /** The Study screen's preview: two points per card. Full when opened on its own. */
  compact?: boolean;
};

// How far a card slides when it leaves or arrives, and how far a finger has
// to drag before a swipe counts.
const SLIDE = 36;
const SWIPE = 40;

/**
 * Points to remember (board GStudy): one flashcard at a time, the next card
 * peeking out behind it, a segment per card and two round arrows.
 *
 * A stack rather than a horizontal pager: the board shows a single
 * full-width card with the next one tucked BEHIND it, which a pager can't
 * draw. Swipe or tap an arrow; the card slides and fades out, the next one
 * slides in from the other side. Native driver throughout.
 */
export function NotePager({ pages, compact = false }: Props) {
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  indexRef.current = index;
  const shift = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const busy = useRef(false);

  function settle() {
    Animated.spring(shift, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
  }

  function go(delta: number) {
    const next = indexRef.current + delta;
    if (busy.current || next < 0 || next >= pages.length) {
      settle();
      return;
    }
    busy.current = true;
    Animated.parallel([
      Animated.timing(shift, { toValue: -delta * SLIDE, duration: 130, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0, duration: 130, useNativeDriver: true }),
    ]).start(() => {
      setIndex(next);
      shift.setValue(delta * SLIDE);
      Animated.parallel([
        Animated.timing(shift, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        busy.current = false;
      });
    });
  }
  const goRef = useRef(go);
  goRef.current = go;

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        if (!busy.current) shift.setValue(g.dx * 0.6);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -SWIPE) goRef.current(1);
        else if (g.dx >= SWIPE) goRef.current(-1);
        else settle();
      },
      onPanResponderTerminate: () => settle(),
    })
  ).current;

  if (pages.length === 0) return null;
  const page = pages[Math.min(index, pages.length - 1)];
  const points = compact ? page.points.slice(0, 2) : page.points;
  const hasMore = index < pages.length - 1;

  return (
    <View style={styles.outer}>
      <View>
        {/* The next card, tucked behind: says "there is more". */}
        {hasMore ? <View pointerEvents="none" style={[styles.card, styles.peek]} /> : null}
        <Animated.View
          {...pan.panHandlers}
          style={[styles.card, styles.front, { opacity: fade, transform: [{ translateX: shift }] }]}
        >
          <Text style={styles.eyebrow} numberOfLines={1}>
            {page.eyebrow}
          </Text>
          <Text style={styles.heading} numberOfLines={compact ? 3 : 5}>
            {page.heading}
          </Text>
          <View style={styles.points}>
            {points.map((point, p) => (
              <View key={p} style={styles.pointRow}>
                <View style={styles.bullet} />
                <Text style={styles.pointText}>{point}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <View
          style={styles.progress}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Card ${index + 1} of ${pages.length}`}
        >
          {pages.map((_, i) => (
            <View key={i} style={[styles.seglet, i === index && styles.segletNow]} />
          ))}
        </View>
        <Arrow name="chevronLeft" disabled={index === 0} onPress={() => go(-1)} label="Previous pointer" />
        <Arrow name="chevronRight" disabled={!hasMore} onPress={() => go(1)} label="Next pointer" emphasis />
      </View>
    </View>
  );
}

function Arrow({
  name,
  disabled,
  onPress,
  label,
  emphasis,
}: {
  name: 'chevronLeft' | 'chevronRight';
  disabled: boolean;
  onPress: () => void;
  label: string;
  emphasis?: boolean;
}) {
  const lit = emphasis && !disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.arrow,
        lit ? styles.arrowLit : styles.arrowQuiet,
        pressed && !disabled && styles.arrowPressed,
      ]}
    >
      <Icon name={name} size={18} color={disabled ? '#C9C6D1' : lit ? colors.purple : colors.muted} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    gap: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.06)',
    shadowColor: '#1C1633',
    shadowOpacity: 0.06,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  peek: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 10,
    bottom: -8,
    opacity: 0.55,
  },
  front: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 18,
    gap: 12,
  },
  eyebrow: {
    fontFamily: type.metadata.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.purple,
  },
  heading: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.5,
    color: colors.ink,
  },
  points: {
    gap: 8,
  },
  pointRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.purple,
    marginTop: 7,
  },
  pointText: {
    flex: 1,
    fontFamily: type.caption.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: '#3C3A47',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingTop: 4,
  },
  progress: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  seglet: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.track,
  },
  segletNow: {
    flex: 2.4,
    backgroundColor: colors.purple,
  },
  arrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowQuiet: {
    backgroundColor: 'rgba(21,21,26,0.04)',
  },
  arrowLit: {
    backgroundColor: colors.purpleSoft,
  },
  arrowPressed: {
    transform: [{ scale: 0.94 }],
  },
});
