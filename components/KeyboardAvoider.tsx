import { ReactNode } from 'react';
import { KeyboardAvoidingView, StyleProp, ViewStyle } from 'react-native';

/**
 * Keeps the focused field above the keyboard — "padding" on both platforms,
 * not the usual iOS-only ternary.
 *
 * Android used to get this for free: the window resized under adjustResize,
 * so a shrinking ScrollView scrolled the focused input into view on its own
 * and `behavior={undefined}` was the right call. With edge-to-edge (the
 * default since Expo SDK 52) the app draws behind the IME and the window
 * stops resizing, so that same `undefined` meant no keyboard handling at
 * all — the password field on the sign-in screen sat underneath the
 * keyboard. Every screen with a text input goes through here so the
 * decision lives in one place rather than being re-made six times.
 */
export function KeyboardAvoider({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={style} behavior="padding">
      {children}
    </KeyboardAvoidingView>
  );
}
