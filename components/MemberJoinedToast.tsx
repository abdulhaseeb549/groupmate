import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Member } from '../data/member';
import { colors, radius, type } from '../theme';

const VISIBLE_MS = 4200;

type Props = {
  /** The member who just arrived, or null when nothing is showing. */
  member: Member | null;
  onDismiss: () => void;
  /** Optional — when given, the toast becomes tappable and takes you to their conversation. */
  onOpenChat?: (member: Member) => void;
};

/**
 * The signal that someone joined your project. Before this existed, a join
 * was completely silent: the roster was fetched once at mount, so a
 * teammate could join, message you, and never appear anywhere until you
 * force-quit the app (see migration 0017).
 *
 * Mint rather than purple — this reports something that happened, and
 * purple is reserved for things you can act on. The one action here (open
 * their chat) is the whole surface rather than a button competing with the
 * text.
 */
export function MemberJoinedToast({ member, onDismiss, onOpenChat }: Props) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(-1)).current;
  // Held so the exit animation still has someone to render after `member`
  // goes null — otherwise the toast vanishes instantly instead of leaving.
  const shown = useRef<Member | null>(null);
  if (member) shown.current = member;

  useEffect(() => {
    if (member) {
      Animated.timing(slide, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }).start();
      const timer = setTimeout(onDismiss, VISIBLE_MS);
      return () => clearTimeout(timer);
    }
    Animated.timing(slide, {
      toValue: -1,
      duration: 220,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [member]);

  const current = member ?? shown.current;
  if (!current) return null;

  const firstName = current.name.split(' ')[0];

  return (
    <Animated.View
      pointerEvents={member ? 'box-none' : 'none'}
      style={[
        styles.wrap,
        {
          top: Math.max(insets.top, 12) + 8,
          opacity: slide.interpolate({ inputRange: [-1, 0], outputRange: [0, 1] }),
          transform: [{ translateY: slide.interpolate({ inputRange: [-1, 0], outputRange: [-24, 0] }) }],
        },
      ]}
    >
      <Pressable
        onPress={() => {
          if (onOpenChat) onOpenChat(current);
          onDismiss();
        }}
        accessibilityRole={onOpenChat ? 'button' : 'alert'}
        accessibilityLabel={`${current.name} joined the project`}
        style={({ pressed }) => [styles.toast, pressed && onOpenChat && styles.pressed]}
      >
        <Avatar {...current} size={34} />
        <View style={styles.text}>
          <Text style={[type.taskTitle, styles.ink]} numberOfLines={1}>
            {firstName} joined
          </Text>
          <Text style={[type.caption, styles.muted]} numberOfLines={1}>
            {onOpenChat ? 'Tap to say hi' : 'They can see the plan and claim tasks'}
          </Text>
        </View>
        {onOpenChat ? <Icon name="chevronRight" size={16} color={colors.faint} strokeWidth={2} /> : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 40,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.card,
    backgroundColor: colors.mint,
    // Sits over scrolling content, so it needs its own separation from the
    // page rather than relying on a background contrast that may not exist.
    shadowColor: '#1C1633',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  pressed: {
    opacity: 0.82,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  ink: {
    color: colors.ink,
  },
  muted: {
    color: colors.mintText,
  },
});
