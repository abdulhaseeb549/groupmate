import { TextStyle } from 'react-native';

// Custom fonts can't be synthesized into other weights, so each role points at its weight file directly.
const family = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semiBold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
} as const;

type Role = Pick<TextStyle, 'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing'>;

// Weights: 400 body & supporting text (the default — most text on screen) ·
// 500 labels & list-item titles, so a busy list doesn't read as a wall of bold ·
// 600 reserved for section headings, metrics, and actions — things that should
// visibly lead their section · 700 hero & page titles only, one per screen.
// Bold is scarce on purpose: if everything is emphasized, nothing is.
export const type = {
  hero: { fontFamily: family.bold, fontSize: 30, lineHeight: 34, letterSpacing: -0.6 },
  pageTitle: { fontFamily: family.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  sectionHeading: { fontFamily: family.semiBold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  statNumber: { fontFamily: family.semiBold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  projectTitle: { fontFamily: family.semiBold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  greeting: { fontFamily: family.medium, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  taskTitle: { fontFamily: family.medium, fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  body: { fontFamily: family.regular, fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  subtitle: { fontFamily: family.regular, fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  button: { fontFamily: family.semiBold, fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  caption: { fontFamily: family.regular, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  percent: { fontFamily: family.medium, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  badge: { fontFamily: family.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  metadata: { fontFamily: family.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  category: { fontFamily: family.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  avatarInitials: { fontFamily: family.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  statLabel: { fontFamily: family.medium, fontSize: 11, lineHeight: 15, letterSpacing: 0 },
  tinyLabel: { fontFamily: family.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0 },
  navigation: { fontFamily: family.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0 },
  navigationActive: { fontFamily: family.semiBold, fontSize: 11, lineHeight: 14, letterSpacing: 0 },
} satisfies Record<string, Role>;

export {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
