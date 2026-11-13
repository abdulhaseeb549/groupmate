import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../Icon';
import { colors, type } from '../../theme';

type Props = {
  /** How many quizzes the student has made; 0 = nothing to review yet. */
  quizCount: number;
  onStart: () => void;
};

/**
 * Board PToday "5-min review". Until spaced review ships (daily-use Phase 2),
 * it opens Study, where the student picks a quiz to go over. It never shows
 * a streak or a question count it can't back up.
 */
export function ReviewCard({ quizCount, onStart }: Props) {
  const sub = quizCount > 0 ? `${quizCount} ${quizCount === 1 ? 'quiz' : 'quizzes'} to go over` : 'Make a quiz from your notes';
  return (
    <Pressable
      onPress={onStart}
      accessibilityRole="button"
      accessibilityLabel={`Start 5-minute review. ${sub}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.tile}>
        <Icon name="review" size={20} color={colors.mintText} strokeWidth={1.9} />
      </View>
      <View style={styles.body}>
        <Text style={styles.t}>5-min review</Text>
        <Text style={styles.m} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <View style={styles.start}>
        <Text style={styles.startText}>Start</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 14,
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.06)',
    shadowColor: '#1C1633',
    shadowOpacity: 0.06,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  // Shrinks instead of fading: a faded shadowed card shows a grey box on Android.
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 1,
  },
  t: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  m: {
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  start: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.purpleSoft,
    justifyContent: 'center',
  },
  startText: {
    fontFamily: type.button.fontFamily,
    fontSize: 14,
    color: colors.purple,
  },
});
