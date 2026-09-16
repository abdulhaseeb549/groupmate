import Svg, { Path } from 'react-native-svg';

/** Google's four-colour G. Its own component rather than an Icon entry because Icon draws a single-colour stroke path, and Google's mark has to keep its brand colours. */
export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M23.06 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h6.19c-.27 1.44-1.08 2.66-2.3 3.48v2.89h3.72c2.18-2 3.45-4.96 3.45-8.38z"
      />
      <Path
        fill="#34A853"
        d="M12 23.5c3.11 0 5.72-1.03 7.63-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.91 1.1-3 0-5.55-2.03-6.46-4.76H1.69v2.98C3.59 20.92 7.5 23.5 12 23.5z"
      />
      <Path
        fill="#FBBC05"
        d="M5.54 14.16c-.23-.69-.36-1.42-.36-2.16s.13-1.47.36-2.16V6.86H1.69C.93 8.38.5 10.14.5 12s.43 3.62 1.19 5.14l3.85-2.98z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.08c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.71 1.63 15.1.5 12 .5 7.5.5 3.59 3.08 1.69 6.86l3.85 2.98C6.45 7.11 9 5.08 12 5.08z"
      />
    </Svg>
  );
}
