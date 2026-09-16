import { useRef, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Icon } from '../Icon';
import { NotePage } from '../../state/studyQuiz';
import { colors, type } from '../../theme';

type Props = {
  pages: NotePage[];
  /** Renders one card at a reduced height for the Study screen's preview slot; full height when opened on its own. */
  compact?: boolean;
};

/**
 * The revision pointers, one topic per card, swiped through like a stack of
 * flashcards.
 *
 * Paged ScrollView rather than a FlatList: the set is capped at eight cards
 * by the Edge Function, so there is nothing to virtualise, and paging a
 * plain ScrollView keeps the arrows and the swipe driving the same
 * scrollTo. The arrows exist because a card stack with no affordance reads
 * as a single static card — the progress bar alone doesn't say "swipe".
 */
// Short and eased rather than a spring: this runs beside a scroll the
// finger is already driving, and a bouncing progress bar next to it
// reads as two different animations disagreeing.
const SEGMENT_ANIMATION = LayoutAnimation.create(
  180,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.scaleXY
);

export function NotePager({ pages, compact = false }: Props) {
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  // Drives the card motion straight off the scroll position, so a card
  // tracks the finger rather than snapping when the gesture ends.
  const scrollX = useRef(new Animated.Value(0)).current;

  function handleLayout(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width);
  }

  function handleScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width === 0) return;
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next === index) return;
    // The segments change size as well as colour, so the swap needs to
    // animate or it reads as a jump next to the card that just glided.
    LayoutAnimation.configureNext(SEGMENT_ANIMATION);
    setIndex(next);
  }

  function go(delta: number) {
    const next = Math.min(Math.max(index + delta, 0), pages.length - 1);
    if (next === index) return;
    LayoutAnimation.configureNext(SEGMENT_ANIMATION);
    setIndex(next);
    scroller.current?.scrollTo({ x: next * width, animated: true });
  }

  if (pages.length === 0) return null;

  return (
    <View style={styles.outer}>
      <Animated.ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
        })}
        // Measured on the scroller, not the padded wrapper around it: a
        // wrapper measures its own padding too, which made every page 20px
        // wider than the viewport and drifted paging by that much per card.
        onLayout={handleLayout}
        // Without a measured width every page would collapse to its content.
        scrollEnabled={width > 0}
      >
        {/* Neighbours sit back slightly and dim, so the one you are on reads
            as the front of a stack. Transform and opacity only, so it all
            stays on the native driver. Skipped until a width is measured:
            the interpolation's input range has to be strictly increasing,
            and at width 0 it collapses to zeros. */}
        {pages.map((page, i) => (
            <Animated.View
              key={i}
              style={[
                styles.card,
                compact && styles.cardCompact,
                { width },
                width > 0 && {
                  transform: [
                    {
                      scale: scrollX.interpolate({
                        inputRange: [(i - 1) * width, i * width, (i + 1) * width],
                        outputRange: [0.93, 1, 0.93],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                  opacity: scrollX.interpolate({
                    inputRange: [(i - 1) * width, i * width, (i + 1) * width],
                    outputRange: [0.45, 1, 0.45],
                    extrapolate: 'clamp',
                  }),
                },
              ]}
            >
              <Text style={[type.metadata, styles.eyebrow]} numberOfLines={1}>
                {page.eyebrow}
              </Text>
              <Text style={[type.pageTitle, styles.heading]} numberOfLines={compact ? 3 : 4}>
                {page.heading}
              </Text>
              <View style={styles.points}>
                {page.points.slice(0, compact ? 2 : page.points.length).map((point, p) => (
                  <View key={p} style={styles.pointRow}>
                    <View style={styles.bullet} />
                    <Text style={[type.caption, styles.pointText]}>{point}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>
        ))}
      </Animated.ScrollView>

      <View style={styles.footer}>
        {/* Segments rather than dots: at eight cards dots stop reading as
            progress and start reading as decoration. */}
        <View style={styles.progress}>
          {pages.map((_, i) => (
            <View
              key={i}
              style={[
                styles.segment,
                i === index && styles.segmentActive,
                i < index && styles.segmentPassed,
              ]}
            />
          ))}
        </View>

        <View style={styles.arrows}>
          <Arrow name="chevronLeft" disabled={index === 0} onPress={() => go(-1)} label="Previous pointer" />
          <Arrow
            name="chevronRight"
            disabled={index === pages.length - 1}
            onPress={() => go(1)}
            label="Next pointer"
            emphasis
          />
        </View>
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
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.arrow,
        emphasis && styles.arrowEmphasis,
        disabled && styles.arrowDisabled,
        pressed && !disabled && styles.arrowPressed,
      ]}
    >
      <Icon
        name={name}
        size={16}
        color={disabled ? colors.faint : emphasis ? colors.purple : colors.muted}
        strokeWidth={2.2}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 10,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.06)',
  },
  card: {
    backgroundColor: colors.ink,
    borderRadius: 18,
    padding: 20,
    // A floor, not the height: cross-axis stretch raises every card to
    // the tallest, so this only matters when every card is short.
    minHeight: 250,
    justifyContent: 'flex-end',
    gap: 10,
  },
  cardCompact: {
    minHeight: 190,
    padding: 18,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.62)',
    letterSpacing: 0.8,
  },
  heading: {
    color: colors.onInk,
  },
  points: {
    gap: 7,
    marginTop: 2,
  },
  pointRow: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
  },
  bullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginTop: 7,
  },
  pointText: {
    flex: 1,
    color: 'rgba(255,255,255,0.8)',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingLeft: 6,
  },
  progress: {
    flexDirection: 'row',
    gap: 4,
    flex: 1,
  },
  segment: {
    height: 4,
    flex: 1,
    maxWidth: 26,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  segmentActive: {
    backgroundColor: colors.purple,
    maxWidth: 40,
  },
  segmentPassed: {
    backgroundColor: colors.purpleSoft,
  },
  arrows: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  arrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowEmphasis: {
    backgroundColor: colors.purpleSoft,
  },
  arrowDisabled: {
    opacity: 0.45,
  },
  arrowPressed: {
    opacity: 0.6,
  },
});
