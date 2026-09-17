import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/**
 * Makes the Android hardware/gesture back button do the same thing as a
 * screen's own on-screen back arrow, instead of falling through to the
 * default "exit the app" behavior. Needed only for full-screen views that
 * swap in without going through React Navigation or RN's <Modal> (which
 * already gets this for free via onRequestClose) — NewProjectScreen, an
 * open chat conversation, and Study's setup/quiz/results phases.
 */
export function useHardwareBackHandler(onBack: () => void, active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [active, onBack]);
}
