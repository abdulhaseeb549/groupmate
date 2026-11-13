import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { fadeLayer, shadowRoom } from './fadeLayer';

type Props = {
  children: ReactNode;
  /** Milliseconds to wait before starting — stagger a screen's sections by passing increasing values. */
  delay?: number;
};

const DURATION = 240;
const LIFT = 12;
const ROOM = shadowRoom();

/**
 * Fades and lifts a section into place on mount. Screens are swapped by
 * ProjectTabs rather than by a navigator, so they mount fresh on every tab
 * change — which means staggering a screen's sections through this reads
 * as a page transition without needing the bottom nav (rendered inside
 * each screen) to animate along with it and flicker.
 *
 * Opacity and transform only, so it stays on the native driver. On Android
 * the section fades as one layer while it animates (see fadeLayer.ts), so
 * card shadows don't show through as grey boxes; the layer is dropped once
 * the fade is done.
 */
export function FadeIn({ children, delay = 0 }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION,
      delay,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setSettled(true);
    });
    return () => animation.stop();
  }, [progress, delay]);

  return (
    <Animated.View
      {...(settled ? null : fadeLayer)}
      style={[
        ROOM,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [LIFT, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
