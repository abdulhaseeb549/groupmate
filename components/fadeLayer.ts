import { Platform, ViewStyle } from 'react-native';

/**
 * Android draws an `elevation` shadow as a filled shape UNDER the view, and
 * it does not fade with the view. So while a card is half transparent (mid
 * fade-in, or dimmed) that whole shadow shows through it as a grey box.
 *
 * The cure is to paint the fading subtree into one offscreen layer first
 * (cards and their shadows, all opaque) and fade the layer as a whole.
 * Spread `fadeLayer` on the Animated.View that carries the opacity.
 *
 * An offscreen layer is cut at the view's own edges, which would clip the
 * shadows of cards that reach those edges. `shadowRoom` gives the layer
 * extra room on every side and takes it straight back with padding, so
 * layout doesn't move. Only use it on a wrapper with no margins of its own.
 */
export const fadeLayer =
  Platform.OS === 'android' ? { needsOffscreenAlphaCompositing: true, renderToHardwareTextureAndroid: true } : {};

export function shadowRoom(room = 24): ViewStyle | null {
  return Platform.OS === 'android' ? { margin: -room, padding: room } : null;
}

/** Views that are themselves shadowed cards can't use a layer for their own shadow: fade them on iOS/web only. */
export const canFadeShadowed = Platform.OS !== 'android';
