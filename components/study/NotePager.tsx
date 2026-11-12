import { useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../Icon';
import { NotePage } from '../../state/studyQuiz';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, type } from '../../theme';

type Props = {
  pages: NotePage[];
  /** The Study screen's preview: two points per card. */
  compact?: boolean;
  /** Board GNotes: the full-screen reader, big card filling the space, 56px arrows. */
  full?: boolean;
  /** Tap on the card (preview only) — opens the full reader. */
  onOpen?: () => void;
  /** Tells the parent which card is showing (the reader's "2 / 6"). */
  onIndexChange?: (index: number) => void;
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
export function NotePager({ pages, compact = false, full = false, onOpen, onIndexChange }: Props) {
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
      onIndexChange?.(next);
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

  const cardBody = (
    <>
      <Text style={styles.eyebrow} numberOfLines={1}>
        {page.eyebrow}
      </Text>
      <Text style={full ? styles.headingFull : styles.heading} numberOfLines={full ? 4 : 3}>
        {page.heading}
      </Text>
      {full ? <View style={styles.hair} /> : null}
      <View style={full ? styles.pointsFull : styles.points}>
        {points.map((point, p) => (
          <View key={p} style={full ? styles.pointRowFull : styles.pointRow}>
            <View style={full ? styles.bulletFull : styles.bullet} />
            <Text style={full ? styles.pointTextFull : styles.pointText}>{point}</Text>
          </View>
        ))}
      </View>
    </>
  );

  if (full) {
    return (
      <View style={styles.fullOuter}>
        <View style={styles.fullStage}>
          {/* Neighbours sit back at the sides: there is one before / after. */}
          {index > 0 ? <View pointerEvents="none" style={[styles.card, styles.side, styles.sideLeft]} /> : null}
          {hasMore ? <View pointerEvents="none" style={[styles.card, styles.side, styles.sideRight]} /> : null}
          <Animated.View
            {...pan.panHandlers}
            style={[styles.card, styles.frontFull, { opacity: fade, transform: [{ translateX: shift }] }]}
          >
            {cardBody}
          </Animated.View>
        </View>
        <View style={styles.footer}>
          <View
            style={styles.progress}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={'Card ' + (index + 1) + ' of ' + pages.length}
          >
            {pages.map((_, i) => (
              <View key={i} style={[styles.seglet, i < index && styles.segletPast, i === index && styles.segletNow]} />
            ))}
          </View>
          <Pressable
            onPress={() => go(-1)}
            disabled={index === 0}
            accessibilityRole="button"
            accessibilityLabel="Previous pointer"
            style={({ pressed }) => [styles.bigArrow, styles.bigPrev, (pressed || index === 0) && styles.dimmed]}
          >
            <Icon name="chevronLeft" size={20} color={colors.ink} strokeWidth={2.2} />
          </Pressable>
          <Pressable
            onPress={() => go(1)}
            disabled={!hasMore}
            accessibilityRole="button"
            accessibilityLabel="Next pointer"
            style={({ pressed }) => [styles.bigNextShadow, (pressed || !hasMore) && styles.dimmed]}
          >
            <LinearGradient colors={gradients.purpleDeep} style={styles.bigArrow}>
              <Icon name="chevronRight" size={20} color="#FFFFFF" strokeWidth={2.2} />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.outer}>
      <View>
        {/* The next card, tucked behind: says "there is more". */}
        {hasMore ? <View pointerEvents="none" style={[styles.card, styles.peek]} /> : null}
        <Animated.View
          {...pan.panHandlers}
          style={[styles.card, styles.front, { opacity: fade, transform: [{ translateX: shift }] }]}
        >
          {onOpen ? (
            <Pressable
              onPress={onOpen}
              accessibilityRole="button"
              accessibilityLabel="Open points to remember"
              style={styles.frontInner}
            >
              {cardBody}
            </Pressable>
          ) : (
            cardBody
          )}
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
  frontInner: {
    gap: 12,
  },
  fullOuter: {
    flex: 1,
    gap: 20,
  },
  fullStage: {
    flex: 1,
    marginHorizontal: 10,
  },
  side: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '100%',
    opacity: 0.5,
    transform: [{ scale: 0.94 }],
  },
  sideLeft: {
    left: '-104%',
  },
  sideRight: {
    left: '104%',
  },
  frontFull: {
    flex: 1,
    paddingVertical: 28,
    paddingHorizontal: 24,
    gap: 18,
  },
  headingFull: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 32,
    lineHeight: 35,
    letterSpacing: -0.9,
    color: colors.ink,
  },
  hair: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  pointsFull: {
    gap: 16,
  },
  pointRowFull: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  bulletFull: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.purple,
    marginTop: 8,
  },
  pointTextFull: {
    flex: 1,
    fontFamily: type.caption.fontFamily,
    fontSize: 16,
    lineHeight: 23,
    color: '#3C3A47',
  },
  segletPast: {
    backgroundColor: '#B9A9F5',
  },
  bigArrow: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigPrev: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bigNextShadow: {
    borderRadius: 28,
    shadowColor: '#5836D6',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
    backgroundColor: colors.purple,
  },
  dimmed: {
    opacity: 0.45,
  },
  arrowPressed: {
    transform: [{ scale: 0.94 }],
  },
});
