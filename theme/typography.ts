import { TextStyle } from 'react-native';

// Custom fonts can't be synthesized into other weights, so each role points at its weight file directly.
// Manrope carries headings (hero, titles, section leads); Poppins carries
// everything you actually read — body copy, list rows, buttons, labels.
// Two families on purpose: Poppins reads friendlier and heavier at body
// sizes than Manrope's own regular/medium did, without pushing every role
// into a bolder weight the way just bumping Manrope's weight would.
const manrope = {
  medium: 'Manrope_500Medium',
  semiBold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
} as const;

const poppins = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semiBold: 'Poppins_600SemiBold',
} as const;

type Role = Pick<TextStyle, 'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing'>;

// Weights: 400 reserved for fine print (captions) · 500 is the workhorse —
// body copy, labels, list-item titles · 600 reserved for section headings,
// metrics, and actions — things that should visibly lead their section ·
// 700 hero & page titles only, one per screen. Bold is scarce on purpose:
// if everything is emphasized, nothing is.
export const type = {
  hero: { fontFamily: manrope.bold, fontSize: 30, lineHeight: 34, letterSpacing: -0.6 },
  pageTitle: { fontFamily: manrope.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  sectionHeading: { fontFamily: manrope.semiBold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  statNumber: { fontFamily: manrope.semiBold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  projectTitle: { fontFamily: manrope.semiBold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  greeting: { fontFamily: manrope.medium, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  taskTitle: { fontFamily: poppins.medium, fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  body: { fontFamily: poppins.medium, fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  subtitle: { fontFamily: poppins.medium, fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  button: { fontFamily: poppins.semiBold, fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  caption: { fontFamily: poppins.regular, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  percent: { fontFamily: poppins.medium, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  badge: { fontFamily: poppins.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  metadata: { fontFamily: poppins.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  category: { fontFamily: poppins.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  avatarInitials: { fontFamily: poppins.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  statLabel: { fontFamily: poppins.medium, fontSize: 11, lineHeight: 15, letterSpacing: 0 },
  tinyLabel: { fontFamily: poppins.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0 },
  navigation: { fontFamily: poppins.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0 },
  navigationActive: { fontFamily: poppins.semiBold, fontSize: 11, lineHeight: 14, letterSpacing: 0 },
} satisfies Record<string, Role>;

export { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
export { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold } from '@expo-google-fonts/poppins';
