import { TextStyle } from 'react-native';

// Custom fonts can't be synthesized into other weights, so each role points at its weight file directly.
const family = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semiBold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
} as const;

// Cabinet Grotesk, and only at the top of the hierarchy — the two roles
// above 24px. One typeface doing hero, body, metadata and nav labels is
// what made this read as flat: everything spoke in the same voice at
// different sizes. A display face is the cheapest way to give the top of
// a screen its own voice, and it has to stay off the small sizes, where
// its tighter apertures and higher contrast cost legibility and Manrope
// is already the better tool.
//
// Licensed free for commercial use in apps (Fontshare / Indian Type
// Foundry EULA, bundled at assets/fonts). Bundled rather than fetched —
// a title that reflows on first paint is worse than no display face.
const display = {
  bold: 'CabinetGrotesk-Bold',
  extraBold: 'CabinetGrotesk-Extrabold',
} as const;

type Role = Pick<TextStyle, 'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing'>;

// Weights: 400 reserved for fine print (captions, metadata) · 500 is the
// workhorse — body copy, labels, list-item titles, so reading text doesn't
// look thin on mobile while a busy list still doesn't read as a wall of bold ·
// 600 reserved for section headings, metrics, and actions — things that should
// visibly lead their section · 700 hero & page titles only, one per screen.
// Bold is scarce on purpose: if everything is emphasized, nothing is.
export const type = {
  // Display sizes carry more negative tracking and tighter leading than
  // the text sizes below: letterfit that reads as generous at 15px reads
  // as loose at 30, and a display face set on text leading looks unset.
  hero: { fontFamily: display.extraBold, fontSize: 30, lineHeight: 33, letterSpacing: -0.9 },
  pageTitle: { fontFamily: display.bold, fontSize: 28, lineHeight: 31, letterSpacing: -0.7 },
  sectionHeading: { fontFamily: family.semiBold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  statNumber: { fontFamily: family.semiBold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  projectTitle: { fontFamily: family.semiBold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  greeting: { fontFamily: family.medium, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  taskTitle: { fontFamily: family.medium, fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  body: { fontFamily: family.medium, fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  subtitle: { fontFamily: family.medium, fontSize: 14, lineHeight: 20, letterSpacing: 0 },
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

/** Local display faces, loaded alongside Manrope in App.tsx. Keys must match the fontFamily strings above. */
export const displayFonts = {
  'CabinetGrotesk-Bold': require('../assets/fonts/CabinetGrotesk-Bold.ttf'),
  'CabinetGrotesk-Extrabold': require('../assets/fonts/CabinetGrotesk-Extrabold.ttf'),
};
