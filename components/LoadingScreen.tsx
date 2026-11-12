import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

const ICON = require('../assets/icon.png');

/**
 * Shown only on a first load with nothing cached (opening the app normally
 * starts from the cached project, see ProjectRepository). The app icon,
 * breathing slowly, with a slim bar under it — it reads as the splash
 * continuing rather than as a stuck spinner.
 */
export function LoadingScreen() {
  const breathe = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const b = Animated.loop(
      Animated.timing(slide, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
    );
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [breathe, slide]);

  return (
    <View style={styles.screen} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <Animated.View
        style={[
          styles.iconShadow,
          { transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] },
        ]}
      >
        <Image source={ICON} style={styles.icon} />
      </Animated.View>
      <View style={styles.track}>
        <Animated.View
          style={[styles.fill, { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-48, 120] }) }] }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
  },
  iconShadow: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: colors.surface,
    shadowColor: '#5836D6',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  icon: {
    width: 76,
    height: 76,
    borderRadius: 22,
  },
  track: {
    width: 120,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  fill: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.purple,
  },
});
