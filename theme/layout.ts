export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
} as const;

// Three radii, not the seven that had accumulated (12, 14, 16, 18, 20,
// 22, 24 were all in use for card-like surfaces). Corner radius is read
// comparatively: a 20 next to a 22 does not look intentional, it looks
// like nobody decided. Anything below `control` is a detail — a progress
// segment, a dot — and stays a literal at its use site.
export const radius = {
  // Both values are the ones already most used, not new ones: the point
  // is to remove the outliers around them, not to restyle every surface
  // in the app on the way past.
  /** Every card-like surface: panels, sheets, feature cards. */
  card: 22,
  /** Buttons, inputs, and anything else you press or type into. */
  control: 16,
  pill: 999,
  nav: 37,
} as const;

export const layout = {
  screenPadding: 20,

  // The vertical beat between a screen's sections. Every screen had its
  // own before this — 28, 22, 20, 18 and 12 across seven screens — so
  // switching tabs changed the rhythm under you. One value, on the 4pt
  // grid, sitting between the airiest and tightest of those.
  sectionGap: 24,

  // Card interiors. Two sizes, because a feature card genuinely wants
  // more room than a list row, and eight did not.
  cardPadding: 16,
  cardPaddingLg: 20,

  /** Between elements stacked inside one card. */
  cardGap: 12,

  // A 20px box plus hitSlop={12} makes a 44px touch target.
  checkboxSize: 20,

  quickActionHeight: 87,
  quickActionGap: 13,
  quickActionIconSize: 42,

  navHeight: 60,
  navSideMargin: 20,
  createButtonSize: 46,

  avatarHeader: 44,
  avatarOverlap: 10,

  pillHeight: 24,
  pillRadius: 12,

  iconTile: 42,
  iconTileRadius: 13,

  progressBarHeight: 6,
} as const;
