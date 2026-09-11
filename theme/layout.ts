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

export const radius = {
  cardXl: 24,
  cardLg: 20,
  button: 16,
  pill: 999,
  nav: 37,
} as const;

export const layout = {
  screenPadding: 20,

  // A 24px box plus hitSlop={10} makes a 44px touch target.
  checkboxSize: 24,

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
