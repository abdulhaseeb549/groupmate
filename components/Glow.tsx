import { useId } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

type Props = {
  /** Size of the painted box. */
  width: number;
  height: number;
  /** Ellipse centre inside the box, in px. Defaults to the middle. */
  cx?: number;
  cy?: number;
  /** Ellipse radii in px. Defaults to closest-side (half the box). */
  rx?: number;
  ry?: number;
  /** Peak opacity of the purple at the centre. */
  opacity: number;
  /** Where the purple has faded to nothing, 0-1 along the radius. */
  fadeAt?: number;
  /** RGB of the glow. The boards use #8468F0. */
  color?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The boards' soft purple radial washes (`.wash` on GSignIn, `.glow` behind
 * the mascot). React Native has no CSS radial-gradient everywhere, so it is
 * drawn as one SVG rect with a radial gradient, which renders the same on
 * iOS, Android and web. Decorative: never takes touches.
 */
export function Glow({ width, height, cx, cy, rx, ry, opacity, fadeAt = 1, color = '#8468F0', style }: Props) {
  const id = `glow${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const x = cx ?? width / 2;
  const y = cy ?? height / 2;
  const rX = rx ?? width / 2;
  const rY = ry ?? height / 2;
  return (
    <View pointerEvents="none" style={[{ width, height }, style]}>
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient
            id={id}
            gradientUnits="userSpaceOnUse"
            cx={0}
            cy={0}
            r={1}
            gradientTransform={`translate(${x} ${y}) scale(${rX} ${rY})`}
          >
            <Stop offset={0} stopColor={color} stopOpacity={opacity} />
            <Stop offset={fadeAt} stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
