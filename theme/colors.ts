// Warm neutral foundation. Purple is the product identity. Mint means healthy.
// Amber means attention. Coral means urgency. Black carries information.
// Everything else stays quiet.
export const colors = {
  bg: '#FAF9F7',
  surface: '#FFFFFF',
  // Neutral chips and pressed rows.
  surfaceMuted: '#F5F2FF',
  border: '#ECEAF0',
  // Progress track on the pale purple project card.
  track: '#DED5FB',

  ink: '#15151A',
  // The palette's #77748A, darkened just enough to clear 4.5:1 on bg and on purpleSoft.
  muted: '#6A6780',
  // Decorative only (chevrons, placeholders): fails 4.5:1 as text.
  faint: '#9D99A6',
  // Unchecked checkbox border — lighter greys fail the 3:1 minimum for form controls.
  control: '#8E899C',
  onInk: '#FAFAFA',

  // Action: active nav, progress, primary buttons, links, checkmarks. Not for large text.
  purple: '#6C4CE8',
  // Context: the project card, selected tabs, subtle emphasis.
  purpleSoft: '#F0ECFF',

  // Each status hue comes as the mark itself, a pale background, and a darker
  // shade for text — the marks alone are too light to pass 4.5:1 as text.
  // Healthy / on track / done.
  green: '#20A875',
  mint: '#EAF8F2',
  mintText: '#147A52',
  // Attention / medium priority.
  amber: '#E9A321',
  yellowSoft: '#FFF7E5',
  yellowText: '#9A6400',
  // Urgency only: due today, overdue, blocked.
  red: '#E95B57',
  redSoft: '#FFF0EF',
  redText: '#C4403B',
} as const;

// Reserved for the create and send buttons, so they stay the only glossy surfaces.
export const gradients = {
  purpleDeep: ['#8468F0', '#5836D6'] as const,
  sheen: ['rgba(255,255,255,0.4)', 'rgba(255,255,255,0)'] as const,
} as const;

/** Soft ambient halo behind the raised create button — not a hard ring. */
export const purpleHalo = 'rgba(108,76,232,0.16)';

export type Colors = typeof colors;
