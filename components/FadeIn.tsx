import { ReactNode, useEffect, useRef } from 'react';
import { Animated } from 'react-native';

type Props = {
  children: ReactNode;
  /** Milliseconds to wait before starting — stagger a screen's sections by passing increasing values. */
  delay?: number;
};

const DURATION = 240;
const LIFT = 12;

/**
 * Fades and lifts a section into place on mount. Screens are swapped by
 * ProjectTabs rather than by a navigator, so they mount fresh on every tab
 * change — which means staggering a screen's sections through this reads
 * as a page transition without needing the bottom nav (rendered inside
 * each screen) to animate along with it and flicker.
 *
 * Opacity and transform only, so it stays on the native driver.
 */
export function FadeIn({ children, delay = 0 }: Props) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION,
      delay,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, delay]);

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [LIFT, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}
